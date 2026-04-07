import { IpcMain, BrowserWindow, dialog, app } from 'electron';
import { ProfileManager } from './services/profile-manager';
import { ChromeLauncher } from './services/chrome-launcher';
import { ProxyChecker } from './services/proxy-checker';
import { CookieManager } from './services/cookie-manager';
import { BackupManager } from './services/backup-manager';
import { BrowserVersionManager } from './services/browser-version-manager';
import { EncryptionService } from './services/encryption-service';
import { GDriveService } from './services/gdrive-service';
import { S3Service } from './services/s3-service';
import { SyncScheduler } from './services/sync-scheduler';
import { exportData, importData } from './utils/import-export';
import { autoUpdater } from 'electron-updater';
import * as fs from 'fs';

export function registerIpcHandlers(
  ipcMain: IpcMain,
  profileManager: ProfileManager,
  chromeLauncher: ChromeLauncher,
  proxyChecker: ProxyChecker,
  cookieManager: CookieManager,
  backupManager: BackupManager,
  browserVersionManager: BrowserVersionManager,
  mainWindow: BrowserWindow | null,
  encryptionSvc?: EncryptionService,
  gdriveService?: GDriveService,
  s3Service?: S3Service,
  syncScheduler?: SyncScheduler
) {
  // Cleanup stale 'running' statuses from crashed sessions (using lock files).
  // Runs on startup and every 60s — NOT on every getAll to avoid race conditions.
  const cleanupStaleStatuses = () => {
    const profiles = profileManager.getAll();
    for (const p of profiles) {
      if (p.status === 'running' && !chromeLauncher.isRunning(p.id)) {
        if (!ChromeLauncher.isProfileActuallyRunning(p.user_data_dir)) {
          profileManager.updateStatus(p.id, 'ready');
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('profile:statusChanged', p.id, 'ready');
          }
        }
      }
    }
  };
  cleanupStaleStatuses();
  setInterval(cleanupStaleStatuses, 60000);

  // Profile operations
  ipcMain.handle('profile:getAll', () => {
    const profiles = profileManager.getAll();
    // Combine in-memory status (this instance) with DB status (other instances).
    // In-memory check wins for this instance; otherwise trust DB status.
    // Strip password_hash from response — frontend only sees has_password boolean.
    return profiles.map((p) => {
      const { password_hash, ...rest } = p as any;
      return {
        ...rest,
        status: chromeLauncher.isRunning(p.id) ? 'running' : p.status,
      };
    });
  });

  ipcMain.handle('profile:create', (_event, data) => {
    // Auto-generate a fingerprint seed for CloakBrowser profiles so each profile
    // gets a unique, stable fingerprint that persists across launches and backup/restore.
    if (data.browser_version && browserVersionManager.isCloakBrowserVersion(data.browser_version)) {
      let fpFlags: Record<string, string> = {};
      if (data.fingerprint_flags) {
        try { fpFlags = JSON.parse(data.fingerprint_flags); } catch {}
      }
      if (!fpFlags.seed) {
        const crypto = require('crypto');
        fpFlags.seed = crypto.randomInt(100000, 999999999).toString();
        data.fingerprint_flags = JSON.stringify(fpFlags);
      }
    }
    return profileManager.create(data);
  });

  ipcMain.handle('profile:update', (_event, id, data) => {
    return profileManager.update(id, data);
  });

  ipcMain.handle('profile:updateBatch', (_event, ids, data) => {
    profileManager.updateMany(ids, data);
  });

  ipcMain.handle('profile:clone', async (_event, id) => {
    const cloned = profileManager.clone(id);
    // Generate a new unique fingerprint seed for the clone so it has its own identity
    if (cloned.browser_version && browserVersionManager.isCloakBrowserVersion(cloned.browser_version)) {
      let fpFlags: Record<string, string> = {};
      if (cloned.fingerprint_flags) {
        try { fpFlags = JSON.parse(cloned.fingerprint_flags); } catch {}
      }
      const crypto = require('crypto');
      fpFlags.seed = crypto.randomInt(100000, 999999999).toString();
      profileManager.update(cloned.id, { fingerprint_flags: JSON.stringify(fpFlags) });
      console.log(`[IPC] Generated new fingerprint seed ${fpFlags.seed} for cloned profile ${cloned.id}`);
    }
    return profileManager.getById(cloned.id)!;
  });

  // Password management
  ipcMain.handle('profile:setPassword', async (_event, id: string, password: string) => {
    profileManager.setPassword(id, password);
  });

  ipcMain.handle('profile:removePassword', async (_event, id: string, password: string) => {
    const valid = profileManager.verifyPassword(id, password);
    if (!valid) throw new Error('Wrong password');
    profileManager.removePassword(id);
  });

  ipcMain.handle('profile:verifyPassword', async (_event, id: string, password: string) => {
    return profileManager.verifyPassword(id, password);
  });

  ipcMain.handle('profile:delete', async (_event, id) => {
    await chromeLauncher.stop(id);
    profileManager.delete(id);
  });

  ipcMain.handle('profile:deleteMany', async (_event, ids) => {
    for (const id of ids) {
      await chromeLauncher.stop(id);
    }
    profileManager.deleteMany(ids);
  });

  ipcMain.handle('profile:export', async (_event, ids?: string[]) => {
    if (!mainWindow) return { success: false, error: 'No main window' };
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Profiles',
        defaultPath: 'profiles.xlsx',
        filters: [
          { name: 'Excel', extensions: ['xlsx'] },
          { name: 'JSON', extensions: ['json'] }
        ]
      });

      if (canceled || !filePath) return { success: true, canceled: true };

      const profiles = (ids && ids.length > 0) ? profileManager.getMany(ids) : profileManager.getAll();
      const exportItems = profiles.map(p => {
        // Exclude internal fields like user_data_dir, status, last_run_at unless useful
        const { user_data_dir, status, last_run_at, created_at, updated_at, password_hash, ...cleanProfile } = p as any;
        return cleanProfile;
      });

      exportData(filePath, exportItems);
      return { success: true };
    } catch (err: any) {
      console.error(err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('profile:import', async () => {
    if (!mainWindow) return { success: false, error: 'No main window' };
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: 'Excel or JSON', extensions: ['xlsx', 'json'] }
        ]
      });

      if (canceled || filePaths.length === 0) return { success: true, canceled: true };

      const records = importData(filePaths[0]);
      if (!Array.isArray(records) || records.length === 0) {
        throw new Error('File does not contain valid data');
      }

      const profilesCreated = profileManager.importMany(records as any);
      return { success: true, count: profilesCreated.length };
    } catch (err: any) {
      console.error(err);
      return { success: false, error: err.message };
    }
  });

  // Chrome launcher
  ipcMain.handle('chrome:launch', async (_event, id) => {
    const profile = profileManager.getById(id);
    if (!profile) throw new Error('Profile not found');
    if (chromeLauncher.isRunning(id)) throw new Error('Profile is already running in this session');

    // Parse fingerprint flags once; auto-generate seed if CloakBrowser profile lacks one.
    // This is a fallback for profiles created before auto-seed was added to profile:create.
    let fpFlags: Record<string, string> | undefined;
    const isCB = browserVersionManager.isCloakBrowserVersion(profile.browser_version || '');
    if (isCB) {
      fpFlags = profile.fingerprint_flags ? JSON.parse(profile.fingerprint_flags) : {};
      if (!fpFlags!.seed) {
        const crypto = require('crypto');
        fpFlags!.seed = crypto.randomInt(100000, 999999999).toString();
        // Persist the generated seed so future launches use the same fingerprint
        profileManager.update(id, { fingerprint_flags: JSON.stringify(fpFlags) });
        console.log(`[IPC] Auto-generated fingerprint seed ${fpFlags!.seed} for profile ${id}`);
      }
    } else if (profile.fingerprint_flags) {
      fpFlags = JSON.parse(profile.fingerprint_flags);
    }

    try {
      const child = await chromeLauncher.launch(id, profile.user_data_dir, {
        proxyType: profile.proxy_enabled ? (profile.proxy_type || undefined) : undefined,
        proxyHost: profile.proxy_enabled ? (profile.proxy_host || undefined) : undefined,
        proxyPort: profile.proxy_enabled ? (profile.proxy_port || undefined) : undefined,
        proxyUser: profile.proxy_enabled ? (profile.proxy_user || undefined) : undefined,
        proxyPass: profile.proxy_enabled ? (profile.proxy_pass || undefined) : undefined,
        startupUrl: profile.startup_url || undefined,
        startupType: profile.startup_type || 'continue',
        startupUrls: profile.startup_urls || undefined,
        browserVersion: profile.browser_version || 'system',
        fingerprintFlags: fpFlags,
      });

      profileManager.updateStatus(id, 'running');

      child.on('exit', () => {
        // Only update status to ready if the process wasn't killed by another session taking over
        // Actually, if it exits, it's ready.
        profileManager.updateStatus(id, 'ready');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('profile:statusChanged', id, 'ready');
        }
        // Auto-sync on close if enabled
        if (profileManager.getSetting('sync_auto_sync_on_close') === 'true') {
          syncScheduler?.syncOneOnClose(id).catch(err => {
            console.error('[IPC] Auto-sync on closed failed:', err);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('profile:toast', 'error', `Auto-sync failed: ${err.message || err}`);
            }
          });
        }
      });

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('profile:statusChanged', id, 'running');
      }
    } catch (err: any) {
      // If launch fails (e.g. locked by another RDP session), ensure status is correct
      if (!ChromeLauncher.isProfileActuallyRunning(profile.user_data_dir)) {
         profileManager.updateStatus(id, 'ready');
         if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('profile:statusChanged', id, 'ready');
         }
      }
      throw err;
    }
  });

  ipcMain.handle('chrome:stop', async (_event, id) => {
    const profile = profileManager.getById(id);
    const stopped = await chromeLauncher.stop(id);

    // If not stopped locally, try stopping from another session via lock file
    if (!stopped && profile) {
      ChromeLauncher.stopByLockFile(profile.user_data_dir);
    }

    profileManager.updateStatus(id, 'ready');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('profile:statusChanged', id, 'ready');
    }

    // Auto-sync on close if enabled
    if (profileManager.getSetting('sync_auto_sync_on_close') === 'true') {
      syncScheduler?.syncOneOnClose(id).catch(err => {
        console.error('[IPC] Auto-sync on closed failed:', err);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('profile:toast', 'error', `Auto-sync failed: ${err.message || err}`);
        }
      });
    }
  });

  // Proxy operations
  ipcMain.handle('proxy:check', async (_event, type, host, port, user, pass) => {
    return proxyChecker.check(type, host, port, user, pass);
  });

  // Proxy list management
  ipcMain.handle('proxy:getAll', () => {
    return profileManager.getProxies();
  });

  ipcMain.handle('proxy:create', (_event, data) => {
    return profileManager.createProxy(data);
  });

  ipcMain.handle('proxy:update', (_event, id, data) => {
    return profileManager.updateProxy(id, data);
  });

  ipcMain.handle('proxy:delete', (_event, id) => {
    profileManager.deleteProxy(id);
  });

  // Cookie operations
  ipcMain.handle('cookie:export', async (_event, profileId: string) => {
    if (!mainWindow) return { success: false, error: 'No main window' };
    const profile = profileManager.getById(profileId);
    if (!profile) return { success: false, error: 'Profile not found' };

    try {
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Cookies',
        defaultPath: `cookies_${profile.name}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });

      if (canceled || !filePath) return { success: true, canceled: true };

      await cookieManager.exportCookies(profile, filePath);
      return { success: true };
    } catch (err: any) {
      console.error(err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cookie:import', async (_event, profileId: string) => {
    if (!mainWindow) return { success: false, error: 'No main window' };
    const profile = profileManager.getById(profileId);
    if (!profile) return { success: false, error: 'Profile not found' };

    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Import Cookies',
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });

      if (canceled || filePaths.length === 0) return { success: true, canceled: true };

      await cookieManager.importCookies(profile, filePaths[0]);
      return { success: true };
    } catch (err: any) {
      console.error(err);
      return { success: false, error: err.message };
    }
  });

  // Group operations
  ipcMain.handle('group:getAll', () => {
    return profileManager.getGroups();
  });

  ipcMain.handle('group:create', (_event, name, color) => {
    profileManager.createGroup(name, color);
  });

  ipcMain.handle('group:delete', (_event, id) => {
    profileManager.deleteGroup(id);
  });

  // Settings
  ipcMain.handle('settings:getChromePath', () => {
    try {
      return chromeLauncher.getChromePath();
    } catch {
      return '';
    }
  });

  ipcMain.handle('settings:setChromePath', (_event, chromePath) => {
    chromeLauncher.setChromePath(chromePath);
    profileManager.setSetting('chrome_path', chromePath);
  });

  ipcMain.handle('settings:selectChromePath', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Chrome/Chromium', extensions: ['exe', ''] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const selectedPath = result.filePaths[0];
    chromeLauncher.setChromePath(selectedPath);
    profileManager.setSetting('chrome_path', selectedPath);
    return selectedPath;
  });

  ipcMain.handle('settings:getProfilesDir', () => {
    const saved = profileManager.getSetting('profiles_dir');
    if (saved) return saved;
    // Return default profiles directory
    return require('path').join(app.getPath('userData'), 'profiles');
  });

  ipcMain.handle('settings:setProfilesDir', (_event, dir: string) => {
    profileManager.setSetting('profiles_dir', dir);
  });

  ipcMain.handle('settings:selectProfilesDir', async () => {
    if (!mainWindow) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Profiles Directory',
      properties: ['openDirectory'],
    });
    if (canceled || filePaths.length === 0) return null;
    return filePaths[0];
  });

  // Check Update on Startup setting
  ipcMain.handle('settings:getCheckUpdateOnStartup', () => {
    const val = profileManager.getSetting('check_update_on_startup');
    // Default to true if never set
    return val === null || val === undefined ? true : val === 'true';
  });

  ipcMain.handle('settings:setCheckUpdateOnStartup', (_event, enabled: boolean) => {
    profileManager.setSetting('check_update_on_startup', enabled ? 'true' : 'false');
  });



  // Window controls
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.handle('window:close', () => {
    mainWindow?.close();
  });

  // Load saved Chrome path
  const savedChromePath = profileManager.getSetting('chrome_path');
  if (savedChromePath) {
    chromeLauncher.setChromePath(savedChromePath);
  }

  // Backup operations
  ipcMain.handle('profile:backup', async (event, profileId) => {
    try {
      const profile = profileManager.getById(profileId);
      if (!profile) return { success: false, error: "Profile does not exist" };

      if (!mainWindow) return { success: false, error: "No main window" };

      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: `Backup Profile: ${profile.name}`,
        defaultPath: `ezprofile_backup_${profile.name}_${Date.now()}.ezpsync`,
        filters: [
          { name: 'EzProfile Protected Sync Backup', extensions: ['ezpsync'] },
          { name: 'Legacy Zip Files', extensions: ['zip'] }
        ]
      });

      if (canceled || !filePath) {
        return { success: false, canceled: true };
      }

      await backupManager.backupProfile(profile, filePath, event.sender);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('profile:restore', async (event, profileId) => {
    try {
      const profile = profileManager.getById(profileId);
      if (!profile) return { success: false, error: "Profile does not exist" };

      if (!mainWindow) return { success: false, error: "No main window" };

      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: `Restore Data for: ${profile.name}`,
        properties: ['openFile'],
        filters: [
          { name: 'EzProfile Protected Sync Backup', extensions: ['ezpsync'] },
          { name: 'Legacy Zip Files', extensions: ['zip'] }
        ]
      });

      if (canceled || filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      await backupManager.restoreProfile(profile, filePaths[0], event.sender);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Browser version management
  ipcMain.handle('browser:getAvailable', async () => {
    try {
      const [chromeVersions, cloakVersions] = await Promise.all([
        browserVersionManager.getAvailableVersions(),
        browserVersionManager.getCloakBrowserVersions(),
      ]);
      // CloakBrowser versions first, then Chrome versions
      return [...cloakVersions, ...chromeVersions];
    } catch (error: any) {
      console.error('Failed to fetch available versions:', error);
      return [];
    }
  });

  ipcMain.handle('browser:getInstalled', () => {
    return browserVersionManager.getInstalledVersions();
  });

  ipcMain.handle('browser:download', async (event, version: string, channel: string) => {
    try {
      if (channel === 'CloakBrowser') {
        await browserVersionManager.downloadCloakBrowserVersion(version, event.sender);
      } else {
        await browserVersionManager.downloadVersion(version, channel, event.sender);
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('browser:delete', (_event, version: string) => {
    try {
      browserVersionManager.deleteVersion(version);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('browser:addCustom', async () => {
    if (!mainWindow) return { success: false, error: 'No main window' };
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Chrome Folder',
        properties: ['openDirectory'],
      });
      if (canceled || filePaths.length === 0) return { success: false, canceled: true };

      const dir = filePaths[0];
      const chromeBinary = browserVersionManager.findChromeBinary(dir);
      if (!chromeBinary) {
        return { success: false, error: 'No Chrome binary found in selected folder' };
      }

      // Use folder name as version name
      const folderName = require('path').basename(dir);
      const versionName = `Custom - ${folderName}`;
      browserVersionManager.addCustomVersion(versionName, chromeBinary);
      return { success: true, version: versionName, chromePath: chromeBinary };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('browser:getDefault', () => {
    return browserVersionManager.getDefaultVersion();
  });

  ipcMain.handle('browser:setDefault', (_event, version: string) => {
    browserVersionManager.setDefaultVersion(version);
    return { success: true };
  });

  // Auto-Updater handlers
  ipcMain.handle('updater:check', () => {
    autoUpdater.checkForUpdates();
  });

  ipcMain.handle('updater:download', () => {
    autoUpdater.downloadUpdate();
  });

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall();
  });

  // App handlers
  ipcMain.handle('app:getVersion', () => {
    return app.getVersion();
  });

  ipcMain.handle('app:getPlatform', () => {
    return process.platform;
  });

  ipcMain.handle('app:openExternal', (_event, url: string) => {
    const { shell } = require('electron');
    return shell.openExternal(url);
  });

  // ──────────────────────────────────────────────────────────
  // Sync / Cloud Backup handlers
  // ──────────────────────────────────────────────────────────

  ipcMain.handle('sync:getSettings', () => {
    const provider = profileManager.getSetting('sync_provider') || null;
    const autoSyncOnClose = profileManager.getSetting('sync_auto_sync_on_close') === 'true';
    const syncMaxBackups = parseInt(profileManager.getSetting('sync_max_backups') ?? '5', 10);
    const passphraseHint = profileManager.getSetting('sync_passphrase_hint') || '';
    const gdriveStatus = gdriveService?.getAuthStatus() ?? { connected: false };
    const gdriveClientId = gdriveService?.getClientId() ?? '';
    const s3Config = s3Service?.getStoredConfig() ?? null;

    return {
      provider: provider as 'googledrive' | 's3' | null,
      autoSyncOnClose,
      syncMaxBackups,
      passphraseHint,
      gdrive: { ...gdriveStatus, clientId: gdriveClientId, hasSecret: !!(gdriveService?.getClientSecret()) },
      s3: s3Config ? {
        accessKeyId: s3Config.accessKeyId,
        bucket: s3Config.bucket,
        region: s3Config.region,
        prefix: s3Config.prefix,
        endpoint: s3Config.endpoint,
        hasSecret: s3Config.hasSecret,
        connected: false,
      } : null,
      hasPassphrase: syncScheduler?.hasPassphrase() || !!profileManager.getSetting('sync_encrypted_key'),
    };
  });

  ipcMain.handle('sync:saveGoogleClientId', (_event, clientId: string) => {
    if (!gdriveService) return { success: false, error: 'GDrive service not available' };
    if (!clientId.trim()) return { success: false, error: 'Client ID cannot be empty' };
    gdriveService.saveClientId(clientId);
    return { success: true };
  });

  ipcMain.handle('sync:saveGoogleClientSecret', (_event, secret: string) => {
    if (!gdriveService) return { success: false, error: 'GDrive service not available' };
    if (!secret.trim()) return { success: false, error: 'Client Secret cannot be empty' };
    gdriveService.saveClientSecret(secret);
    return { success: true };
  });

  ipcMain.handle('sync:setProvider', (_event, provider: string) => {
    profileManager.setSetting('sync_provider', provider);
  });

  ipcMain.handle('sync:saveS3Config', (_event, config: {
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    region: string;
    prefix: string;
    endpoint?: string;
  }) => {
    if (!s3Service) return { success: false, error: 'S3 service not available' };
    s3Service.saveToSettings(config);
    return { success: true };
  });

  ipcMain.handle('sync:testS3', async () => {
    if (!s3Service) return { success: false, error: 'S3 service not available' };
    return s3Service.testConnection();
  });

  ipcMain.handle('sync:startGoogleAuth', async () => {
    if (!gdriveService || !mainWindow) return { success: false, error: 'GDrive service not available' };
    try {
      const result = await gdriveService.authenticate();
      return { success: true, email: result.email };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('sync:getGoogleAuthStatus', () => {
    return gdriveService?.getAuthStatus() ?? { connected: false };
  });

  ipcMain.handle('sync:revokeGoogle', async () => {
    if (!gdriveService) return { success: false, error: 'GDrive service not available' };
    try {
      await gdriveService.revokeAuth();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('sync:setPassphrase', async (_event, passphrase: string, hint?: string) => {
    if (!syncScheduler || !encryptionSvc) return { success: false, error: 'Sync not initialized' };
    try {
      // Get or generate the persistent salt stored in DB
      let saltHex = profileManager.getSetting('sync_encryption_salt');
      let salt: Buffer;
      if (!saltHex) {
        salt = encryptionSvc.generateSalt();
        profileManager.setSetting('sync_encryption_salt', salt.toString('hex'));
      } else {
        salt = Buffer.from(saltHex, 'hex');
      }

      const key = await encryptionSvc.deriveKey(passphrase, salt);
      syncScheduler.setPassphraseKey(key);

      // Persist the derived key encrypted with machine key
      const encryptedKeyHex = encryptionSvc.encryptString(key.toString('hex'));
      profileManager.setSetting('sync_encrypted_key', encryptedKeyHex);

      if (hint !== undefined) {
        profileManager.setSetting('sync_passphrase_hint', hint);
      }


      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('sync:changePassphrase', async (_event, oldPassphrase: string, newPassphrase: string, newHint?: string) => {
    if (!syncScheduler || !encryptionSvc) return { success: false, error: 'Sync not initialized' };
    try {
      // Verify old passphrase
      const saltHex = profileManager.getSetting('sync_encryption_salt');
      if (!saltHex) return { success: false, error: 'No existing passphrase configured' };
      const salt = Buffer.from(saltHex, 'hex');
      const oldKey = await encryptionSvc.deriveKey(oldPassphrase, salt);

      // Compare with stored key
      const storedEncryptedKey = profileManager.getSetting('sync_encrypted_key');
      if (!storedEncryptedKey) return { success: false, error: 'No existing passphrase configured' };
      const storedKeyHex = encryptionSvc.decryptString(storedEncryptedKey);
      const storedKey = Buffer.from(storedKeyHex, 'hex');

      const crypto = require('crypto');
      if (!crypto.timingSafeEqual(oldKey, storedKey)) {
        return { success: false, error: 'wrong_passphrase' };
      }

      // Generate new salt + derive new key
      const newSalt = encryptionSvc.generateSalt();
      const newKey = await encryptionSvc.deriveKey(newPassphrase, newSalt);

      // Persist
      profileManager.setSetting('sync_encryption_salt', newSalt.toString('hex'));
      const encryptedKeyHex = encryptionSvc.encryptString(newKey.toString('hex'));
      profileManager.setSetting('sync_encrypted_key', encryptedKeyHex);
      if (newHint !== undefined) {
        profileManager.setSetting('sync_passphrase_hint', newHint);
      }

      syncScheduler.setPassphraseKey(newKey);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('sync:clearPassphrase', () => {
    if (!syncScheduler) return { success: false, error: 'Sync not initialized' };
    syncScheduler.clearPassphraseKey();
    profileManager.setSetting('sync_encrypted_key', '');
    profileManager.setSetting('sync_encryption_salt', '');
    profileManager.setSetting('sync_passphrase_hint', '');
    profileManager.setSetting('sync_auto_sync_on_close', 'false');
    return { success: true };
  });

  ipcMain.handle('sync:hasPassphrase', () => {
    return (syncScheduler?.hasPassphrase() ?? false) || !!profileManager.getSetting('sync_encrypted_key');
  });

  ipcMain.handle('sync:uploadProfile', async (_event, profileId: string, isBackup?: boolean, targetProvider?: 'googledrive' | 's3' | 'all') => {
    if (!syncScheduler) return { success: false, error: 'Sync not initialized' };
    
    let providers: ('googledrive' | 's3')[] = [];
    if (targetProvider === 'all') {
       providers = ['googledrive', 's3'];
    } else if (targetProvider === 'googledrive' || targetProvider === 's3') {
       providers = [targetProvider];
    } else {
       const defaultProvider = profileManager.getSetting('sync_provider') as 'googledrive' | 's3' | null;
       if (!defaultProvider) return { success: false, error: 'No sync provider configured' };
       providers = [defaultProvider];
    }

    try {
      let results = [];
      let errs = [];
      for (const p of providers) {
         try {
           await syncScheduler.syncOne(profileId, p, isBackup);
           results.push(p);
         } catch (e: any) {
           if (targetProvider === 'all' && (e.message.includes('not initialized') || e.message.includes('Not configured'))) {
              // Ignore unconfigured providers if asking to upload to "all"
              continue;
           }
           errs.push(`${p === 'googledrive' ? 'Google Drive' : 'S3'}: ${e.message}`);
         }
      }
      
      if (results.length === 0) {
         if (errs.length > 0) return { success: false, error: errs.join(', ') };
         return { success: false, error: 'No providers configured to upload.' };
      }
      if (errs.length > 0) {
         return { success: false, error: 'Partial success. Errors: ' + errs.join(', ') };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('sync:downloadProfile', async (_event, profileId: string, remoteFileRef: string, overridePassphrase?: string) => {
    if (!syncScheduler || !encryptionSvc) return { success: false, error: 'Sync not initialized' };
    const provider = profileManager.getSetting('sync_provider') as 'googledrive' | 's3' | null;
    if (!provider) return { success: false, error: 'No sync provider configured' };
    try {
      if (overridePassphrase) {
        // Use a temporary key derived from the override passphrase for old backups
        const saltHex = profileManager.getSetting('sync_encryption_salt');
        // For old backups, we cannot know which salt was used. Try the stored salt first.
        // If that fails, the error will propagate naturally.
        const salt = saltHex ? Buffer.from(saltHex, 'hex') : encryptionSvc.generateSalt();
        const tmpKey = await encryptionSvc.deriveKey(overridePassphrase, salt);
        await syncScheduler.restoreOneWithKey(profileId, remoteFileRef, provider, tmpKey);
      } else {
        await syncScheduler.restoreOne(profileId, remoteFileRef, provider);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('sync:listBackups', async (_event, profileId?: string, targetProvider?: 'googledrive' | 's3' | 'all') => {
    if (!backupManager) return [];
    try {
      let providers: ('googledrive' | 's3')[] = [];
      if (targetProvider === 'all') {
         providers = ['googledrive', 's3'];
      } else if (targetProvider === 'googledrive' || targetProvider === 's3') {
         providers = [targetProvider];
      } else {
         const defaultProvider = profileManager.getSetting('sync_provider') as 'googledrive' | 's3' | null;
         if (defaultProvider) providers = [defaultProvider];
      }

      let allBackups: any[] = [];
      for (const p of providers) {
        try {
          const backups = await backupManager.listCloudBackups(profileId, p);
          allBackups = allBackups.concat(backups);
        } catch {
           // Ignore if provider not fully configured/authenticated
        }
      }
      return allBackups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      return [];
    }
  });

  ipcMain.handle('sync:uploadAll', async () => {
    if (!syncScheduler) return { success: false, error: 'Sync not initialized' };
    const provider = profileManager.getSetting('sync_provider') as 'googledrive' | 's3' | null;
    if (!provider) return { success: false, error: 'No sync provider configured' };
    try {
      const result = await syncScheduler.syncAll(provider);
      return { ...result, success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('sync:backupAllListToCloud', async () => {
    if (!syncScheduler || !encryptionSvc) return { success: false, error: 'Sync not initialized' };
    const provider = profileManager.getSetting('sync_provider') as 'googledrive' | 's3' | null;
    if (!provider) return { success: false, error: 'No sync provider configured' };
    const key = syncScheduler.getPassphraseKey();
    if (!key) return { success: false, error: 'Sync passphrase not set' };

    try {
      const profiles = profileManager.getAll();
      const exportItems = profiles.map(p => {
        const { user_data_dir, status, last_run_at, created_at, updated_at, password_hash, ...cleanProfile } = p as any;
        return cleanProfile;
      });

      const jsonStr = JSON.stringify(exportItems);
      const payload = encryptionSvc.encrypt(Buffer.from(jsonStr, 'utf-8'), key);

      // New portable format: EZPL magic || salt || iv || tag || ciphertext
      // The salt is included so any machine with the correct passphrase can decrypt.
      const saltHex = profileManager.getSetting('sync_encryption_salt') || '';
      const salt = saltHex ? Buffer.from(saltHex, 'hex') : encryptionSvc.generateSalt();
      const EZPL_MAGIC = Buffer.from('EZPL');
      const buffer = Buffer.concat([EZPL_MAGIC, salt, payload.iv, payload.tag, payload.ciphertext]);

      if (provider === 'googledrive' && gdriveService) {
        await gdriveService.uploadBuffer(buffer, 'profiles_list.json.enc');
      } else if (provider === 's3' && s3Service) {
        const prefix = profileManager.getSetting('s3_prefix') || 'ezprofile/';
        await s3Service.uploadBuffer(buffer, `${prefix}profiles_list.json.enc`);
      } else {
         return { success: false, error: 'Service not found' };
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('sync:restoreAllListFromCloud', async (_event, passphrase?: string) => {
    if (!syncScheduler || !encryptionSvc) return { success: false, error: 'Sync not initialized' };
    const provider = profileManager.getSetting('sync_provider') as 'googledrive' | 's3' | null;
    if (!provider) return { success: false, error: 'No sync provider configured' };

    // Either a passphrase must be provided, or the key must already be in memory
    const existingKey = syncScheduler.getPassphraseKey();
    if (!existingKey && !passphrase) return { success: false, error: 'Sync passphrase not set' };

    try {
      let buffer: Buffer | null = null;
      if (provider === 'googledrive' && gdriveService) {
        buffer = await gdriveService.downloadBufferByFileName('profiles_list.json.enc');
      } else if (provider === 's3' && s3Service) {
        const prefix = profileManager.getSetting('s3_prefix') || 'ezprofile/';
        buffer = await s3Service.downloadBuffer(`${prefix}profiles_list.json.enc`).catch(() => null);
      }

      if (!buffer) return { success: false, error: 'Profile list not found on cloud' };

      let jsonStr: string;
      const EZPL_MAGIC = Buffer.from('EZPL');

      if (buffer.length >= 4 && buffer.subarray(0, 4).equals(EZPL_MAGIC)) {
        // New portable format: EZPL (4) || salt (32) || iv (12) || tag (16) || ciphertext
        const embeddedSalt = buffer.subarray(4, 36);
        const iv = buffer.subarray(36, 48);
        const tag = buffer.subarray(48, 64);
        const ciphertext = buffer.subarray(64);

        let decryptKey: Buffer;
        if (passphrase) {
          // Derive key from passphrase + embedded salt (cross-machine scenario)
          decryptKey = await encryptionSvc.deriveKey(passphrase, embeddedSalt);
        } else {
          decryptKey = existingKey!;
        }

        try {
          jsonStr = encryptionSvc.decrypt({ iv, ciphertext, tag }, decryptKey).toString('utf-8');
        } catch {
          // If using existing key failed, request passphrase from user
          if (!passphrase) {
            return { success: false, error: 'PASSPHRASE_REQUIRED' };
          }
          return { success: false, error: 'Decryption failed — wrong passphrase.' };
        }

        // On success: sync the salt & key locally so subsequent profile restores work
        if (passphrase) {
          const key = await encryptionSvc.deriveKey(passphrase, embeddedSalt);
          syncScheduler.setPassphraseKey(key);
          profileManager.setSetting('sync_encryption_salt', embeddedSalt.toString('hex'));
          const encryptedKeyHex = encryptionSvc.encryptString(key.toString('hex'));
          profileManager.setSetting('sync_encrypted_key', encryptedKeyHex);
        }
      } else {
        // Legacy format: iv (12) || tag (16) || ciphertext (no embedded salt)
        if (!existingKey) {
          return { success: false, error: 'PASSPHRASE_REQUIRED' };
        }
        const payload = encryptionSvc.deserializePayload(buffer);
        try {
          jsonStr = encryptionSvc.decrypt(payload, existingKey).toString('utf-8');
        } catch {
          return { success: false, error: 'PASSPHRASE_REQUIRED' };
        }
      }

      const records = JSON.parse(jsonStr);
      const profilesImported = profileManager.importMany(records as any);
      return { success: true, count: profilesImported.length };
    } catch (e: any) {
       return { success: false, error: e.message };
    }
  });

  ipcMain.handle('sync:restoreAll', async () => {
    if (!syncScheduler || !encryptionSvc || !backupManager) return { success: false, error: 'Sync not initialized' };
    const provider = profileManager.getSetting('sync_provider') as 'googledrive' | 's3' | null;
    if (!provider) return { success: false, error: 'No sync provider configured' };
    const key = syncScheduler.getPassphraseKey();
    if (!key) return { success: false, error: 'Sync passphrase not set' };

    try {
      const profiles = profileManager.getAll();
      let successCount = 0;
      let failCount = 0;
      for (const p of profiles) {
        try {
          const backups = await backupManager.listCloudBackups(p.id, provider);
          if (backups && backups.length > 0) {
             const latest = backups[0];
             await syncScheduler.restoreOne(p.id, latest.id, provider);
             successCount++;
          }
        } catch (e) {
          failCount++;
        }
      }
      return { success: true, count: successCount, failed: failCount };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('sync:setAutoSyncOnClose', (_event, enabled: boolean) => {
    profileManager.setSetting('sync_auto_sync_on_close', enabled ? 'true' : 'false');
    return { success: true };
  });

  ipcMain.handle('sync:setMaxBackups', (_event, maxLimit: number) => {
    profileManager.setSetting('sync_max_backups', String(maxLimit));
    return { success: true };
  });

  ipcMain.handle('sync:getSyncLog', (_event, profileId?: string) => {
    return profileManager.getSyncLog(profileId);
  });

  ipcMain.handle('sync:deleteBackup', async (_event, remoteFileRef: string, backupProvider?: 'googledrive' | 's3') => {
    const provider = backupProvider || profileManager.getSetting('sync_provider') as 'googledrive' | 's3' | null;
    if (!provider || !backupManager) return { success: false, error: 'Not configured' };
    try {
      await backupManager.deleteCloudBackup(remoteFileRef, provider);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // Settings Backup & Restore
  ipcMain.handle('settings:exportBackup', async (_event, password?: string) => {
    try {
      if (!encryptionSvc) throw new Error('Encryption service not initialized');
      if (!password) throw new Error('Password is required for export');
      
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Export Settings Backup',
        defaultPath: 'ezprofile_settings_backup.enc',
        filters: [{ name: 'Encrypted JSON', extensions: ['enc'] }, { name: 'All Files', extensions: ['*'] }]
      });

      if (canceled || !filePath) return { success: true, canceled: true };

      const settings = profileManager.getAllSettings();
      const keysToDecrypt = [
        's3_secret_access_key',
        'gdrive_client_secret_enc',
        'gdrive_token_json',
        'sync_encrypted_key'
      ];

      for (const key of keysToDecrypt) {
        if (settings[key]) {
          try {
            settings[key] = encryptionSvc.decryptString(settings[key]);
          } catch (e) {
            console.warn(`Failed to decrypt ${key} during settings export`);
          }
        }
      }

      // Include proxy list in the backup
      const proxies = profileManager.getProxies();
      (settings as any).__proxies__ = proxies;

      const settingsJson = JSON.stringify(settings);
      
      const salt = encryptionSvc.generateSalt();
      const derivedKey = await encryptionSvc.deriveKey(password, salt);
      const payload = encryptionSvc.encrypt(Buffer.from(settingsJson, 'utf-8'), derivedKey);
      
      const backupData = {
        salt: salt.toString('hex'),
        iv: payload.iv.toString('hex'),
        tag: payload.tag.toString('hex'),
        ciphertext: payload.ciphertext.toString('hex')
      };

      fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf-8');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('settings:importBackup', async (_event, password?: string) => {
    try {
      if (!encryptionSvc) throw new Error('Encryption service not initialized');
      if (!password) throw new Error('Password is required for import');

      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Import Settings Backup',
        filters: [{ name: 'Encrypted JSON', extensions: ['enc'] }, { name: 'All Files', extensions: ['*'] }],
        properties: ['openFile']
      });

      if (canceled || filePaths.length === 0) return { success: true, canceled: true };

      const content = fs.readFileSync(filePaths[0], 'utf-8');
      const backupData = JSON.parse(content);

      if (!backupData.salt || !backupData.iv || !backupData.tag || !backupData.ciphertext) {
         throw new Error('Invalid backup file format');
      }

      const saltBuffer = Buffer.from(backupData.salt, 'hex');
      const derivedKey = await encryptionSvc.deriveKey(password, saltBuffer);

      let decryptedJson = '';
      try {
        const decryptedBuffer = encryptionSvc.decrypt({
           iv: Buffer.from(backupData.iv, 'hex'),
           tag: Buffer.from(backupData.tag, 'hex'),
           ciphertext: Buffer.from(backupData.ciphertext, 'hex')
        }, derivedKey);
        decryptedJson = decryptedBuffer.toString('utf-8');
      } catch (decryptErr) {
        throw new Error('Incorrect password or corrupted backup file');
      }

      const settings = JSON.parse(decryptedJson) as Record<string, any>;

      // Extract proxy list before processing settings
      const proxies = settings.__proxies__;
      delete settings.__proxies__;

      const keysToEncrypt = [
        's3_secret_access_key',
        'gdrive_client_secret_enc',
        'gdrive_token_json',
        'sync_encrypted_key'
      ];

      for (const key of keysToEncrypt) {
        if (settings[key]) {
           settings[key] = encryptionSvc.encryptString(settings[key]);
        }
      }

      for (const [key, value] of Object.entries(settings)) {
        if (value !== null && value !== undefined) {
          profileManager.setSetting(key, String(value));
        }
      }

      // Restore proxy list if present in backup
      if (Array.isArray(proxies) && proxies.length > 0) {
        // Get existing proxies to merge (skip duplicates by host:port)
        const existingProxies = profileManager.getProxies();
        const existingKeys = new Set(existingProxies.map((p: any) => `${p.host}:${p.port}`));

        for (const proxy of proxies) {
          const key = `${proxy.host}:${proxy.port}`;
          if (!existingKeys.has(key)) {
            profileManager.createProxy({
              name: proxy.name,
              type: proxy.type,
              host: proxy.host,
              port: proxy.port,
              username: proxy.username || undefined,
              password: proxy.password || undefined,
            });
            existingKeys.add(key);
          }
        }
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}

