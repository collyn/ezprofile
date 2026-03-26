import { ChildProcess, spawn } from 'child_process';
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

    // Remove lock files for multi-RDP session support
    this.removeLockFiles(userDataDir);

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
    if (options.browserVersion && options.browserVersion !== 'system' && options.browserVersion !== 'latest') {
      args.push('--no-sandbox');
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

  stop(profileId: string): boolean {
    const process = this.processes.get(profileId);
    if (process && process.exitCode === null && !process.killed) {
      process.kill('SIGTERM');
      this.processes.delete(profileId);
      return true;
    }
    this.processes.delete(profileId);
    return false;
  }

  stopAll(): void {
    for (const [id, process] of this.processes) {
      if (process.exitCode === null && !process.killed) {
        process.kill('SIGTERM');
      }
    }
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
   * Check if a Chrome profile is actually running by looking for the
   * SingletonLock file in the user data directory. This works across
   * different Electron instances / RDP sessions.
   */
  static isProfileActuallyRunning(userDataDir: string): boolean {
    const lockPath = path.join(userDataDir, 'SingletonLock');
    try {
      // On Linux, SingletonLock is a symlink. If it exists, Chrome is running.
      // On Windows, the lock file is a regular file.
      const stat = fs.lstatSync(lockPath);
      return stat.isSymbolicLink() || stat.isFile();
    } catch {
      // File doesn't exist = Chrome not running
      return false;
    }
  }
}
