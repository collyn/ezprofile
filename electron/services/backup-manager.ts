import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { Profile } from './profile-manager';
import { ChromeLauncher } from './chrome-launcher';
import { WebContents } from 'electron';

export class BackupManager {
  constructor(private chromeLauncher: ChromeLauncher) {}

  async backupProfile(profile: Profile, targetZipPath: string, webContents?: WebContents): Promise<void> {
    if (this.chromeLauncher.isRunning(profile.id)) {
      throw new Error(`Profile "${profile.name}" is running. Please close it before backing up.`);
    }

    if (!fs.existsSync(profile.user_data_dir)) {
      throw new Error(`Data directory of profile "${profile.name}" does not exist.`);
    }

    // Send initial progress
    if (webContents) {
      webContents.send('profile:backupProgress', profile.id, 'Compressing data...');
    }

    try {
      const zip = new AdmZip();
      
      // Mẹo: Tránh lưu các file rác và cache quá lớn
      // addLocalFolder(path, zipRoot)
      const ignoreFolders = ['Cache', 'Code Cache', 'GPUCache', 'Service Worker/CacheStorage'];
      const ignoreFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];

      // Recursively add files avoiding ignored elements
      this.addDirectoryToZip(profile.user_data_dir, '', zip, ignoreFolders, ignoreFiles);

      // Save sync (adm-zip save async is sometimes buggy for large files)
      zip.writeZip(targetZipPath);
    } catch (error: any) {
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
      // 1. Dọn dẹp folder cũ
      if (fs.existsSync(profile.user_data_dir)) {
        fs.rmSync(profile.user_data_dir, { recursive: true, force: true });
      }
      fs.mkdirSync(profile.user_data_dir, { recursive: true });

      // 2. Extract zip mới vào
      const zip = new AdmZip(sourceZipPath);
      zip.extractAllTo(profile.user_data_dir, true);
    } catch (error: any) {
      throw new Error(`Extraction error: ${error.message}`);
    }
  }

  // Khử các thư mục Cache khổng lồ khi add file vào zip
  private addDirectoryToZip(dirPath: string, zipPath: string, zip: AdmZip, ignoreFolders: string[], ignoreFiles: string[]) {
    if (!fs.existsSync(dirPath)) return;

    const items = fs.readdirSync(dirPath);
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const relativeZipFn = zipPath ? `${zipPath}/${item}` : item;

      // Filter
      if (ignoreFiles.includes(item)) continue;
      
      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) {
        if (ignoreFolders.some(f => relativeZipFn.includes(f))) {
          continue; // skip cache folders
        }
        zip.addFile(`${relativeZipFn}/`, Buffer.alloc(0)); // empty dir entry
        this.addDirectoryToZip(fullPath, relativeZipFn, zip, ignoreFolders, ignoreFiles);
      } else {
        zip.addLocalFile(fullPath, zipPath);
      }
    }
  }
}
