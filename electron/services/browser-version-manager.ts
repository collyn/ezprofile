import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import * as http from 'http';
import { execSync } from 'child_process';
import AdmZip from 'adm-zip';
import { app, WebContents } from 'electron';

const CHROME_VERSIONS_API = 'https://googlechromelabs.github.io/chrome-for-testing/latest-versions-per-milestone-with-downloads.json';
const CHROME_STABLE_API = 'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json';
const CLOAKBROWSER_RELEASES_API = 'https://api.github.com/repos/CloakHQ/CloakBrowser/releases';

export interface ChromeVersionInfo {
  version: string;
  channel: string;
  revision: string;
  installed: boolean;
  size?: string; // e.g. "~200MB"
}

export interface InstalledVersion {
  version: string;
  channel: string;
  installedAt: string;
  chromePath: string;
}

interface VersionsMetadata {
  defaultVersion?: string; // 'system' or a version string
  versions: {
    version: string;
    channel: string;
    installedAt: string;
    chromePath?: string; // For custom versions
  }[];
}

export class BrowserVersionManager {
  private browsersDir: string;
  private metadataPath: string;
  private downloadAbortControllers: Map<string, AbortController> = new Map();

  constructor() {
    this.browsersDir = path.join(app.getPath('userData'), 'browsers');
    this.metadataPath = path.join(this.browsersDir, 'versions.json');
    if (!fs.existsSync(this.browsersDir)) {
      fs.mkdirSync(this.browsersDir, { recursive: true });
    }
  }

  /**
   * Detect current platform key for Chrome for Testing API
   */
  private getPlatformKey(): string {
    const platform = os.platform();
    const arch = os.arch();

    if (platform === 'win32') {
      return arch === 'x64' ? 'win64' : 'win32';
    } else if (platform === 'darwin') {
      return arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
    } else {
      return 'linux64';
    }
  }

  /**
   * Check if a version string represents a CloakBrowser version.
   */
  isCloakBrowserVersion(version: string): boolean {
    const metadata = this.loadMetadata();
    const entry = metadata.versions.find(v => v.version === version);
    return entry?.channel === 'CloakBrowser' || version.startsWith('CloakBrowser');
  }

  /**
   * Get the Chrome/CloakBrowser binary path inside an extracted version directory.
   * For custom versions, returns the stored chromePath from metadata.
   */
  getChromeBinaryPath(version: string): string {
    // Check if this is a custom version with a stored path
    const metadata = this.loadMetadata();
    const entry = metadata.versions.find(v => v.version === version);
    if (entry?.chromePath) {
      return entry.chromePath;
    }

    // CloakBrowser binary path
    if (entry?.channel === 'CloakBrowser') {
      return this.getCloakBrowserBinaryPath(version);
    }

    const platform = os.platform();
    const platformKey = this.getPlatformKey();
    const versionDir = path.join(this.browsersDir, version);

    if (platform === 'win32') {
      // chrome-win64/chrome.exe or chrome-win32/chrome.exe
      return path.join(versionDir, `chrome-${platformKey}`, 'chrome.exe');
    } else if (platform === 'darwin') {
      // chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
      return path.join(
        versionDir,
        `chrome-${platformKey}`,
        'Google Chrome for Testing.app',
        'Contents',
        'MacOS',
        'Google Chrome for Testing'
      );
    } else {
      // chrome-linux64/chrome
      return path.join(versionDir, 'chrome-linux64', 'chrome');
    }
  }

  /**
   * Get the CloakBrowser binary path for a downloaded version.
   * CloakBrowser .tar.gz extracts to: chrome-linux/ directory on Linux,
   * chrome-win/ on Windows.
   */
  private getCloakBrowserBinaryPath(version: string): string {
    const platform = os.platform();
    const versionDir = path.join(this.browsersDir, version);

    if (platform === 'win32') {
      // Check multiple possible structures for Windows
      const candidates = [
        path.join(versionDir, 'chrome-win', 'chrome.exe'),
        path.join(versionDir, 'chrome-win64', 'chrome.exe'),
        path.join(versionDir, 'chrome.exe'),
      ];
      // Also scan for chrome.exe in any immediate subdirectory
      try {
        const entries = fs.readdirSync(versionDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            candidates.push(path.join(versionDir, entry.name, 'chrome.exe'));
          }
        }
      } catch { /* version dir may not exist yet */ }
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
      }
      return candidates[0]; // fallback to chrome-win/chrome.exe
    } else if (platform === 'darwin') {
      // Check multiple possible macOS structures
      const candidates = [
        path.join(versionDir, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
        path.join(versionDir, 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
        path.join(versionDir, 'chrome-mac-arm64', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
        path.join(versionDir, 'chrome-mac-x64', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      ];
      // Scan for Chromium.app in any subdirectory
      try {
        const entries = fs.readdirSync(versionDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            candidates.push(path.join(versionDir, entry.name, 'Chromium.app', 'Contents', 'MacOS', 'Chromium'));
          }
        }
      } catch { /* version dir may not exist yet */ }
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
      }
      return candidates[0]; // fallback
    } else {
      // Linux: check multiple possible structures
      const candidates = [
        path.join(versionDir, 'chrome-linux', 'chrome'),
        path.join(versionDir, 'chrome'),
      ];
      // Scan for chrome in any subdirectory
      try {
        const entries = fs.readdirSync(versionDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            candidates.push(path.join(versionDir, entry.name, 'chrome'));
          }
        }
      } catch { /* version dir may not exist yet */ }
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
      }
      return candidates[0]; // fallback
    }
  }

  /**
   * Fetch available Chrome versions from Google's APIs.
   * Fetches both Stable channels (Stable/Beta/Dev/Canary) and all milestones.
   * Stable channels are shown first, then milestones sorted newest-first.
   */
  async getAvailableVersions(): Promise<ChromeVersionInfo[]> {
    const installedVersions = this.getInstalledVersions();
    const installedSet = new Set(installedVersions.map(v => v.version));
    const platformKey = this.getPlatformKey();
    const results: ChromeVersionInfo[] = [];
    const seenVersions = new Set<string>();

    // 1. Fetch Stable channels first (Stable, Beta, Dev, Canary)
    try {
      const stableData = await this.fetchJSON(CHROME_STABLE_API);
      const channelOrder = ['Stable', 'Beta', 'Dev', 'Canary'];
      for (const channelName of channelOrder) {
        const channelData = (stableData.channels as Record<string, any>)[channelName];
        if (!channelData) continue;
        const chromeDownloads = channelData.downloads?.chrome;
        if (!chromeDownloads) continue;
        const hasOurPlatform = chromeDownloads.some((d: any) => d.platform === platformKey);
        if (!hasOurPlatform) continue;

        seenVersions.add(channelData.version);
        results.push({
          version: channelData.version,
          channel: channelName,
          revision: channelData.revision,
          installed: installedSet.has(channelData.version),
        });
      }
    } catch (err) {
      console.warn('Failed to fetch stable channels:', err);
    }

    // 2. Fetch milestones
    try {
      const data = await this.fetchJSON(CHROME_VERSIONS_API);
      const milestones = data.milestones as Record<string, any>;
      const milestoneKeys = Object.keys(milestones)
        .map(k => parseInt(k, 10))
        .filter(k => !isNaN(k))
        .sort((a, b) => b - a); // Newest first

      for (const milestoneNum of milestoneKeys) {
        const milestoneData = milestones[String(milestoneNum)];
        if (!milestoneData) continue;
        // Skip if already added from stable channels
        if (seenVersions.has(milestoneData.version)) continue;

        const chromeDownloads = milestoneData.downloads?.chrome;
        if (!chromeDownloads) continue;
        const hasOurPlatform = chromeDownloads.some((d: any) => d.platform === platformKey);
        if (!hasOurPlatform) continue;

        seenVersions.add(milestoneData.version);
        results.push({
          version: milestoneData.version,
          channel: `Milestone ${milestoneData.milestone}`,
          revision: milestoneData.revision,
          installed: installedSet.has(milestoneData.version),
        });
      }
    } catch (err) {
      console.warn('Failed to fetch milestones:', err);
    }

    return results;
  }

  /**
   * Get available CloakBrowser versions from GitHub Releases.
   */
  async getCloakBrowserVersions(): Promise<ChromeVersionInfo[]> {
    const installedVersions = this.getInstalledVersions();
    const installedSet = new Set(installedVersions.map(v => v.version));
    const results: ChromeVersionInfo[] = [];

    try {
      const releases = await this.fetchJSON(CLOAKBROWSER_RELEASES_API);
      const platformKey = this.getCloakBrowserPlatformKey();

      for (const release of (Array.isArray(releases) ? releases : [])) {
        if (release.draft || release.prerelease) continue;

        // Find asset for current platform
        const assets = release.assets || [];
        const asset = assets.find((a: any) => a.name === platformKey);
        if (!asset) continue;

        // Parse version from tag: "chromium-v145.0.7632.159.7" → "CloakBrowser 145.0.7632.159.7"
        const tagName = release.tag_name || '';
        const versionMatch = tagName.match(/v?([\d.]+)$/);
        const chromiumVersion = versionMatch ? versionMatch[1] : tagName;
        const displayVersion = `CloakBrowser ${chromiumVersion}`;

        results.push({
          version: displayVersion,
          channel: 'CloakBrowser',
          revision: chromiumVersion,
          installed: installedSet.has(displayVersion),
        });
      }
    } catch (err) {
      console.warn('Failed to fetch CloakBrowser releases:', err);
    }

    return results;
  }

  /**
   * Get the CloakBrowser asset filename for the current platform.
   */
  private getCloakBrowserPlatformKey(): string {
    const platform = os.platform();
    const arch = os.arch();

    if (platform === 'win32') {
      return 'cloakbrowser-windows-x64.zip';
    } else if (platform === 'darwin') {
      return arch === 'arm64' ? 'cloakbrowser-darwin-arm64.tar.gz' : 'cloakbrowser-darwin-x64.tar.gz';
    } else {
      return arch === 'arm64' ? 'cloakbrowser-linux-arm64.tar.gz' : 'cloakbrowser-linux-x64.tar.gz';
    }
  }

  /**
   * Download and install a CloakBrowser version from GitHub Releases.
   */
  async downloadCloakBrowserVersion(
    version: string,
    webContents?: WebContents
  ): Promise<void> {
    const platformKey = this.getCloakBrowserPlatformKey();

    // Extract chromium version from display version: "CloakBrowser 145.0.7632.159.7"
    const chromiumVersion = version.replace('CloakBrowser ', '');

    // Fetch releases to find matching download URL
    let downloadUrl: string | null = null;
    const releases = await this.fetchJSON(CLOAKBROWSER_RELEASES_API);
    for (const release of (Array.isArray(releases) ? releases : [])) {
      const tagName = release.tag_name || '';
      if (tagName.includes(chromiumVersion)) {
        const asset = (release.assets || []).find((a: any) => a.name === platformKey);
        if (asset) {
          downloadUrl = asset.browser_download_url;
          break;
        }
      }
    }

    if (!downloadUrl) {
      throw new Error(`No CloakBrowser download available for version ${version} on platform ${platformKey}`);
    }

    const versionDir = path.join(this.browsersDir, version);
    const ext = platformKey.endsWith('.zip') ? '.zip' : '.tar.gz';
    const archivePath = path.join(this.browsersDir, `cloakbrowser-${chromiumVersion}${ext}`);

    if (webContents && !webContents.isDestroyed()) {
      webContents.send('browser:downloadProgress', version, 0, 'Downloading...');
    }

    try {
      await this.downloadFile(downloadUrl, archivePath, (percent, downloaded, total) => {
        if (webContents && !webContents.isDestroyed()) {
          const downloadedMB = (downloaded / 1024 / 1024).toFixed(1);
          const totalMB = (total / 1024 / 1024).toFixed(1);
          webContents.send(
            'browser:downloadProgress',
            version,
            percent,
            `Downloading: ${downloadedMB}MB / ${totalMB}MB`
          );
        }
      });

      // Extract
      if (webContents && !webContents.isDestroyed()) {
        webContents.send('browser:downloadProgress', version, 100, 'Extracting...');
      }

      if (fs.existsSync(versionDir)) {
        fs.rmSync(versionDir, { recursive: true, force: true });
      }
      fs.mkdirSync(versionDir, { recursive: true });

      if (ext === '.zip') {
        // Windows: extract ZIP
        const zip = new AdmZip(archivePath);
        zip.extractAllTo(versionDir, true);
      } else {
        // Linux/macOS: extract tar.gz
        execSync(`tar -xzf "${archivePath}" -C "${versionDir}"`);
      }

      // Make binary executable on Linux/macOS
      if (os.platform() !== 'win32') {
        try {
          execSync(`chmod -R +x "${versionDir}"`);
        } catch (chmodErr) {
          console.error('Failed to set executable permissions:', chmodErr);
        }
      }

      // Save metadata
      const metadata = this.loadMetadata();
      metadata.versions = metadata.versions.filter(v => v.version !== version);
      metadata.versions.push({
        version,
        channel: 'CloakBrowser',
        installedAt: new Date().toISOString(),
      });
      this.saveMetadata(metadata);

      // Cleanup archive
      if (fs.existsSync(archivePath)) {
        fs.unlinkSync(archivePath);
      }

      if (webContents && !webContents.isDestroyed()) {
        webContents.send('browser:downloadProgress', version, 100, 'Completed!');
      }
    } catch (error: any) {
      // Cleanup on failure
      if (fs.existsSync(archivePath)) {
        try { fs.unlinkSync(archivePath); } catch { }
      }
      if (fs.existsSync(versionDir)) {
        try { fs.rmSync(versionDir, { recursive: true, force: true }); } catch { }
      }
      throw error;
    }
  }

  /**
   * Get locally installed Chrome versions
   */
  getInstalledVersions(): InstalledVersion[] {
    const metadata = this.loadMetadata();
    return metadata.versions
      .filter(v => {
        // For custom versions, use the stored chromePath
        // For CloakBrowser, use the CloakBrowser-specific path logic
        let binaryPath: string;
        if (v.chromePath) {
          binaryPath = v.chromePath;
        } else if (v.channel === 'CloakBrowser') {
          binaryPath = this.getCloakBrowserBinaryPath(v.version);
        } else {
          binaryPath = this.getChromeBinaryPathForDownloaded(v.version);
        }
        return fs.existsSync(binaryPath);
      })
      .map(v => {
        let chromePath: string;
        if (v.chromePath) {
          chromePath = v.chromePath;
        } else if (v.channel === 'CloakBrowser') {
          chromePath = this.getCloakBrowserBinaryPath(v.version);
        } else {
          chromePath = this.getChromeBinaryPathForDownloaded(v.version);
        }
        return {
          version: v.version,
          channel: v.channel,
          installedAt: v.installedAt,
          chromePath,
        };
      });
  }

  /**
   * Get Chrome binary path for a downloaded (non-custom) version.
   * Used internally to avoid infinite recursion with getChromeBinaryPath.
   */
  private getChromeBinaryPathForDownloaded(version: string): string {
    const platform = os.platform();
    const platformKey = this.getPlatformKey();
    const versionDir = path.join(this.browsersDir, version);

    if (platform === 'win32') {
      return path.join(versionDir, `chrome-${platformKey}`, 'chrome.exe');
    } else if (platform === 'darwin') {
      return path.join(
        versionDir,
        `chrome-${platformKey}`,
        'Google Chrome for Testing.app',
        'Contents',
        'MacOS',
        'Google Chrome for Testing'
      );
    } else {
      return path.join(versionDir, 'chrome-linux64', 'chrome');
    }
  }

  /**
   * Add a custom Chrome version by specifying a folder path.
   * The folder must contain a Chrome binary.
   */
  addCustomVersion(name: string, chromePath: string): void {
    if (!fs.existsSync(chromePath)) {
      throw new Error(`Chrome binary not found at: ${chromePath}`);
    }

    const metadata = this.loadMetadata();
    // Remove existing entry with same name
    metadata.versions = metadata.versions.filter(v => v.version !== name);
    metadata.versions.push({
      version: name,
      channel: 'Custom',
      installedAt: new Date().toISOString(),
      chromePath,
    });
    this.saveMetadata(metadata);
  }

  /**
   * Find a Chrome binary inside a directory.
   * Searches for common Chrome binary names.
   */
  findChromeBinary(dir: string): string | null {
    const platform = os.platform();
    const candidates: string[] = [];

    if (platform === 'win32') {
      candidates.push(
        path.join(dir, 'chrome.exe'),
        path.join(dir, 'Chrome', 'chrome.exe'),
        path.join(dir, 'Application', 'chrome.exe'),
        path.join(dir, 'Chrome-bin', 'chrome.exe'),
        path.join(dir, 'App', 'Chrome-bin', 'chrome.exe'),
      );
    } else if (platform === 'darwin') {
      candidates.push(
        path.join(dir, 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
        path.join(dir, 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
        path.join(dir, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
        path.join(dir, 'chrome'),
      );
    } else {
      candidates.push(
        path.join(dir, 'chrome'),
        path.join(dir, 'chrome-linux64', 'chrome'),
        path.join(dir, 'chromium'),
        path.join(dir, 'google-chrome'),
      );
    }

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  /**
   * Get the default Chrome version for new profiles.
   * Returns 'system' if no default is set.
   */
  getDefaultVersion(): string {
    const metadata = this.loadMetadata();
    return metadata.defaultVersion || 'system';
  }

  /**
   * Set the default Chrome version for new profiles.
   */
  setDefaultVersion(version: string): void {
    const metadata = this.loadMetadata();
    metadata.defaultVersion = version;
    this.saveMetadata(metadata);
  }

  /**
   * Download and install a specific Chrome version.
   * Searches both stable channels and milestones APIs for the download URL.
   */
  async downloadVersion(
    version: string,
    channel: string,
    webContents?: WebContents
  ): Promise<void> {
    const platformKey = this.getPlatformKey();

    // 1. Get download URL - search both APIs
    let downloadUrl: string | null = null;

    // Try stable channels first (for Stable/Beta/Dev/Canary)
    if (['Stable', 'Beta', 'Dev', 'Canary'].includes(channel)) {
      try {
        const stableData = await this.fetchJSON(CHROME_STABLE_API);
        const channelData = (stableData.channels as Record<string, any>)[channel];
        if (channelData?.version === version) {
          const downloads = channelData.downloads?.chrome as { platform: string; url: string }[];
          const download = downloads?.find(d => d.platform === platformKey);
          if (download) downloadUrl = download.url;
        }
      } catch (err) {
        console.warn('Failed to fetch stable API for download:', err);
      }
    }

    // Fall back to milestones API
    if (!downloadUrl) {
      const data = await this.fetchJSON(CHROME_VERSIONS_API);
      const milestones = data.milestones as Record<string, any>;
      for (const key of Object.keys(milestones)) {
        const m = milestones[key];
        if (m.version === version) {
          const chromeDownloads = m.downloads?.chrome as { platform: string; url: string }[];
          const download = chromeDownloads?.find(d => d.platform === platformKey);
          if (download) downloadUrl = download.url;
          break;
        }
      }
    }
    if (!downloadUrl) throw new Error(`No download available for version ${version} on platform ${platformKey}`);

    // 2. Download ZIP with progress
    const versionDir = path.join(this.browsersDir, version);
    const zipPath = path.join(this.browsersDir, `chrome-${version}.zip`);

    if (webContents) {
      webContents.send('browser:downloadProgress', version, 0, 'Downloading...');
    }

    try {
      await this.downloadFile(downloadUrl, zipPath, (percent, downloaded, total) => {
        if (webContents && !webContents.isDestroyed()) {
          const downloadedMB = (downloaded / 1024 / 1024).toFixed(1);
          const totalMB = (total / 1024 / 1024).toFixed(1);
          webContents.send(
            'browser:downloadProgress',
            version,
            percent,
            `Downloading: ${downloadedMB}MB / ${totalMB}MB`
          );
        }
      });

      // 3. Extract ZIP
      if (webContents && !webContents.isDestroyed()) {
        webContents.send('browser:downloadProgress', version, 100, 'Extracting...');
      }

      if (fs.existsSync(versionDir)) {
        fs.rmSync(versionDir, { recursive: true, force: true });
      }
      fs.mkdirSync(versionDir, { recursive: true });

      const zip = new AdmZip(zipPath);
      zip.extractAllTo(versionDir, true);

      // 4. Make binary executable on Linux/macOS
      if (os.platform() !== 'win32') {
        try {
          // Make all files in the version directory executable
          // Using child_process.execSync for simplicity to do recursive chmod
          const { execSync } = require('child_process');
          execSync(`chmod -R +x "${versionDir}"`);
        } catch (chmodErr) {
          console.error('Failed to set executable permissions:', chmodErr);
        }
      }

      // 5. Save metadata
      const metadata = this.loadMetadata();
      // Remove existing entry if re-downloading
      metadata.versions = metadata.versions.filter(v => v.version !== version);
      metadata.versions.push({
        version,
        channel,
        installedAt: new Date().toISOString(),
      });
      this.saveMetadata(metadata);

      // 6. Cleanup zip
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }

      if (webContents && !webContents.isDestroyed()) {
        webContents.send('browser:downloadProgress', version, 100, 'Completed!');
      }
    } catch (error: any) {
      // Cleanup on failure
      if (fs.existsSync(zipPath)) {
        try { fs.unlinkSync(zipPath); } catch { }
      }
      if (fs.existsSync(versionDir)) {
        try { fs.rmSync(versionDir, { recursive: true, force: true }); } catch { }
      }
      throw error;
    }
  }

  /**
   * Delete an installed Chrome version
   */
  deleteVersion(version: string): void {
    const versionDir = path.join(this.browsersDir, version);
    if (fs.existsSync(versionDir)) {
      fs.rmSync(versionDir, { recursive: true, force: true });
    }

    const metadata = this.loadMetadata();
    metadata.versions = metadata.versions.filter(v => v.version !== version);
    this.saveMetadata(metadata);
  }

  /**
   * Check if a version is installed and its binary exists
   */
  isVersionInstalled(version: string): boolean {
    if (version === 'system') return true;
    const binaryPath = this.getChromeBinaryPath(version);
    return fs.existsSync(binaryPath);
  }

  // --- Private helpers ---

  private loadMetadata(): VersionsMetadata {
    try {
      if (fs.existsSync(this.metadataPath)) {
        return JSON.parse(fs.readFileSync(this.metadataPath, 'utf-8'));
      }
    } catch { }
    return { versions: [] };
  }

  private saveMetadata(metadata: VersionsMetadata): void {
    fs.writeFileSync(this.metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  }

  private fetchJSON(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        headers: {
          'User-Agent': 'EzProfile-Browser-Manager',
          'Accept': 'application/json',
        },
      };
      https.get(options, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return this.fetchJSON(res.headers.location).then(resolve, reject);
        }
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        }
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Failed to parse API response'));
          }
        });
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  private downloadFile(
    url: string,
    dest: string,
    onProgress?: (percent: number, downloaded: number, total: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);

      const request = https.get(url, (res: http.IncomingMessage) => {
        // Follow redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          try { fs.unlinkSync(dest); } catch { }
          return this.downloadFile(res.headers.location, dest, onProgress).then(resolve, reject);
        }

        if (res.statusCode !== 200) {
          file.close();
          try { fs.unlinkSync(dest); } catch { }
          return reject(new Error(`Download failed with status ${res.statusCode}`));
        }

        const totalSize = parseInt(res.headers['content-length'] || '0', 10);
        let downloaded = 0;
        let lastReportedPercent = -1;

        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          if (totalSize > 0 && onProgress) {
            const percent = Math.round((downloaded / totalSize) * 100);
            if (percent !== lastReportedPercent && percent % 2 === 0) {
              lastReportedPercent = percent;
              onProgress(percent, downloaded, totalSize);
            }
          }
        });

        res.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });

        res.on('error', (err: Error) => {
          file.close();
          try { fs.unlinkSync(dest); } catch { }
          reject(err);
        });
      });

      request.on('error', (err: Error) => {
        file.close();
        try { fs.unlinkSync(dest); } catch { }
        reject(err);
      });
    });
  }
}
