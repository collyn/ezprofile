import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { ProfileManager } from './services/profile-manager';
import { ChromeLauncher } from './services/chrome-launcher';
import { ProxyChecker } from './services/proxy-checker';
import { CookieManager } from './services/cookie-manager';
import { BackupManager } from './services/backup-manager';
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
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0f0f14',
  });

  // Initialize services
  const dbPath = path.join(app.getPath('userData'), 'ezprofile.db');
  const profilesDataDir = path.join(app.getPath('userData'), 'profiles');
  profileManager = new ProfileManager(dbPath);
  chromeLauncher = new ChromeLauncher(profilesDataDir);
  proxyChecker = new ProxyChecker();
  cookieManager = new CookieManager(chromeLauncher);
  const backupManager = new BackupManager(chromeLauncher);
  const browserVersionManager = new BrowserVersionManager();
  chromeLauncher.setBrowserVersionManager(browserVersionManager);

  // Register IPC handlers
  registerIpcHandlers(ipcMain, profileManager, chromeLauncher, proxyChecker, cookieManager, backupManager, browserVersionManager, mainWindow);

  // Load UI
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // Stop all Chrome instances
  if (chromeLauncher) {
    chromeLauncher.stopAll();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Chỉnh sửa config mốc cho updater nếu cần (tránh tự tải update luôn)
autoUpdater.autoDownload = false; // Người dùng tự trigger tải sau hoặc ta trigger bằng code

// Chuyển tiếp event xuống frontend
autoUpdater.on('checking-for-update', () => {
  if (mainWindow) mainWindow.webContents.send('updater:status', 'Checking for updates...');
});
autoUpdater.on('update-available', (info) => {
  if (mainWindow) mainWindow.webContents.send('updater:status', `New update available (${info.version})`);
  // Bắt đầu tải bản cập nhật
  autoUpdater.downloadUpdate();
});
autoUpdater.on('update-not-available', (info) => {
  if (mainWindow) mainWindow.webContents.send('updater:status', 'You are using the latest version');
});
autoUpdater.on('error', (err) => {
  if (mainWindow) mainWindow.webContents.send('updater:status', `Update error: ${err.message}`);
});
autoUpdater.on('download-progress', (progressObj) => {
  if (mainWindow) mainWindow.webContents.send('updater:progress', progressObj.percent);
});
autoUpdater.on('update-downloaded', (info) => {
  if (mainWindow) mainWindow.webContents.send('updater:status', 'Update downloaded. Ready to install.');
});
