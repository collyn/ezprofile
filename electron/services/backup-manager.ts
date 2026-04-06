import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import AdmZip from 'adm-zip';
import { Profile, ProfileManager } from './profile-manager';
import { ChromeLauncher } from './chrome-launcher';
import { EncryptionService } from './encryption-service';
import { GDriveService } from './gdrive-service';
import { S3Service } from './s3-service';
import { CookieManager } from './cookie-manager';
import { extractPortableCookies, savePortableCookies, readPortableCookies, removePortableCookies } from './chrome-cookie-crypto';
import { WebContents } from 'electron';

// ─────────────────────────────────────────────────────────────
// .ezpsync file format
// ─────────────────────────────────────────────────────────────
//  Offset  Size  Content
//  0       4     Magic "EZPS"
//  4       1     Version 0x01
//  5       32    PBKDF2 Salt
//  37      12    AES-GCM IV
//  49      16    AES-GCM Auth Tag
//  65      4     Metadata JSON length (uint32 LE)
//  69      N     Metadata JSON (plaintext): { profileId, profileName, createdAt, appVersion }
//  69+N    -     Encrypted ZIP payload
// ─────────────────────────────────────────────────────────────

const MAGIC = Buffer.from('EZPS');
const FORMAT_VERSION = 0x01;

const IGNORE_FOLDERS = ['Cache', 'Code Cache', 'GPUCache', 'Service Worker/CacheStorage'];
const IGNORE_FILES = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];

export interface CloudBackupEntry {
  id: string;
  profileId: string;
  profileName: string;
  createdAt: string;
  sizeBytes: number;
  provider: 'googledrive' | 's3';
  isSync: boolean;
}

export interface SyncProgress {
  profileId: string;
  message: string;
  percent?: number;
}

export class BackupManager {
  private cookieManager?: CookieManager;

  constructor(
    private chromeLauncher: ChromeLauncher,
    private encryptionSvc?: EncryptionService,
    private profileManager?: ProfileManager,
    private gdriveService?: GDriveService,
    private s3Service?: S3Service
  ) {}

  setCookieManager(cm: CookieManager): void {
    this.cookieManager = cm;
  }

  // ─────────────────────────────────────────────────────────────
  // Local backup/restore
  // ─────────────────────────────────────────────────────────────

  /**
   * After extracting a backup, check if portable cookies exist and re-import
   * them via CDP so Chrome re-encrypts with the target platform's key.
   */
  private async reimportPortableCookies(profile: Profile): Promise<void> {
    const portable = readPortableCookies(profile.user_data_dir);
    if (!portable || portable.cookies.length === 0) return;

    // Always re-import cookies — the backup was made with decrypted values that
    // need to be injected via CDP so Chrome encrypts them with the local key.
    console.log(`[BackupManager] Re-importing ${portable.cookies.length} portable cookies (source: ${portable.platform})`);

    if (!this.cookieManager) {
      console.warn('[BackupManager] CookieManager not set, cannot re-import portable cookies');
      removePortableCookies(profile.user_data_dir);
      return;
    }

    try {
      // Delete the existing Cookies database file so CDP writes a fresh one
      // encrypted with the current platform's key
      const cookiesDbPath = path.join(profile.user_data_dir, 'Default', 'Cookies');
      const cookiesJournalPath = path.join(profile.user_data_dir, 'Default', 'Cookies-journal');
      for (const f of [cookiesDbPath, cookiesJournalPath]) {
        try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
      }

      await this.cookieManager.importCookiesFromArray(profile, portable.cookies);
      console.log(`[BackupManager] Successfully re-imported ${portable.cookies.length} cookies`);
    } catch (err) {
      console.error('[BackupManager] Failed to re-import portable cookies:', err);
    } finally {
      removePortableCookies(profile.user_data_dir);
    }
  }

  private getDefaultLocalKey(): Buffer {
    return require('crypto').createHash('sha256').update('ezprofile-local-backup-fallback').digest();
  }

  private getLocalEncryptionKey(): Buffer {
    if (this.encryptionSvc && this.profileManager) {
      const storedEncryptedKey = this.profileManager.getSetting('sync_encrypted_key');
      if (storedEncryptedKey) {
        try {
          const hex = this.encryptionSvc.decryptString(storedEncryptedKey);
          return Buffer.from(hex, 'hex');
        } catch (err) {
          console.warn('[BackupManager] Failed to decrypt user sync key for local backup. Using fallback.');
        }
      }
    }
    return this.getDefaultLocalKey();
  }

  async backupProfile(profile: Profile, targetZipPath: string, webContents?: WebContents): Promise<void> {
    if (this.chromeLauncher.isRunning(profile.id)) {
      throw new Error(`Profile "${profile.name}" is running. Please close it before backing up.`);
    }

    if (!fs.existsSync(profile.user_data_dir)) {
      throw new Error(`Data directory of profile "${profile.name}" does not exist.`);
    }

    if (webContents) {
      webContents.send('profile:backupProgress', profile.id, 'Compressing data...');
    }

    try {
      // Extract portable cookies for cross-platform compatibility
      try {
        const cookies = extractPortableCookies(profile.user_data_dir);
        if (cookies.length > 0) {
          savePortableCookies(profile.user_data_dir, cookies);
          if (webContents) webContents.send('profile:backupProgress', profile.id, `Extracted ${cookies.length} cookies for portability`);
        }
      } catch (err) {
        console.warn('[BackupManager] Portable cookie extraction failed (non-fatal):', err);
      }

      const isEzpSync = targetZipPath.endsWith('.ezpsync');
      const zip = new AdmZip();
      this.addDirectoryToZip(profile.user_data_dir, '', zip, IGNORE_FOLDERS, IGNORE_FILES);

      if (isEzpSync) {
        if (webContents) webContents.send('profile:backupProgress', profile.id, 'Encrypting data...');
        const tmpZip = path.join(os.tmpdir(), `ezprofile_${profile.id}_${Date.now()}.zip`);
        zip.writeZip(tmpZip);
        const zipData = fs.readFileSync(tmpZip);
        if (fs.existsSync(tmpZip)) fs.unlinkSync(tmpZip);

        const key = this.getLocalEncryptionKey();
        const appVersion = require('electron').app.getVersion();
        await this.writeEzpsyncFile(targetZipPath, zipData, key, {
          profileId: profile.id,
          profileName: profile.name,
          createdAt: new Date().toISOString(),
          appVersion,
        });
      } else {
        zip.writeZip(targetZipPath);
      }

      // Clean up portable cookies file from profile directory
      removePortableCookies(profile.user_data_dir);
    } catch (error: any) {
      removePortableCookies(profile.user_data_dir);
      throw new Error(`Compression error: ${error.message}`);
    }
  }

  async restoreProfile(profile: Profile, sourceZipPath: string, webContents?: WebContents): Promise<void> {
    if (this.chromeLauncher.isRunning(profile.id)) {
      throw new Error(`Profile "${profile.name}" is running. Please close it before restoring.`);
    }

    if (!fs.existsSync(sourceZipPath)) {
      throw new Error(`Backup file does not exist: ${sourceZipPath}`);
    }

    if (webContents) {
      webContents.send('profile:backupProgress', profile.id, 'Restoring data...');
    }

    try {
      const isEzpSync = sourceZipPath.endsWith('.ezpsync');
      let targetZipToExtract = sourceZipPath;
      const tmpZip = path.join(os.tmpdir(), `restore_${profile.id}_${Date.now()}.zip`);

      if (isEzpSync) {
        if (webContents) webContents.send('profile:backupProgress', profile.id, 'Decrypting data...');
        let zipData: Buffer | null = null;
        
        // Try with custom key first, if available
        if (this.encryptionSvc && this.profileManager) {
          const storedEncryptedKey = this.profileManager.getSetting('sync_encrypted_key');
          if (storedEncryptedKey) {
            try {
              const hex = this.encryptionSvc.decryptString(storedEncryptedKey);
              const customKey = Buffer.from(hex, 'hex');
              zipData = await this.readEzpsyncFile(sourceZipPath, customKey);
            } catch (err: any) {
              console.warn('[BackupManager] Failed to decrypt with custom key, trying fallback...');
            }
          }
        }
        
        // Try fallback key
        if (!zipData) {
          zipData = await this.readEzpsyncFile(sourceZipPath, this.getDefaultLocalKey());
        }

        fs.writeFileSync(tmpZip, zipData);
        targetZipToExtract = tmpZip;
      }

      if (fs.existsSync(profile.user_data_dir)) {
        fs.rmSync(profile.user_data_dir, { recursive: true, force: true });
      }
      fs.mkdirSync(profile.user_data_dir, { recursive: true });

      const zip = new AdmZip(targetZipToExtract);
      zip.extractAllTo(profile.user_data_dir, true);

      if (isEzpSync && fs.existsSync(tmpZip)) {
        fs.unlinkSync(tmpZip);
      }

      // Re-import portable cookies via CDP if present (cross-platform restore)
      await this.reimportPortableCookies(profile);
    } catch (error: any) {
      throw new Error(`Extraction error: ${error.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Cloud backup/restore
  // ─────────────────────────────────────────────────────────────

  async backupToCloud(
    profile: Profile,
    provider: 'googledrive' | 's3',
    passphraseKey: Buffer,
    isBackup: boolean = false,
    onProgress?: (p: SyncProgress) => void
  ): Promise<{ remoteFile: string; sizeBytes: number }> {
    this.requireCloudServices();

    if (this.chromeLauncher.isRunning(profile.id)) {
      throw new Error(`Profile "${profile.name}" is running. Please close it before syncing.`);
    }

    const tmpDir = os.tmpdir();
    const tmpZip = path.join(tmpDir, `ezprofile_${profile.id}_${Date.now()}.zip`);
    const tmpEncrypted = path.join(tmpDir, `ezprofile_${profile.id}_${Date.now()}.ezpsync`);

    try {
      // 0. Extract portable cookies for cross-platform compatibility
      try {
        const cookies = extractPortableCookies(profile.user_data_dir);
        if (cookies.length > 0) {
          savePortableCookies(profile.user_data_dir, cookies);
          onProgress?.({ profileId: profile.id, message: `Extracted ${cookies.length} cookies for portability`, percent: 5 });
        }
      } catch (err) {
        console.warn('[BackupManager] Portable cookie extraction failed (non-fatal):', err);
      }

      // 1. Compress
      onProgress?.({ profileId: profile.id, message: 'Compressing profile...', percent: 10 });
      const zip = new AdmZip();
      this.addDirectoryToZip(profile.user_data_dir, '', zip, IGNORE_FOLDERS, IGNORE_FILES);
      zip.writeZip(tmpZip);

      // Clean up portable cookies file from profile directory
      removePortableCookies(profile.user_data_dir);

      // 2. Encrypt → .ezpsync
      onProgress?.({ profileId: profile.id, message: 'Encrypting...', percent: 40 });
      const zipData = fs.readFileSync(tmpZip);
      const appVersion = require('electron').app.getVersion();
      await this.writeEzpsyncFile(tmpEncrypted, zipData, passphraseKey, {
        profileId: profile.id,
        profileName: profile.name,
        createdAt: new Date().toISOString(),
        appVersion,
      });

      const sizeBytes = fs.statSync(tmpEncrypted).size;

      // 3. Upload
      onProgress?.({ profileId: profile.id, message: 'Uploading to cloud...', percent: 60 });
      let remoteFile: string;
      const ts = Date.now();

      if (provider === 'googledrive') {
        const fileName = this.gdriveService!.buildFileName(profile.id, profile.name, { isSync: !isBackup, timestamp: ts });
        remoteFile = await this.gdriveService!.uploadFile(tmpEncrypted, fileName);
      } else {
        remoteFile = this.s3Service!.buildS3Key(profile.id, profile.name, { isSync: !isBackup, timestamp: ts });
        await this.s3Service!.uploadFile(tmpEncrypted, remoteFile);
      }

      // 4. Log
      this.writeSyncLog(profile.id, provider, 'upload', 'success', remoteFile, sizeBytes);
      onProgress?.({ profileId: profile.id, message: 'Done!', percent: 100 });

      // 5. Rotation for snapshot backups
      if (isBackup) {
        try {
          const maxBackups = parseInt(this.profileManager?.getSetting('sync_max_backups') || '5', 10);
          if (maxBackups > 0) {
            const allCloudFiles = await this.listCloudBackups(profile.id, provider);
            // Filter strictly to backups (ignore the sync overwrite file)
            const snapshots = allCloudFiles.filter(b => !b.isSync);
            // listCloudBackups usually sorts newest first, but let's enforce
            snapshots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            if (snapshots.length > maxBackups) {
              const toDelete = snapshots.slice(maxBackups);
              for (const old of toDelete) {
                await this.deleteCloudBackup(old.id, provider).catch(err => {
                  console.error(`[BackupManager] Failed to prune old backup ${old.id}:`, err);
                });
              }
            }
          }
        } catch (err) {
          console.error('[BackupManager] Failed to process backup rotation:', err);
        }
      }

      return { remoteFile, sizeBytes };
    } finally {
      // Cleanup temp files
      for (const f of [tmpZip, tmpEncrypted]) {
        try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
      }
    }
  }

  async restoreFromCloud(
    profile: Profile,
    remoteFileRef: string,
    provider: 'googledrive' | 's3',
    passphraseKey: Buffer,
    onProgress?: (p: SyncProgress) => void
  ): Promise<void> {
    this.requireCloudServices();

    if (this.chromeLauncher.isRunning(profile.id)) {
      throw new Error(`Profile "${profile.name}" is running. Please close it before restoring.`);
    }

    const tmpDir = os.tmpdir();
    const tmpEncrypted = path.join(tmpDir, `ezprofile_dl_${profile.id}_${Date.now()}.ezpsync`);
    const tmpZip = path.join(tmpDir, `ezprofile_dl_${profile.id}_${Date.now()}.zip`);

    try {
      // 1. Download
      onProgress?.({ profileId: profile.id, message: 'Downloading from cloud...', percent: 20 });
      if (provider === 'googledrive') {
        await this.gdriveService!.downloadFile(remoteFileRef, tmpEncrypted);
      } else {
        await this.s3Service!.downloadFile(remoteFileRef, tmpEncrypted);
      }

      // 2. Decrypt
      onProgress?.({ profileId: profile.id, message: 'Decrypting...', percent: 50 });
      const zipData = await this.readEzpsyncFile(tmpEncrypted, passphraseKey);
      fs.writeFileSync(tmpZip, zipData);

      // 3. Restore
      onProgress?.({ profileId: profile.id, message: 'Restoring profile data...', percent: 70 });
      if (fs.existsSync(profile.user_data_dir)) {
        fs.rmSync(profile.user_data_dir, { recursive: true, force: true });
      }
      fs.mkdirSync(profile.user_data_dir, { recursive: true });
      const zip = new AdmZip(tmpZip);
      zip.extractAllTo(profile.user_data_dir, true);

      // 4. Re-import portable cookies via CDP (cross-platform restore)
      onProgress?.({ profileId: profile.id, message: 'Restoring cookies...', percent: 85 });
      await this.reimportPortableCookies(profile);

      // 5. Log
      this.writeSyncLog(profile.id, provider, 'download', 'success', remoteFileRef);
      onProgress?.({ profileId: profile.id, message: 'Restore complete!', percent: 100 });
    } catch (err: any) {
      this.writeSyncLog(profile.id, provider, 'download', 'error', remoteFileRef, undefined, err.message);
      throw err;
    } finally {
      for (const f of [tmpEncrypted, tmpZip]) {
        try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
      }
    }
  }

  async listCloudBackups(profileId: string | undefined, provider: 'googledrive' | 's3'): Promise<CloudBackupEntry[]> {
    this.requireCloudServices();
    if (provider === 'googledrive') {
      return this.gdriveService!.listBackups(profileId) as Promise<CloudBackupEntry[]>;
    } else {
      return this.s3Service!.listBackups(profileId) as Promise<CloudBackupEntry[]>;
    }
  }

  async deleteCloudBackup(remoteFileRef: string, provider: 'googledrive' | 's3'): Promise<void> {
    this.requireCloudServices();
    if (provider === 'googledrive') {
      await this.gdriveService!.deleteBackup(remoteFileRef);
    } else {
      await this.s3Service!.deleteBackup(remoteFileRef);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // .ezpsync file helpers
  // ─────────────────────────────────────────────────────────────

  private async writeEzpsyncFile(
    filePath: string,
    zipData: Buffer,
    key: Buffer,
    metadata: { profileId: string; profileName: string; createdAt: string; appVersion: string }
  ): Promise<void> {
    const enc = this.encryptionSvc!;

    // PBKDF2 salt embedded in file (caller already derived key externally)
    // We store the salt so the receiving machine can re-derive using the same passphrase
    const salt = enc.generateSalt();
    const { iv, ciphertext, tag } = enc.encrypt(zipData, key);

    const metaJson = Buffer.from(JSON.stringify(metadata), 'utf-8');
    const metaLen = Buffer.allocUnsafe(4);
    metaLen.writeUInt32LE(metaJson.length, 0);

    const out = Buffer.concat([
      MAGIC,
      Buffer.from([FORMAT_VERSION]),
      salt,        // 32 bytes
      iv,          // 12 bytes
      tag,         // 16 bytes
      metaLen,     // 4 bytes
      metaJson,    // N bytes
      ciphertext,  // remaining
    ]);

    fs.writeFileSync(filePath, out);
  }

  private async readEzpsyncFile(filePath: string, key: Buffer): Promise<Buffer> {
    const data = fs.readFileSync(filePath);
    const enc = this.encryptionSvc!;

    // Validate magic
    if (!data.subarray(0, 4).equals(MAGIC)) {
      throw new Error('Invalid .ezpsync file (bad magic bytes)');
    }

    const version = data[4];
    if (version !== FORMAT_VERSION) {
      throw new Error(`Unsupported .ezpsync version: ${version}`);
    }

    // Parse header
    let offset = 5;
    const salt = data.subarray(offset, offset + 32); offset += 32;
    const iv = data.subarray(offset, offset + 12); offset += 12;
    const tag = data.subarray(offset, offset + 16); offset += 16;
    const metaLen = data.readUInt32LE(offset); offset += 4;
    offset += metaLen; // skip metadata (plaintext)
    const ciphertext = data.subarray(offset);

    try {
      return enc.decrypt({ iv, ciphertext, tag }, key);
    } catch {
      throw new Error('Decryption failed — wrong passphrase or corrupted file.');
    }
  }

  // ─────────────────────────────────────────────────────────────
  // sync_log write
  // ─────────────────────────────────────────────────────────────

  private writeSyncLog(
    profileId: string,
    provider: string,
    direction: 'upload' | 'download',
    status: 'success' | 'error',
    remoteFile?: string,
    sizeBytes?: number,
    errorMessage?: string
  ): void {
    if (!this.profileManager) return;
    try {
      this.profileManager.writeSyncLog({ profileId, provider, direction, status, remoteFile, sizeBytes, errorMessage });
    } catch {}
  }

  // ─────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────

  private requireCloudServices(): void {
    if (!this.encryptionSvc || !this.profileManager) {
      throw new Error('Cloud sync not initialized. Please restart the app.');
    }
  }

  private addDirectoryToZip(
    dirPath: string,
    zipPath: string,
    zip: AdmZip,
    ignoreFolders: string[],
    ignoreFiles: string[]
  ) {
    if (!fs.existsSync(dirPath)) return;

    const items = fs.readdirSync(dirPath);
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const relativeZipFn = zipPath ? `${zipPath}/${item}` : item;

      if (ignoreFiles.includes(item)) continue;

      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) {
        if (ignoreFolders.some((f) => relativeZipFn.includes(f))) continue;
        zip.addFile(`${relativeZipFn}/`, Buffer.alloc(0));
        this.addDirectoryToZip(fullPath, relativeZipFn, zip, ignoreFolders, ignoreFiles);
      } else {
        zip.addLocalFile(fullPath, zipPath);
      }
    }
  }
}
