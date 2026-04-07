import { ChildProcess, spawn, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import { BrowserVersionManager } from './browser-version-manager';
import { ProxyBridge } from './proxy-bridge';

export class ChromeLauncher {
  private processes: Map<string, ChildProcess> = new Map();
  private proxyBridges: Map<string, ProxyBridge> = new Map();
  private profilesBaseDir: string;
  private customChromePath: string | null = null;
  private browserVersionManager: BrowserVersionManager | null = null;

  constructor(profilesBaseDir: string) {
    this.profilesBaseDir = profilesBaseDir;
  }

  setBrowserVersionManager(manager: BrowserVersionManager): void {
    this.browserVersionManager = manager;
  }

  setChromePath(chromePath: string): void {
    this.customChromePath = chromePath;
  }

  getChromePath(): string {
    if (this.customChromePath) {
      return this.customChromePath;
    }
    return this.detectChromePath();
  }

  /**
   * Resolve the Chrome binary path based on a version string.
   * 'system' or undefined → use system Chrome (getChromePath)
   * '<version>' → use downloaded version via BrowserVersionManager
   */
  private resolveChromePath(browserVersion?: string): string {
    if (!browserVersion || browserVersion === 'system' || browserVersion === 'latest') {
      return this.getChromePath();
    }
    if (this.browserVersionManager) {
      const binaryPath = this.browserVersionManager.getChromeBinaryPath(browserVersion);
      if (fs.existsSync(binaryPath)) {
        return binaryPath;
      }
      console.warn(`Chrome version ${browserVersion} not found at ${binaryPath}, falling back to system`);
    }
    return this.getChromePath();
  }

  private detectChromePath(): string {
    const platform = os.platform();

    const possiblePaths: string[] = [];

    if (platform === 'win32') {
      possiblePaths.push(
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        // Chromium
        'C:\\Program Files\\Chromium\\Application\\chrome.exe',
        path.join(os.homedir(), 'AppData', 'Local', 'Chromium', 'Application', 'chrome.exe'),
      );
    } else if (platform === 'darwin') {
      possiblePaths.push(
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        path.join(os.homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
      );
    } else {
      // Linux
      possiblePaths.push(
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/snap/bin/chromium',
        '/usr/local/bin/google-chrome',
      );
    }

    for (const chromePath of possiblePaths) {
      if (fs.existsSync(chromePath)) {
        return chromePath;
      }
    }

    throw new Error(
      'Chrome/Chromium not found. Please install Chrome or set the path manually in Settings.'
    );
  }

  /**
   * Remove singleton lock files to prevent locking issues in multi-RDP sessions
   */
  private removeLockFiles(userDataDir: string): void {
    const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
    for (const file of lockFiles) {
      const lockPath = path.join(userDataDir, file);
      try {
        if (fs.existsSync(lockPath)) {
          fs.unlinkSync(lockPath);
        }
      } catch (err) {
        // Ignore errors - files may be locked by another process
        console.warn(`Could not remove lock file ${lockPath}:`, err);
      }
    }
  }

  /**
   * Write Chrome startup preferences to the Preferences file
   * restore_on_startup values:
   *   5 = Open the New Tab page
   *   1 = Continue where you left off
   *   4 = Open a specific page or set of pages
   */
  private writeStartupPreferences(
    userDataDir: string,
    startupType: string,
    startupUrls?: string
  ): void {
    const defaultDir = path.join(userDataDir, 'Default');
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true });
    }

    const prefsPath = path.join(defaultDir, 'Preferences');
    let prefs: any = {};

    // Read existing preferences if they exist
    try {
      if (fs.existsSync(prefsPath)) {
        prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'));
      }
    } catch {
      prefs = {};
    }

    // Ensure session object exists
    if (!prefs.session) prefs.session = {};

    switch (startupType) {
      case 'new_tab':
        prefs.session.restore_on_startup = 5;
        break;
      case 'continue':
        prefs.session.restore_on_startup = 1;
        break;
      case 'specific_pages':
        prefs.session.restore_on_startup = 4;
        if (startupUrls) {
          prefs.session.startup_urls = startupUrls
            .split('\n')
            .map((u: string) => u.trim())
            .filter((u: string) => u.length > 0);
        }
        break;
      default:
        prefs.session.restore_on_startup = 1;
    }

    // Mark exit as clean so Chrome restores tabs after being killed from another
    // RDP session (SIGTERM causes Chrome to write exit_type='Crashed' which
    // prevents automatic session restore)
    if (!prefs.profile) prefs.profile = {};
    prefs.profile.exit_type = 'Normal';
    prefs.profile.exited_cleanly = true;

    fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2), 'utf-8');
  }

  async launch(
    profileId: string,
    userDataDir: string,
    options: {
      proxyType?: string;
      proxyHost?: string;
      proxyPort?: number;
      proxyUser?: string;
      proxyPass?: string;
      startupUrl?: string;
      startupType?: string;
      startupUrls?: string;
      browserVersion?: string;
      fingerprintFlags?: Record<string, string>;
    } = {}
  ): Promise<ChildProcess> {
    // Check if already running
    if (this.processes.has(profileId)) {
      const existing = this.processes.get(profileId)!;
      // If it hasn't exited (exitCode is null) and wasn't manually killed
      if (existing.exitCode === null && !existing.killed) {
        throw new Error('Profile is already running');
      }
      this.processes.delete(profileId);
    }

    // Ensure user data dir exists
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    // Check if another Electron instance / RDP session already has this profile open
    if (ChromeLauncher.isProfileActuallyRunning(userDataDir)) {
      throw new Error('Profile is already running in another session');
    }

    // Write startup preferences to Chrome's Preferences file
    this.writeStartupPreferences(
      userDataDir,
      options.startupType || 'continue',
      options.startupUrls
    );

    // Detect CloakBrowser early to use different arg sets
    const isCloakBrowser = this.browserVersionManager?.isCloakBrowserVersion(options.browserVersion || '');
    let versionMismatch = false;

    if (isCloakBrowser) {
      const localStatePath = path.join(userDataDir, 'Local State');
      const defaultDir = path.join(userDataDir, 'Default');
      const cloakMajor = parseInt((options.browserVersion || '').replace(/^CloakBrowser\s*/i, '').split('.')[0], 10);

      if (cloakMajor && fs.existsSync(localStatePath)) {
        try {
          const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf-8'));
          const lastVersion = localState?.browser?.last_version || localState?.chrome?.last_version || '';
          const lastMajor = parseInt(lastVersion.split('.')[0], 10);
          if (lastMajor && lastMajor > cloakMajor) {
            console.log(`[ChromeLauncher] Version mismatch: profile was Chrome ${lastMajor}, CloakBrowser is ${cloakMajor}. Cleaning session data.`);
            versionMismatch = true;
          }
        } catch (err) {
          // Cannot parse Local State — don't wipe, let CloakBrowser handle it
          console.warn(`[ChromeLauncher] Could not parse Local State, skipping version check:`, err);
        }
      }

      if (versionMismatch) {
        // Only clean Sessions to prevent SIGTRAP from incompatible session data.
        // Do NOT delete Local State — removing it causes CloakBrowser to
        // re-initialize the entire profile, destroying cookies, history, and extensions.
        const sessionsDir = path.join(defaultDir, 'Sessions');
        if (fs.existsSync(sessionsDir)) {
          try {
            fs.rmSync(sessionsDir, { recursive: true, force: true });
            console.log(`[ChromeLauncher] Cleaned incompatible session data`);
          } catch (err) {
            console.warn(`[ChromeLauncher] Failed to clean Sessions: ${err}`);
          }
        }
      }

      // Always remove Sync Data when using CloakBrowser — Chrome Sync is disabled
      // anyway, and if the profile was touched by system Chrome (e.g. CDP cookie
      // export via Puppeteer), the Sync Data LevelDB will be in a newer format that
      // causes CloakBrowser to crash with SIGTRAP.
      const syncDataDir = path.join(userDataDir, 'Default', 'Sync Data');
      if (fs.existsSync(syncDataDir)) {
        try {
          fs.rmSync(syncDataDir, { recursive: true, force: true });
          console.log(`[ChromeLauncher] Cleaned Sync Data for CloakBrowser compatibility`);
        } catch (err) {
          console.warn(`[ChromeLauncher] Failed to clean Sync Data: ${err}`);
        }
      }
    }

    const chromePath = this.resolveChromePath(options.browserVersion);
    console.log(`[ChromeLauncher] Launching profile ${profileId} with Chrome: ${chromePath}`);
    console.log(`[ChromeLauncher] Browser version setting: ${options.browserVersion || 'system'}`);

    // Build browser arguments
    // CloakBrowser uses a minimal set - its patched Chromium is incompatible with
    // some standard Chrome flags when profiles were created by new Chrome versions.
    const args: string[] = [
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      // Use portable password storage so cookies/credentials are not tied
      // to the OS keychain (GNOME Keyring / KWallet / Keychain / DPAPI).
      // This makes profile data portable across machines.
      '--password-store=basic',
      '--use-mock-keychain',
    ];

    if (!isCloakBrowser) {
      // Standard Chrome flags - safe for Chrome/Chromium
      args.push(
        '--disable-background-networking',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--no-report-upload',
        '--disable-features=MediaRouter',
        '--disable-component-update',
        '--log-level=3',
        '--disable-logging',
      );
    }

    // Chrome for Testing binaries need --no-sandbox on Linux
    // and --disable-infobars to suppress the "Chrome for Testing" warning banner
    if (options.browserVersion && options.browserVersion !== 'system' && options.browserVersion !== 'latest') {
      args.push('--no-sandbox');
      args.push('--disable-infobars');
      args.push('--test-type');
    }

    // Scrub stuck proxy settings from Chromium Preferences
    try {
      const prefsPath = path.join(userDataDir, 'Default', 'Preferences');
      if (fs.existsSync(prefsPath)) {
        const prefsStr = fs.readFileSync(prefsPath, 'utf8');
        const prefsJson = JSON.parse(prefsStr);
        let modified = false;

        if (prefsJson && prefsJson.proxy) {
          delete prefsJson.proxy;
          modified = true;
        }

        // Scrub proxy overrides stored by extensions (e.g., from chrome.proxy API)
        if (prefsJson && prefsJson.extensions && prefsJson.extensions.settings) {
          for (const extId of Object.keys(prefsJson.extensions.settings)) {
            const ext = prefsJson.extensions.settings[extId];
            if (ext && ext.preferences && ext.preferences.proxy) {
              delete ext.preferences.proxy;
              modified = true;
            }
          }
        }

        if (modified) {
          fs.writeFileSync(prefsPath, JSON.stringify(prefsJson));
        }
      }
    } catch (e) {
      console.error('Failed to clean proxy Preferences:', e);
    }

    // Add proxy if configured
    let extensionPath: string | null = null;
    if (options.proxyHost && options.proxyPort) {
      const proxyType = options.proxyType || 'http';
      
      // Always wipe the old extension folder to guarantee no stale 'background.js' hijacks the proxy
      const defaultExtensionPath = path.join(userDataDir, 'proxy_auth_extension');
      if (fs.existsSync(defaultExtensionPath)) {
        try {
          fs.rmSync(defaultExtensionPath, { recursive: true, force: true });
        } catch (e) {
          console.error('Failed to scrub old proxy extension:', e);
        }
      }

      // If proxy needs auth (and is not SOCKS, since SOCKS auth is natively impossible in Chrome via extension anyway),
      // we use a rock-solid Local Proxy Bridge to completely eliminate the Chrome startup extension race condition.
      if (options.proxyUser && options.proxyPass && (proxyType === 'http' || proxyType === 'https' || !proxyType)) {
        const bridge = new ProxyBridge(options.proxyHost, options.proxyPort, options.proxyUser, options.proxyPass);
        const localPort = await bridge.start();
        this.proxyBridges.set(profileId, bridge);
        
        args.push(`--proxy-server=http://127.0.0.1:${localPort}`);
      } else {
        // Fallback to normal direct proxy if no auth is needed, or if it's SOCKS
        if (proxyType === 'socks5') {
          args.push(`--proxy-server=socks5://${options.proxyHost}:${options.proxyPort}`);
        } else if (proxyType === 'socks4') {
          args.push(`--proxy-server=socks4://${options.proxyHost}:${options.proxyPort}`);
        } else if (proxyType === 'https') {
          args.push(`--proxy-server=https://${options.proxyHost}:${options.proxyPort}`);
        } else {
          // Default to http
          args.push(`--proxy-server=http://${options.proxyHost}:${options.proxyPort}`);
        }
      }
    }

    // Add startup URL (only if not using specific_pages mode, which uses Preferences)
    if (options.startupUrl && options.startupType !== 'specific_pages') {
      args.push(options.startupUrl);
    }

    // Force session restore when startup type is 'continue'.
    // Skip for CloakBrowser when profile was previously used by a different Chrome version,
    // as incompatible session data causes SIGTRAP crash.
    if (!options.startupType || options.startupType === 'continue') {
      if (!isCloakBrowser || !versionMismatch) {
        args.push('--restore-last-session');
      }
    }

    if (isCloakBrowser) {

      const fp = options.fingerprintFlags || {};
      // Always set a fingerprint seed (random if not specified)
      const seed = fp.seed || crypto.randomInt(100000, 999999999).toString();
      args.push(`--fingerprint=${seed}`);

      // Optional fingerprint flags
      if (fp.platform) args.push(`--fingerprint-platform=${fp.platform}`);
      if (fp.gpuVendor) args.push(`--fingerprint-gpu-vendor=${fp.gpuVendor}`);
      if (fp.gpuRenderer) args.push(`--fingerprint-gpu-renderer=${fp.gpuRenderer}`);
      if (fp.hardwareConcurrency) args.push(`--fingerprint-hardware-concurrency=${fp.hardwareConcurrency}`);
      if (fp.deviceMemory) args.push(`--fingerprint-device-memory=${fp.deviceMemory}`);
      if (fp.screenWidth) args.push(`--fingerprint-screen-width=${fp.screenWidth}`);
      if (fp.screenHeight) args.push(`--fingerprint-screen-height=${fp.screenHeight}`);
      if (fp.timezone) args.push(`--fingerprint-timezone=${fp.timezone}`);
      if (fp.locale) args.push(`--fingerprint-locale=${fp.locale}`);
      if (fp.brand) args.push(`--fingerprint-brand=${fp.brand}`);
      if (fp.storageQuota) args.push(`--fingerprint-storage-quota=${fp.storageQuota}`);

      // WebRTC IP spoofing — prevent real IP leak when using a proxy.
      // If user set an explicit value, use that; otherwise auto-detect when proxy is configured.
      if (fp.webrtcIp) {
        args.push(`--fingerprint-webrtc-ip=${fp.webrtcIp}`);
      } else if (options.proxyHost && options.proxyPort) {
        args.push('--fingerprint-webrtc-ip=auto');
      }

      console.log(`[ChromeLauncher] CloakBrowser fingerprint seed: ${seed}`);
    }

    // Launch Chrome
    console.log(`[ChromeLauncher] Binary path: "${chromePath}"`);
    console.log(`[ChromeLauncher] Binary exists: ${fs.existsSync(chromePath)}`);
    console.log(`[ChromeLauncher] Args: ${JSON.stringify(args)}`);
    const child = spawn(chromePath, args, {
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    // Capture stderr for diagnostics
    if (child.stderr) {
      child.stderr.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) console.error(`[Chrome ${profileId}] ${msg}`);
      });
    }

    child.unref();
    this.processes.set(profileId, child);

    child.on('exit', (code) => {
      console.log(`[ChromeLauncher] Profile ${profileId} exited with code ${code}`);
      this.processes.delete(profileId);
      const bridge = this.proxyBridges.get(profileId);
      if (bridge) {
        bridge.stop();
        this.proxyBridges.delete(profileId);
      }
    });

    return child;
  }

  /**
   * Gracefully stop a Chrome process, giving it time to flush cookies/session.
   * - Linux/macOS: sends SIGINT (Chrome handles it like Ctrl+C → clean shutdown)
   * - Windows: uses taskkill without /F to send WM_CLOSE (graceful close)
   * Waits up to 5 seconds for Chrome to exit, then force kills.
   */
  async stop(profileId: string): Promise<boolean> {
    const proc = this.processes.get(profileId);
    if (!proc || proc.exitCode !== null || proc.killed) {
      this.processes.delete(profileId);
      return false;
    }

    const pid = proc.pid;
    console.log(`[ChromeLauncher] Gracefully stopping profile ${profileId} (PID: ${pid})`);

    try {
      if (process.platform === 'win32') {
        // Windows: taskkill without /F sends WM_CLOSE → graceful shutdown
        // /T kills the process tree (main + renderer processes)
        try {
          execSync(`taskkill /PID ${pid} /T`, { timeout: 2000, stdio: 'ignore' });
        } catch {
          // taskkill may fail if process already exiting; ignore
        }
      } else {
        // Linux/macOS: SIGINT triggers Chrome's graceful shutdown handler
        proc.kill('SIGINT');
      }

      // Wait for Chrome to exit gracefully (flush cookies, session data)
      const exited = await this.waitForExit(proc, 5000);

      if (!exited) {
        console.log(`[ChromeLauncher] Profile ${profileId} did not exit in time, force killing`);
        if (process.platform === 'win32') {
          try {
            execSync(`taskkill /PID ${pid} /T /F`, { timeout: 2000, stdio: 'ignore' });
          } catch { /* ignore */ }
        } else {
          try { proc.kill('SIGKILL'); } catch { /* ignore */ }
        }
      }
    } catch (err) {
      console.warn(`[ChromeLauncher] Error stopping profile ${profileId}:`, err);
      // Attempt force kill as last resort
      try { proc.kill('SIGKILL'); } catch { /* ignore */ }
    }

    this.processes.delete(profileId);
    
    const bridge = this.proxyBridges.get(profileId);
    if (bridge) {
      bridge.stop();
      this.proxyBridges.delete(profileId);
    }

    return true;
  }

  /**
   * Wait for a child process to exit within the given timeout.
   * Returns true if the process exited, false if timed out.
   */
  private waitForExit(proc: ChildProcess, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (proc.exitCode !== null || proc.killed) {
        resolve(true);
        return;
      }

      const timer = setTimeout(() => {
        proc.removeListener('exit', onExit);
        resolve(false);
      }, timeoutMs);

      const onExit = () => {
        clearTimeout(timer);
        resolve(true);
      };

      proc.once('exit', onExit);
    });
  }

  async stopAll(): Promise<void> {
    const stopPromises: Promise<boolean>[] = [];
    for (const [id] of this.processes) {
      stopPromises.push(this.stop(id));
    }
    await Promise.all(stopPromises);
    this.processes.clear();
  }

  isRunning(profileId: string): boolean {
    const process = this.processes.get(profileId);
    return !!process && process.exitCode === null && !process.killed;
  }

  getRunningProfiles(): string[] {
    const running: string[] = [];
    for (const [id, process] of this.processes) {
      if (process.exitCode === null && !process.killed) {
        running.push(id);
      } else {
        this.processes.delete(id);
      }
    }
    return running;
  }

  /**
   * Check if a Chrome profile is actually running by looking for lock files
   * and verifying the process is alive.
   * - Linux/macOS: SingletonLock symlink → "hostname-PID"
   * - Windows: lockfile in user data dir
   * Cleans up stale lock files from crashed/closed Chrome sessions.
   */
  static isProfileActuallyRunning(userDataDir: string): boolean {
    const platform = os.platform();

    if (platform === 'win32') {
      // Windows: Chrome creates a "lockfile" in the user data directory
      const lockfilePath = path.join(userDataDir, 'lockfile');
      try {
        // Try to open the lockfile exclusively — if Chrome is running,
        // the file will be locked and this will throw
        const fd = fs.openSync(lockfilePath, 'r+');
        // If we can open it, Chrome is NOT running (stale lockfile)
        fs.closeSync(fd);
        // Clean up stale lockfile
        try { fs.unlinkSync(lockfilePath); } catch { /* ignore */ }
        return false;
      } catch (err: any) {
        if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') {
          // File is locked by Chrome → Chrome is running
          return true;
        }
        if (err.code === 'ENOENT') {
          // lockfile doesn't exist → Chrome not running
          return false;
        }
        // Other error — assume not running
        return false;
      }
    } else {
      // Linux/macOS: SingletonLock is a symlink → "hostname-PID"
      const lockPath = path.join(userDataDir, 'SingletonLock');
      try {
        const stat = fs.lstatSync(lockPath);
        if (stat.isSymbolicLink()) {
          try {
            const linkTarget = fs.readlinkSync(lockPath);
            const pidMatch = linkTarget.match(/-(\d+)$/);
            if (pidMatch) {
              const pid = parseInt(pidMatch[1]);
              try {
                // Signal 0 checks if process exists without killing it
                process.kill(pid, 0);
                return true; // Process is alive
              } catch {
                // Process is dead — clean up stale lock
                console.log(`[ChromeLauncher] Cleaning up stale SingletonLock (PID ${pid} is dead)`);
                try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
                return false;
              }
            }
          } catch {
            // Can't read symlink — assume stale, clean up
            try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
            return false;
          }
        }
      } catch {
        // File doesn't exist = Chrome not running
      }
      return false;
    }
  }

  /**
   * Stop a Chrome process that was launched by another Electron instance / RDP session.
   * On Linux: reads PID from the SingletonLock symlink (format: "hostname-PID")
   * On Windows: uses taskkill to find Chrome process by --user-data-dir argument
   */
  static stopByLockFile(userDataDir: string): boolean {
    const lockPath = path.join(userDataDir, 'SingletonLock');
    const platform = os.platform();

    try {
      if (platform === 'win32') {
        // On Windows, find and kill Chrome by its command-line user-data-dir
        const { execSync } = require('child_process');
        try {
          const normalizedDir = userDataDir.replace(/\\/g, '\\\\');
          const result = execSync(
            `wmic process where "CommandLine like '%--user-data-dir=${normalizedDir}%'" get ProcessId /format:list`,
            { encoding: 'utf-8', timeout: 5000 }
          );
          const pids = result.match(/ProcessId=(\d+)/g);
          if (pids) {
            for (const pidStr of pids) {
              const pid = parseInt(pidStr.replace('ProcessId=', ''));
              if (pid > 0) {
                try { process.kill(pid, 'SIGTERM'); } catch { /* ignore */ }
              }
            }
          }
        } catch {
          // wmic may fail; ignore
        }
        // Clean up lock files on Windows
        for (const file of ['lockfile', 'SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
          try { fs.unlinkSync(path.join(userDataDir, file)); } catch { /* ignore */ }
        }
        return true;
      } else {
        // Linux/macOS: SingletonLock is a symlink pointing to "hostname-PID"
        const linkTarget = fs.readlinkSync(lockPath);
        const pidMatch = linkTarget.match(/-(\d+)$/);
        if (pidMatch) {
          const pid = parseInt(pidMatch[1]);
          try {
            // On macOS/Linux, also kill child processes (Chrome helpers, renderers)
            const { execSync } = require('child_process');
            try {
              execSync(`kill -- -${pid}`, { timeout: 3000 });
            } catch {
              // Process group kill may fail, fall back to direct kill
              process.kill(pid, 'SIGTERM');
            }
            console.log(`[ChromeLauncher] Killed Chrome process ${pid} from another session`);
          } catch (err: any) {
            if (err.code === 'ESRCH') {
              // Process doesn't exist anymore
              console.log(`[ChromeLauncher] Process ${pid} already dead, cleaning up`);
            } else {
              console.error(`[ChromeLauncher] Failed to kill process ${pid}:`, err);
              return false;
            }
          }
          // Clean up all lock files
          for (const file of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
            try { fs.unlinkSync(path.join(userDataDir, file)); } catch { /* ignore */ }
          }
          return true;
        }
      }
    } catch (err) {
      console.warn(`[ChromeLauncher] Could not stop profile via lock file:`, err);
    }
    return false;
  }
}
