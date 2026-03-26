import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import * as http from 'http';
import AdmZip from 'adm-zip';
import { app, WebContents } from 'electron';

const CHROME_VERSIONS_API = 'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json';

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
  versions: {
    version: string;
    channel: string;
    installedAt: string;
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
   * Get the Chrome binary path inside an extracted version directory
   */
  getChromeBinaryPath(version: string): string {
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
   * Fetch available Chrome versions from Google's API
   */
  async getAvailableVersions(): Promise<ChromeVersionInfo[]> {
    const data = await this.fetchJSON(CHROME_VERSIONS_API);
    const installedVersions = this.getInstalledVersions();
    const installedSet = new Set(installedVersions.map(v => v.version));
    const platformKey = this.getPlatformKey();

    const results: ChromeVersionInfo[] = [];
    const seenVersions = new Set<string>();

    // Process in priority order: Stable > Beta > Dev > Canary
    const channelOrder = ['Stable', 'Beta', 'Dev', 'Canary'];

    for (const channelName of channelOrder) {
      const channelData = (data.channels as Record<string, any>)[channelName];
      if (!channelData) continue;

      // Skip if this exact version was already added from a higher-priority channel
      if (seenVersions.has(channelData.version)) continue;

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

    return results;
  }

  /**
   * Get locally installed Chrome versions
   */
  getInstalledVersions(): InstalledVersion[] {
    const metadata = this.loadMetadata();
    return metadata.versions
      .filter(v => {
        const binaryPath = this.getChromeBinaryPath(v.version);
        return fs.existsSync(binaryPath);
      })
      .map(v => ({
        version: v.version,
        channel: v.channel,
        installedAt: v.installedAt,
        chromePath: this.getChromeBinaryPath(v.version),
      }));
  }

  /**
   * Download and install a specific Chrome version
   */
  async downloadVersion(
    version: string,
    channel: string,
    webContents?: WebContents
  ): Promise<void> {
    const platformKey = this.getPlatformKey();

    // 1. Get download URL
    const data = await this.fetchJSON(CHROME_VERSIONS_API);
    const channelData = (data.channels as Record<string, any>)[channel];
    if (!channelData) throw new Error(`Channel "${channel}" does not exist`);

    const downloads = channelData.downloads?.chrome as { platform: string; url: string }[];
    const download = downloads?.find(d => d.platform === platformKey);
    if (!download) throw new Error(`No download available for platform ${platformKey}`);

    // 2. Download ZIP with progress
    const versionDir = path.join(this.browsersDir, version);
    const zipPath = path.join(this.browsersDir, `chrome-${version}.zip`);

    if (webContents) {
      webContents.send('browser:downloadProgress', version, 0, 'Đang tải...');
    }

    try {
      await this.downloadFile(download.url, zipPath, (percent, downloaded, total) => {
        if (webContents && !webContents.isDestroyed()) {
          const downloadedMB = (downloaded / 1024 / 1024).toFixed(1);
          const totalMB = (total / 1024 / 1024).toFixed(1);
          webContents.send(
            'browser:downloadProgress',
            version,
            percent,
            `Đang tải: ${downloadedMB}MB / ${totalMB}MB`
          );
        }
      });

      // 3. Extract ZIP
      if (webContents && !webContents.isDestroyed()) {
        webContents.send('browser:downloadProgress', version, 100, 'Đang giải nén...');
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
      https.get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return this.fetchJSON(res.headers.location).then(resolve, reject);
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
