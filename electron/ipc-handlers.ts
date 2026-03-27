import { IpcMain, BrowserWindow, dialog, app } from 'electron';
import { ProfileManager } from './services/profile-manager';
import { ChromeLauncher } from './services/chrome-launcher';
import { ProxyChecker } from './services/proxy-checker';
import { CookieManager } from './services/cookie-manager';
import { BackupManager } from './services/backup-manager';
import { BrowserVersionManager } from './services/browser-version-manager';
import { exportData, importData } from './utils/import-export';
import { autoUpdater } from 'electron-updater';

export function registerIpcHandlers(
  ipcMain: IpcMain,
  profileManager: ProfileManager,
  chromeLauncher: ChromeLauncher,
  proxyChecker: ProxyChecker,
  cookieManager: CookieManager,
  backupManager: BackupManager,
  browserVersionManager: BrowserVersionManager,
  mainWindow: BrowserWindow | null
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
    return profiles.map((p) => ({
      ...p,
      status: chromeLauncher.isRunning(p.id) ? 'running' : p.status,
    }));
  });

  ipcMain.handle('profile:create', (_event, data) => {
    return profileManager.create(data);
  });

  ipcMain.handle('profile:update', (_event, id, data) => {
    return profileManager.update(id, data);
  });

  ipcMain.handle('profile:updateBatch', (_event, ids, data) => {
    profileManager.updateMany(ids, data);
  });

  ipcMain.handle('profile:clone', async (_event, id) => {
    return profileManager.clone(id);
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
        const { id, user_data_dir, status, last_run_at, created_at, updated_at, ...cleanProfile } = p as any;
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

      const profilesCreated = profileManager.createMany(records as any);
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

    try {
      const child = chromeLauncher.launch(id, profile.user_data_dir, {
        proxyType: profile.proxy_type || undefined,
        proxyHost: profile.proxy_host || undefined,
        proxyPort: profile.proxy_port || undefined,
        proxyUser: profile.proxy_user || undefined,
        proxyPass: profile.proxy_pass || undefined,
        startupUrl: profile.startup_url || undefined,
        startupType: profile.startup_type || 'continue',
        startupUrls: profile.startup_urls || undefined,
        browserVersion: profile.browser_version || 'system',
      });

      profileManager.updateStatus(id, 'running');

      child.on('exit', () => {
        // Only update status to ready if the process wasn't killed by another session taking over
        // Actually, if it exits, it's ready.
        profileManager.updateStatus(id, 'ready');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('profile:statusChanged', id, 'ready');
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
  });

  // Proxy operations
  ipcMain.handle('proxy:check', async (_event, type, host, port, user, pass) => {
    return proxyChecker.check(type, host, port, user, pass);
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
        defaultPath: `ezprofile_backup_${profile.name}_${Date.now()}.zip`,
        filters: [{ name: 'Zip Files', extensions: ['zip'] }]
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
        filters: [{ name: 'Zip Files', extensions: ['zip'] }]
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
      return await browserVersionManager.getAvailableVersions();
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
      await browserVersionManager.downloadVersion(version, channel, event.sender);
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
}
