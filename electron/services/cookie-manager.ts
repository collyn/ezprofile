import puppeteer from 'puppeteer-core';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Profile } from './profile-manager';
import { ChromeLauncher } from './chrome-launcher';
import { BrowserVersionManager } from './browser-version-manager';
import { PortableCookie } from './chrome-cookie-crypto';

// Session-critical files/directories that Puppeteer's headless Chrome will overwrite.
// We back these up before launching Puppeteer and restore them afterwards.
const SESSION_FILES = [
  'Current Session',
  'Current Tabs',
  'Last Session',
  'Last Tabs',
  'Preferences',
  'Secure Preferences',
];
const SESSION_DIRS = ['Sessions'];

export class CookieManager {
  private browserVersionManager: BrowserVersionManager | null = null;

  constructor(private chromeLauncher: ChromeLauncher) {}

  setBrowserVersionManager(manager: BrowserVersionManager): void {
    this.browserVersionManager = manager;
  }

  /**
   * Resolve the correct Chrome binary for a profile.
   * Uses the profile's browser_version setting when available (e.g. CloakBrowser),
   * otherwise falls back to the system Chrome.
   */
  private resolveChromePath(profile: Profile): string {
    const version = profile.browser_version;
    if (version && version !== 'system' && version !== 'latest' && this.browserVersionManager) {
      const binaryPath = this.browserVersionManager.getChromeBinaryPath(version);
      if (fs.existsSync(binaryPath)) {
        console.log(`[CookieManager] Using profile browser: ${version} → ${binaryPath}`);
        return binaryPath;
      }
      console.warn(`[CookieManager] Browser version ${version} not found at ${binaryPath}, falling back to system`);
    }
    const systemPath = this.chromeLauncher.getChromePath();
    console.log(`[CookieManager] Using system Chrome: ${systemPath}`);
    return systemPath;
  }

  // ─────────────────────────────────────────────────────────────
  // Session preservation helpers
  // ─────────────────────────────────────────────────────────────

  /**
   * Back up session-critical files before Puppeteer touches the profile.
   * Returns the temp directory path (caller must pass it to restoreSession).
   */
  private backupSession(userDataDir: string): string | null {
    const defaultDir = path.join(userDataDir, 'Default');
    if (!fs.existsSync(defaultDir)) return null;

    const tmpDir = path.join(os.tmpdir(), `ezp_session_${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    let anyBackedUp = false;

    // Backup files
    for (const file of SESSION_FILES) {
      const src = path.join(defaultDir, file);
      if (fs.existsSync(src)) {
        try {
          fs.copyFileSync(src, path.join(tmpDir, file));
          anyBackedUp = true;
        } catch {}
      }
    }

    // Backup directories
    for (const dir of SESSION_DIRS) {
      const src = path.join(defaultDir, dir);
      if (fs.existsSync(src)) {
        try {
          this.copyDirSync(src, path.join(tmpDir, dir));
          anyBackedUp = true;
        } catch {}
      }
    }

    if (!anyBackedUp) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      return null;
    }

    console.log(`[CookieManager] Session data backed up to ${tmpDir}`);
    return tmpDir;
  }

  /**
   * Restore session-critical files after Puppeteer exits.
   */
  private restoreSession(userDataDir: string, tmpDir: string | null): void {
    if (!tmpDir) return;

    const defaultDir = path.join(userDataDir, 'Default');
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true });
    }

    // Restore files
    for (const file of SESSION_FILES) {
      const src = path.join(tmpDir, file);
      if (fs.existsSync(src)) {
        try {
          fs.copyFileSync(src, path.join(defaultDir, file));
        } catch {}
      }
    }

    // Restore directories
    for (const dir of SESSION_DIRS) {
      const src = path.join(tmpDir, dir);
      if (fs.existsSync(src)) {
        const dest = path.join(defaultDir, dir);
        try {
          // Remove the version Puppeteer wrote, then restore original
          if (fs.existsSync(dest)) {
            fs.rmSync(dest, { recursive: true, force: true });
          }
          this.copyDirSync(src, dest);
        } catch {}
      }
    }

    // Clean up temp dir
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    console.log(`[CookieManager] Session data restored`);
  }

  private copyDirSync(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        this.copyDirSync(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────

  async exportCookies(profile: Profile, filePath: string): Promise<void> {
    const isRunning = this.chromeLauncher.isRunning(profile.id);
    if (isRunning) {
      throw new Error("Please close the profile browser before exporting cookies!");
    }

    const sessionBackup = this.backupSession(profile.user_data_dir);

    const browser = await puppeteer.launch({
      executablePath: this.resolveChromePath(profile),
      userDataDir: profile.user_data_dir,
      headless: 'new' as any,
      ignoreDefaultArgs: ['--enable-automation'],
      args: ['--disable-extensions', '--no-sandbox', '--disable-logging', '--log-level=3', '--password-store=basic', '--use-mock-keychain']
    });

    try {
      const pages = await browser.pages();
      const page = pages.length > 0 ? pages[0] : await browser.newPage();
      
      // Navigate to a blank page and wait a moment to ensure the 
      // cookie SQLite database has fully loaded into Chrome's memory.
      await page.goto('about:blank');
      await new Promise(resolve => setTimeout(resolve, 1500));

      const client = await page.createCDPSession();
      const { cookies } = await client.send('Network.getAllCookies');
      
      fs.writeFileSync(filePath, JSON.stringify(cookies, null, 2), 'utf-8');
    } finally {
      await browser.close();
      this.restoreSession(profile.user_data_dir, sessionBackup);
    }
  }

  /**
   * Extract all cookies from a Chrome profile using CDP (Chrome decrypts them itself).
   * Returns portable cookies ready for cross-platform backup.
   */
  async exportCookiesToArray(profile: Profile): Promise<PortableCookie[]> {
    const defaultDir = path.join(profile.user_data_dir, 'Default');
    const cookiesDb = path.join(defaultDir, 'Cookies');
    if (!fs.existsSync(cookiesDb)) return [];

    console.log(`[CookieManager] Extracting cookies via CDP for profile ${profile.id}`);

    const sessionBackup = this.backupSession(profile.user_data_dir);

    const browser = await puppeteer.launch({
      executablePath: this.resolveChromePath(profile),
      userDataDir: profile.user_data_dir,
      headless: 'new' as any,
      ignoreDefaultArgs: ['--enable-automation'],
      args: ['--disable-extensions', '--no-sandbox', '--disable-logging', '--log-level=3', '--password-store=basic', '--use-mock-keychain']
    });

    try {
      const pages = await browser.pages();
      const page = pages.length > 0 ? pages[0] : await browser.newPage();

      await page.goto('about:blank');
      await new Promise(resolve => setTimeout(resolve, 1500));

      const client = await page.createCDPSession();
      const { cookies } = await client.send('Network.getAllCookies');

      const portable: PortableCookie[] = cookies
        .filter((c: any) => c.value) // skip empty
        .map((c: any) => {
          let sameSite = c.sameSite || 'Lax';
          if (sameSite === 'None' || sameSite === 'Lax' || sameSite === 'Strict') {
            // Already correct CDP format
          } else {
            sameSite = 'Lax';
          }
          return {
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path || '/',
            secure: !!c.secure,
            httpOnly: !!c.httpOnly,
            sameSite,
            expires: c.expires && c.expires > 0 ? c.expires : undefined,
          };
        });

      console.log(`[CookieManager] Extracted ${portable.length} cookies via CDP`);
      return portable;
    } finally {
      await browser.close();
      this.restoreSession(profile.user_data_dir, sessionBackup);
    }
  }

  async importCookies(profile: Profile, filePath: string): Promise<void> {
    const isRunning = this.chromeLauncher.isRunning(profile.id);
    if (isRunning) {
      throw new Error("Please close the profile browser before importing cookies!");
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    let cookiesData;
    try {
      cookiesData = JSON.parse(content);
    } catch {
      throw new Error("File Cookie không đúng định dạng JSON");
    }

    if (!Array.isArray(cookiesData)) {
      throw new Error("Dữ liệu Cookie phải là một mảng (Array)");
    }

    // Adapt common cookie formats to CDP format
    const cookies = cookiesData.map((c: any) => {
      // Network.setCookies expects strictly CookieParam fields.
      let sameSite = c.sameSite;
      if (sameSite === 'no_restriction' || sameSite === 'unspecified') {
        sameSite = 'None';
      } else if (sameSite && sameSite.toLowerCase() === 'lax') {
        sameSite = 'Lax';
      } else if (sameSite && sameSite.toLowerCase() === 'strict') {
        sameSite = 'Strict';
      }

      const param: any = {
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: sameSite === 'None' ? true : c.secure,
        httpOnly: c.httpOnly,
        sameSite: sameSite,
      };

      // Handle expiration
      const exp = c.expires !== undefined ? c.expires : c.expirationDate;
      if (exp !== undefined && exp !== null && typeof exp === 'number') {
        param.expires = exp;
      }

      // Generate url from domain if missing (CDP strictly requires contextual URL for custom domains)
      let url = c.url;
      if (!url && c.domain) {
        let domainStr = c.domain.startsWith('.') ? c.domain.substring(1) : c.domain;
        url = `http${param.secure ? 's' : ''}://${domainStr}${c.path || '/'}`;
      }
      if (url) param.url = url;

      return param;
    });

    const sessionBackup = this.backupSession(profile.user_data_dir);

    const browser = await puppeteer.launch({
      executablePath: this.resolveChromePath(profile),
      userDataDir: profile.user_data_dir,
      headless: 'new' as any,
      ignoreDefaultArgs: ['--enable-automation'],
      args: ['--disable-extensions', '--no-sandbox', '--disable-logging', '--log-level=3', '--password-store=basic', '--use-mock-keychain']
    });

    try {
      const pages = await browser.pages();
      const page = pages.length > 0 ? pages[0] : await browser.newPage();
      const client = await page.createCDPSession();
      
      // CDP Network.setCookies takes an array
      await client.send('Network.setCookies', { cookies });
      
      // Delay to ensure Chrome flushes the new cookies to the SQLite database
      await new Promise(resolve => setTimeout(resolve, 2000));
    } finally {
      await browser.close();
      this.restoreSession(profile.user_data_dir, sessionBackup);
    }
  }

  /**
   * Import cookies from a PortableCookie array via CDP.
   * Used during cross-platform restore to re-encrypt cookies
   * with the target platform's Chrome key.
   */
  async importCookiesFromArray(profile: Profile, portableCookies: PortableCookie[]): Promise<void> {
    if (portableCookies.length === 0) return;

    console.log(`[CookieManager] Importing ${portableCookies.length} portable cookies for profile ${profile.id}`);

    const cookies = portableCookies.map(c => {
      const param: any = {
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.sameSite === 'None' ? true : c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite,
      };

      if (c.expires != null && c.expires > 0) {
        param.expires = c.expires;
      }

      // Generate URL from domain (CDP requires a contextual URL)
      let domainStr = c.domain.startsWith('.') ? c.domain.substring(1) : c.domain;
      param.url = `http${param.secure ? 's' : ''}://${domainStr}${c.path || '/'}`;

      return param;
    });

    // Preserve session data from the freshly extracted backup.
    // Chrome headless will overwrite Preferences/Sessions when it runs.
    const sessionBackup = this.backupSession(profile.user_data_dir);

    const browser = await puppeteer.launch({
      executablePath: this.resolveChromePath(profile),
      userDataDir: profile.user_data_dir,
      headless: 'new' as any,
      ignoreDefaultArgs: ['--enable-automation'],
      args: ['--disable-extensions', '--no-sandbox', '--disable-logging', '--log-level=3', '--password-store=basic', '--use-mock-keychain']
    });

    try {
      const pages = await browser.pages();
      const page = pages.length > 0 ? pages[0] : await browser.newPage();
      const client = await page.createCDPSession();

      // Inject cookies via CDP — Chrome re-encrypts them with the local platform's key
      await client.send('Network.setCookies', { cookies });

      // Wait for Chrome to flush cookies to the SQLite database
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log(`[CookieManager] Successfully imported ${cookies.length} portable cookies`);
    } finally {
      await browser.close();
      this.restoreSession(profile.user_data_dir, sessionBackup);

      // Remove Sync Data that headless Chrome may have created
      const defaultDir = path.join(profile.user_data_dir, 'Default');
      const syncDataDir = path.join(defaultDir, 'Sync Data');
      if (fs.existsSync(syncDataDir)) {
        try { fs.rmSync(syncDataDir, { recursive: true, force: true }); } catch {}
      }
    }
  }
}
