import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { ProfileManager } from './services/profile-manager';
import { ChromeLauncher } from './services/chrome-launcher';
import { ProxyChecker } from './services/proxy-checker';
import { CookieManager } from './services/cookie-manager';
import { BackupManager } from './services/backup-manager';
import { EncryptionService } from './services/encryption-service';
import { GDriveService } from './services/gdrive-service';
import { S3Service } from './services/s3-service';
import { SyncScheduler } from './services/sync-scheduler';
import { ExtensionManager } from './services/extension-manager';
import { autoUpdater } from 'electron-updater';
import { BrowserVersionManager } from './services/browser-version-manager';
import { registerIpcHandlers } from './ipc-handlers';

// Fix SUID sandbox issue on Linux (packaged mode)
if (process.platform === 'linux') {
  process.env.ELECTRON_DISABLE_SANDBOX = '1';
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-setuid-sandbox');
}


// Suppress benign Chromium warnings/errors emitting to console
app.commandLine.appendSwitch('log-level', '3');
app.commandLine.appendSwitch('silent-debugger-extension-api');

let mainWindow: BrowserWindow | null = null;
let profileManager: ProfileManager;
let chromeLauncher: ChromeLauncher;
let proxyChecker: ProxyChecker;
let cookieManager: CookieManager;

function createWindow() {
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: 'EzProfile',
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(__dirname, '../public/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    // macOS: native traffic lights on the left; Windows/Linux: custom frameless
    ...(isMac
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 12, y: 10 } }
      : { frame: false, titleBarStyle: 'hidden' }),
    backgroundColor: '#0f0f14',
  });

  // Initialize services
  const dbPath = path.join(app.getPath('userData'), 'ezprofile.db');
  const profilesDataDir = path.join(app.getPath('userData'), 'profiles');
  profileManager = new ProfileManager(dbPath);
  chromeLauncher = new ChromeLauncher(profilesDataDir);
  proxyChecker = new ProxyChecker();
  cookieManager = new CookieManager(chromeLauncher);

  // Sync services
  const encryptionSvc = new EncryptionService();
  const s3Service = new S3Service(encryptionSvc, profileManager);
  const gdriveService = new GDriveService(encryptionSvc, profileManager);
  s3Service.loadFromSettings();

  const backupManager = new BackupManager(chromeLauncher, encryptionSvc, profileManager, gdriveService, s3Service);
  backupManager.setCookieManager(cookieManager);
  const syncScheduler = new SyncScheduler(profileManager, backupManager, () => mainWindow);

  // Auto-load persisted encryption key and resume auto-sync
  const encryptedKeyHex = profileManager.getSetting('sync_encrypted_key');
  if (encryptedKeyHex) {
    try {
      const keyHex = encryptionSvc.decryptString(encryptedKeyHex);
      syncScheduler.setPassphraseKey(Buffer.from(keyHex, 'hex'));
      console.log('[main] Encryption key loaded from DB');


    } catch (err) {
      console.error('[main] Failed to load encryption key (machine key changed?):', err);
      // Clear corrupted key
      profileManager.setSetting('sync_encrypted_key', '');
    }
  }

  const browserVersionManager = new BrowserVersionManager();
  chromeLauncher.setBrowserVersionManager(browserVersionManager);
  cookieManager.setBrowserVersionManager(browserVersionManager);

  const extensionManager = new ExtensionManager(app.getPath('userData'));

  // Register IPC handlers
  registerIpcHandlers(ipcMain, profileManager, chromeLauncher, proxyChecker, cookieManager, backupManager, browserVersionManager, mainWindow, encryptionSvc, gdriveService, s3Service, syncScheduler, extensionManager);

  // Load UI
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Auto-check for updates on startup (if enabled)
  mainWindow.webContents.once('did-finish-load', () => {
    const checkOnStartup = profileManager.getSetting('check_update_on_startup');
    // Default to true if never set
    if (checkOnStartup === null || checkOnStartup === undefined || checkOnStartup === 'true') {
      setTimeout(() => {
        console.log('[main] Auto-checking for updates on startup...');
        autoUpdater.checkForUpdates().catch(err => {
          console.error('[main] Auto-update check failed:', err);
        });
      }, 3000); // delay 3s to let the UI settle
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
  // Gracefully stop all Chrome instances (wait for cookie/session flush)
  if (chromeLauncher) {
    await chromeLauncher.stopAll();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async (event) => {
  // Safety net: ensure Chrome instances are stopped before quit
  if (chromeLauncher && chromeLauncher.getRunningProfiles().length > 0) {
    event.preventDefault();
    await chromeLauncher.stopAll();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Auto-updater config
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// Forward updater events to frontend
autoUpdater.on('checking-for-update', () => {
  if (mainWindow) mainWindow.webContents.send('updater:checking');
});
autoUpdater.on('update-available', (info) => {
  if (mainWindow) mainWindow.webContents.send('updater:update-available', {
    version: info.version,
    releaseDate: info.releaseDate,
  });
});
autoUpdater.on('update-not-available', () => {
  if (mainWindow) mainWindow.webContents.send('updater:up-to-date');
});
autoUpdater.on('error', (err) => {
  if (mainWindow) mainWindow.webContents.send('updater:error', err.message);
});
autoUpdater.on('download-progress', (progressObj) => {
  if (mainWindow) mainWindow.webContents.send('updater:download-progress', {
    percent: progressObj.percent,
    bytesPerSecond: progressObj.bytesPerSecond,
    transferred: progressObj.transferred,
    total: progressObj.total,
  });
});
autoUpdater.on('update-downloaded', (info) => {
  if (mainWindow) mainWindow.webContents.send('updater:update-downloaded', {
    version: info.version,
  });
});
