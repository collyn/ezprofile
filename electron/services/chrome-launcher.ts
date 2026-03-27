import { ChildProcess, spawn, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { BrowserVersionManager } from './browser-version-manager';

export class ChromeLauncher {
  private processes: Map<string, ChildProcess> = new Map();
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

  launch(
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
    } = {}
  ): ChildProcess {
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

    const chromePath = this.resolveChromePath(options.browserVersion);
    console.log(`[ChromeLauncher] Launching profile ${profileId} with Chrome: ${chromePath}`);
    console.log(`[ChromeLauncher] Browser version setting: ${options.browserVersion || 'system'}`);

    // Build Chrome arguments
    const args: string[] = [
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-translate',
      '--metrics-recording-only',
      '--no-report-upload',
      '--disable-features=MediaRouter',
      '--disable-component-update',
      '--log-level=3',
      '--disable-logging',
    ];

    // Chrome for Testing binaries need --no-sandbox on Linux
    // and --disable-infobars to suppress the "Chrome for Testing" warning banner
    if (options.browserVersion && options.browserVersion !== 'system' && options.browserVersion !== 'latest') {
      args.push('--no-sandbox');
      args.push('--disable-infobars');
    }

    // Add proxy if configured
    if (options.proxyHost && options.proxyPort) {
      const proxyType = options.proxyType || 'http';
      if (proxyType === 'socks5') {
        args.push(`--proxy-server=socks5://${options.proxyHost}:${options.proxyPort}`);
      } else if (proxyType === 'socks4') {
        args.push(`--proxy-server=socks4://${options.proxyHost}:${options.proxyPort}`);
      } else {
        args.push(`--proxy-server=${options.proxyHost}:${options.proxyPort}`);
      }
    }

    // Add startup URL (only if not using specific_pages mode, which uses Preferences)
    if (options.startupUrl && options.startupType !== 'specific_pages') {
      args.push(options.startupUrl);
    }

    // Force session restore when startup type is 'continue'.
    // This ensures tabs are restored even after unclean shutdown (e.g. SIGTERM
    // from another RDP session), especially needed on Windows where modifying
    // Preferences alone is not reliable.
    if (!options.startupType || options.startupType === 'continue') {
      args.push('--restore-last-session');
    }

    // Launch Chrome
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
