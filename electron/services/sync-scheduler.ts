import { BrowserWindow } from 'electron';
import pLimit from 'p-limit';
import { ProfileManager } from './profile-manager';
import { BackupManager, SyncProgress } from './backup-manager';

const CONCURRENCY = 5; // max parallel uploads

export interface SyncAllResult {
  total: number;
  success: number;
  failed: number;
  errors: { profileId: string; name: string; error: string }[];
}

export class SyncScheduler {
  private passphraseKey: Buffer | null = null;

  constructor(
    private profileManager: ProfileManager,
    private backupManager: BackupManager,
    private mainWindow: () => BrowserWindow | null
  ) {}

  // ─────────────────────────────────────────
  // Passphrase (in-memory session only)
  // ─────────────────────────────────────────

  setPassphraseKey(key: Buffer): void {
    this.passphraseKey = key;
  }

  clearPassphraseKey(): void {
    this.passphraseKey = null;
  }

  hasPassphrase(): boolean {
    return this.passphraseKey !== null;
  }

  getPassphraseKey(): Buffer | null {
    return this.passphraseKey;
  }

  // ─────────────────────────────────────────
  // Sync operations
  // ─────────────────────────────────────────

  /**
   * Upload all profiles with max CONCURRENCY parallel uploads.
   */
  async syncAll(provider: 'googledrive' | 's3', isBackup = false): Promise<SyncAllResult> {
    if (!this.passphraseKey) {
      throw new Error('Sync passphrase not set. Please enter your encryption passphrase in Settings.');
    }

    const profiles = this.profileManager.getAll().filter((p) => p.status !== 'running');
    const limit = pLimit(CONCURRENCY);
    const result: SyncAllResult = { total: profiles.length, success: 0, failed: 0, errors: [] };
    const key = this.passphraseKey;

    await Promise.all(
      profiles.map((profile) =>
        limit(async () => {
          try {
            await this.backupManager.backupToCloud(profile, provider, key, isBackup, (progress: SyncProgress) => {
              this.emitProgress(progress);
            });
            result.success++;
          } catch (err: any) {
            result.failed++;
            result.errors.push({ profileId: profile.id, name: profile.name, error: err.message });
            console.error(`[SyncScheduler] Failed to sync profile "${profile.name}":`, err.message);
          }
        })
      )
    );

    // Notify renderer
    const win = this.mainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('sync:allComplete', result);
    }

    return result;
  }

  /**
   * Upload a single profile.
   */
  async syncOne(profileId: string, provider: 'googledrive' | 's3', isBackup?: boolean): Promise<void> {
    if (!this.passphraseKey) {
      throw new Error('Sync passphrase not set.');
    }
    const profile = this.profileManager.getById(profileId);
    if (!profile) throw new Error('Profile not found');

    await this.backupManager.backupToCloud(profile, provider, this.passphraseKey, isBackup, (progress: SyncProgress) => {
      this.emitProgress(progress);
    });
  }

  /**
   * Upload a single profile silently, on profile close. (isBackup = false)
   */
  async syncOneOnClose(profileId: string): Promise<void> {
    const provider = this.profileManager.getSetting('sync_provider') as 'googledrive' | 's3' | null;
    if (!provider || !this.passphraseKey) return;

    try {
      // Fire and forget upload (sync mode - overwrite)
      await this.syncOne(profileId, provider, false);
      console.log(`[SyncScheduler] Auto-sync on close successful for profile ${profileId}`);
    } catch (err: any) {
      console.error(`[SyncScheduler] Failed to auto-sync on close for profile ${profileId}:`, err.message);
      throw err;
    }
  }

  /**
   * Restore a single profile from cloud.
   */
  async restoreOne(profileId: string, remoteFileRef: string, provider: 'googledrive' | 's3'): Promise<void> {
    if (!this.passphraseKey) {
      throw new Error('Sync passphrase not set.');
    }
    const profile = this.profileManager.getById(profileId);
    if (!profile) throw new Error('Profile not found');

    await this.backupManager.restoreFromCloud(profile, remoteFileRef, provider, this.passphraseKey, (progress: SyncProgress) => {
      this.emitProgress(progress);
    });
  }

  /**
   * Restore a single profile using a specific key (for old backups with different passphrase).
   */
  async restoreOneWithKey(profileId: string, remoteFileRef: string, provider: 'googledrive' | 's3', key: Buffer): Promise<void> {
    const profile = this.profileManager.getById(profileId);
    if (!profile) throw new Error('Profile not found');

    await this.backupManager.restoreFromCloud(profile, remoteFileRef, provider, key, (progress: SyncProgress) => {
      this.emitProgress(progress);
    });
  }

  // ─────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────

  private emitProgress(progress: SyncProgress): void {
    const win = this.mainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('sync:progress', progress);
    }
  }
}
