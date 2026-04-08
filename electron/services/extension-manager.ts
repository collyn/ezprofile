import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { v4 as uuidv4 } from 'uuid';

export interface ExtensionManifest {
  name: string;
  version: string;
  description?: string;
  icons?: Record<string, string>;
  manifest_version?: number;
  default_locale?: string;
}

export interface ExtensionInfo {
  id: string;
  name: string;
  ext_id: string | null;
  version: string | null;
  description: string | null;
  icon_path: string | null;
  source_url: string | null;
  store_version: string | null;
  ext_dir: string;
  created_at: string;
  updated_at: string;
}

export class ExtensionManager {
  private extensionsBaseDir: string;

  constructor(baseDir: string) {
    this.extensionsBaseDir = path.join(baseDir, 'extensions');
    if (!fs.existsSync(this.extensionsBaseDir)) {
      fs.mkdirSync(this.extensionsBaseDir, { recursive: true });
    }
  }

  /**
   * Extract extension ID from Chrome Web Store URL.
   * Formats:
   * - https://chromewebstore.google.com/detail/name/extensionid
   * - https://chrome.google.com/webstore/detail/name/extensionid
   */
  extractExtensionId(url: string): string | null {
    // New format: chromewebstore.google.com/detail/xxx/ID
    const newMatch = url.match(/chromewebstore\.google\.com\/detail\/[^/]*\/([a-z]{32})/i);
    if (newMatch) return newMatch[1];

    // Old format: chrome.google.com/webstore/detail/xxx/ID
    const oldMatch = url.match(/chrome\.google\.com\/webstore\/detail\/[^/]*\/([a-z]{32})/i);
    if (oldMatch) return oldMatch[1];

    // Direct ID match (32 lowercase letters)
    const directMatch = url.match(/^([a-z]{32})$/);
    if (directMatch) return directMatch[1];

    return null;
  }

  /**
   * Download CRX from Chrome Web Store using the update API.
   */
  async downloadCrxFromStore(extensionId: string, targetPath: string): Promise<void> {
    // Use a recent Chrome version to avoid compatibility issues
    const prodVersion = '131.0.6778.69';
    const url = `https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx2,crx3&prodversion=${prodVersion}&x=id%3D${extensionId}%26uc`;

    return new Promise((resolve, reject) => {
      const makeRequest = (requestUrl: string, redirectCount = 0) => {
        if (redirectCount > 5) {
          reject(new Error('Too many redirects'));
          return;
        }

        const protocol = requestUrl.startsWith('https') ? https : http;
        protocol.get(requestUrl, (response) => {
          // Handle redirects
          if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            makeRequest(response.headers.location, redirectCount + 1);
            return;
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download CRX: HTTP ${response.statusCode}. The extension may not be available for direct download.`));
            return;
          }

          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => {
            const buffer = Buffer.concat(chunks);
            if (buffer.length < 100) {
              reject(new Error('Downloaded file is too small, likely not a valid CRX'));
              return;
            }
            fs.writeFileSync(targetPath, buffer);
            resolve();
          });
          response.on('error', reject);
        }).on('error', reject);
      };

      makeRequest(url);
    });
  }

  /**
   * Extract CRX file to a directory.
   * CRX3 format: [magic(4)] [version(4)] [header_size(4)] [header(header_size)] [zip_data]
   * CRX2 format: [magic(4)] [version(4)] [pk_len(4)] [sig_len(4)] [pk(pk_len)] [sig(sig_len)] [zip_data]
   */
  async extractCrx(crxPath: string, targetDir: string): Promise<void> {
    const data = fs.readFileSync(crxPath);

    // Check CRX magic number: "Cr24"
    const magic = data.toString('utf8', 0, 4);
    if (magic !== 'Cr24') {
      // Might be a regular ZIP
      await this.extractZip(crxPath, targetDir);
      return;
    }

    const version = data.readUInt32LE(4);
    let zipStart: number;

    if (version === 3) {
      // CRX3 format
      const headerSize = data.readUInt32LE(8);
      zipStart = 12 + headerSize;
    } else if (version === 2) {
      // CRX2 format
      const pkLen = data.readUInt32LE(8);
      const sigLen = data.readUInt32LE(12);
      zipStart = 16 + pkLen + sigLen;
    } else {
      throw new Error(`Unsupported CRX version: ${version}`);
    }

    // Write zip portion to temp file
    const zipData = data.subarray(zipStart);
    const tempZipPath = crxPath + '.zip';
    fs.writeFileSync(tempZipPath, zipData);

    try {
      await this.extractZip(tempZipPath, targetDir);
    } finally {
      try { fs.unlinkSync(tempZipPath); } catch { /* ignore */ }
    }
  }

  /**
   * Extract a ZIP file to a directory using Node.js built-in support.
   */
  async extractZip(zipPath: string, targetDir: string): Promise<void> {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipPath);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    zip.extractAllTo(targetDir, true);

    // If the ZIP contains a single top-level folder, move contents up
    const entries = fs.readdirSync(targetDir);
    if (entries.length === 1) {
      const singleDir = path.join(targetDir, entries[0]);
      if (fs.statSync(singleDir).isDirectory()) {
        // Check if this folder contains manifest.json
        if (fs.existsSync(path.join(singleDir, 'manifest.json'))) {
          // Move all contents up one level
          const innerEntries = fs.readdirSync(singleDir);
          for (const entry of innerEntries) {
            const src = path.join(singleDir, entry);
            const dest = path.join(targetDir, entry);
            fs.renameSync(src, dest);
          }
          fs.rmdirSync(singleDir);
        }
      }
    }
  }

  /**
   * Read manifest.json from an extension directory.
   */
  readManifest(extDir: string): ExtensionManifest | null {
    const manifestPath = path.join(extDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return null;

    try {
      const content = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(content);

      // Resolve __MSG_name__ internationalization fields
      const localesDir = path.join(extDir, '_locales');
      if (fs.existsSync(localesDir)) {
        let messagesPath = manifest.default_locale ? path.join(localesDir, manifest.default_locale, 'messages.json') : null;

        // Fallback to en, en_US, or the first available locale if default is missing or invalid
        if (!messagesPath || !fs.existsSync(messagesPath)) {
          const availableLocales = fs.readdirSync(localesDir);
          if (availableLocales.length > 0) {
            const fallback = availableLocales.find(l => l.toLowerCase() === 'en') ||
                             availableLocales.find(l => l.toLowerCase() === 'en_us') ||
                             availableLocales.find(l => l.toLowerCase() === 'en-us') ||
                             availableLocales[0];
            messagesPath = path.join(localesDir, fallback, 'messages.json');
          }
        }

        if (messagesPath && fs.existsSync(messagesPath)) {
          try {
            const messages = JSON.parse(fs.readFileSync(messagesPath, 'utf-8'));
            const resolveStr = (str: string) => {
              if (!str || typeof str !== 'string') return str;
              return str.replace(/__MSG_([a-zA-Z0-9_@]+)__/g, (match, key) => {
                if (messages[key] && messages[key].message !== undefined) return messages[key].message;
                const lowerKey = key.toLowerCase();
                const foundKey = Object.keys(messages).find(k => k.toLowerCase() === lowerKey);
                if (foundKey && messages[foundKey].message !== undefined) return messages[foundKey].message;
                return match;
              });
            };

            if (manifest.name) manifest.name = resolveStr(manifest.name);
            if (manifest.description) manifest.description = resolveStr(manifest.description);
          } catch { /* ignore parsing errors */ }
        }
      }

      return manifest;
    } catch {
      return null;
    }
  }

  /**
   * Get the best icon path from the manifest.
   */
  getBestIconPath(manifest: ExtensionManifest, extDir: string): string | null {
    if (!manifest.icons) return null;

    // Prefer largest icon
    const sizes = Object.keys(manifest.icons).map(Number).sort((a, b) => b - a);
    for (const size of sizes) {
      const iconFile = manifest.icons[size.toString()];
      const iconPath = path.join(extDir, iconFile);
      if (fs.existsSync(iconPath)) {
        return iconPath;
      }
    }
    return null;
  }

  /**
   * Process an uploaded file (ZIP or CRX) and return extension info.
   */
  async processUploadedFile(filePath: string): Promise<{ extDir: string; manifest: ExtensionManifest }> {
    const id = uuidv4();
    const extDir = path.join(this.extensionsBaseDir, id);
    fs.mkdirSync(extDir, { recursive: true });

    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.crx') {
      await this.extractCrx(filePath, extDir);
    } else {
      await this.extractZip(filePath, extDir);
    }

    const manifest = this.readManifest(extDir);
    if (!manifest) {
      // Clean up
      fs.rmSync(extDir, { recursive: true, force: true });
      throw new Error('No manifest.json found in the extension package');
    }

    return { extDir, manifest };
  }

  /**
   * Download extension from Chrome Web Store and extract it.
   */
  async downloadFromStore(storeUrl: string): Promise<{ extDir: string; manifest: ExtensionManifest; extensionId: string }> {
    const extensionId = this.extractExtensionId(storeUrl);
    if (!extensionId) {
      throw new Error('Invalid Chrome Web Store URL. Expected format: https://chromewebstore.google.com/detail/name/extensionid');
    }

    const id = uuidv4();
    const extDir = path.join(this.extensionsBaseDir, id);
    fs.mkdirSync(extDir, { recursive: true });

    const crxPath = path.join(extDir, '_temp.crx');

    try {
      await this.downloadCrxFromStore(extensionId, crxPath);
      await this.extractCrx(crxPath, extDir);
    } catch (err) {
      fs.rmSync(extDir, { recursive: true, force: true });
      throw err;
    } finally {
      try { fs.unlinkSync(crxPath); } catch { /* ignore */ }
    }

    const manifest = this.readManifest(extDir);
    if (!manifest) {
      fs.rmSync(extDir, { recursive: true, force: true });
      throw new Error('Downloaded extension has no valid manifest.json');
    }

    return { extDir, manifest, extensionId };
  }

  /**
   * Check for updates from Chrome Web Store.
   * Uses the update2 API to get the latest version.
   */
  async checkStoreVersion(extensionId: string): Promise<string | null> {
    const prodVersion = '131.0.6778.69';
    const url = `https://clients2.google.com/service/update2/crx?response=updatecheck&acceptformat=crx2,crx3&prodversion=${prodVersion}&x=id%3D${extensionId}%26uc`;

    return new Promise((resolve) => {
      https.get(url, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          // Parse XML response for extension version in updatecheck element
          const versionMatch = body.match(/<updatecheck[^>]+version="([^"]+)"/);
          resolve(versionMatch ? versionMatch[1] : null);
        });
        response.on('error', () => resolve(null));
      }).on('error', () => resolve(null));
    });
  }

  /**
   * Update an extension from Chrome Web Store.
   * Downloads the new version and replaces the old directory contents.
   */
  async updateFromStore(extensionId: string, existingExtDir: string): Promise<ExtensionManifest> {
    // Download to temp location
    const tempDir = existingExtDir + '_update_tmp';
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });

    const crxPath = path.join(tempDir, '_temp.crx');

    try {
      await this.downloadCrxFromStore(extensionId, crxPath);
      await this.extractCrx(crxPath, tempDir);
    } catch (err) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      throw err;
    } finally {
      try { fs.unlinkSync(crxPath); } catch { /* ignore */ }
    }

    const manifest = this.readManifest(tempDir);
    if (!manifest) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      throw new Error('Updated extension has no valid manifest.json');
    }

    // Replace existing directory contents
    // Remove old files (except _temp files)
    const oldEntries = fs.readdirSync(existingExtDir);
    for (const entry of oldEntries) {
      if (entry.startsWith('_update_tmp')) continue;
      const entryPath = path.join(existingExtDir, entry);
      fs.rmSync(entryPath, { recursive: true, force: true });
    }

    // Move new files in
    const newEntries = fs.readdirSync(tempDir);
    for (const entry of newEntries) {
      if (entry === '_temp.crx') continue;
      const src = path.join(tempDir, entry);
      const dest = path.join(existingExtDir, entry);
      fs.renameSync(src, dest);
    }

    // Clean up temp dir
    fs.rmSync(tempDir, { recursive: true, force: true });

    return manifest;
  }

  /**
   * Delete an extension's files from disk.
   */
  deleteExtensionFiles(extDir: string): void {
    if (fs.existsSync(extDir) && extDir.startsWith(this.extensionsBaseDir)) {
      fs.rmSync(extDir, { recursive: true, force: true });
    }
  }

  /**
   * Fetch metadata from Chrome Web Store page (name, description).
   */
  async fetchStoreMetadata(storeUrl: string): Promise<{ name: string; description: string } | null> {
    return new Promise((resolve) => {
      const makeRequest = (url: string, redirectCount = 0) => {
        if (redirectCount > 5) { resolve(null); return; }

        const protocol = url.startsWith('https') ? https : http;
        protocol.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
          if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            makeRequest(response.headers.location, redirectCount + 1);
            return;
          }
          if (response.statusCode !== 200) { resolve(null); return; }

          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => {
            const html = Buffer.concat(chunks).toString('utf-8');
            const nameMatch = html.match(/<title>([^<]*?)(?:\s*-\s*Chrome Web Store)?<\/title>/i);
            const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*?)"/i);
            if (nameMatch) {
              resolve({
                name: nameMatch[1].trim(),
                description: descMatch ? descMatch[1].trim() : '',
              });
            } else {
              resolve(null);
            }
          });
          response.on('error', () => resolve(null));
        }).on('error', () => resolve(null));
      };

      makeRequest(storeUrl);
    });
  }
}
