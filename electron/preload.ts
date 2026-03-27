import { contextBridge, ipcRenderer } from 'electron';

export interface ProfileData {
  id: string;
  name: string;
  group_name: string | null;
  proxy_type: string | null;
  proxy_host: string | null;
  proxy_port: number | null;
  proxy_user: string | null;
  proxy_pass: string | null;
  notes: string | null;
  browser_version: string | null;
  user_data_dir: string;
  startup_url: string | null;
  has_password: boolean;
  status: 'ready' | 'running';
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProfileInput {
  name: string;
  group_name?: string;
  proxy_type?: string;
  proxy_host?: string;
  proxy_port?: number;
  proxy_user?: string;
  proxy_pass?: string;
  notes?: string;
  startup_url?: string;
}

export interface ProxyCheckResult {
  success: boolean;
  ip?: string;
  country?: string;
  latency?: number;
  error?: string;
}

const electronAPI = {
  // Profile operations
  getProfiles: (): Promise<ProfileData[]> => ipcRenderer.invoke('profile:getAll'),
  createProfile: (data: CreateProfileInput): Promise<ProfileData> => ipcRenderer.invoke('profile:create', data),
  updateProfile: (id: string, data: Partial<CreateProfileInput>): Promise<ProfileData> => ipcRenderer.invoke('profile:update', id, data),
  updateProfiles: (ids: string[], data: Partial<CreateProfileInput>): Promise<void> => ipcRenderer.invoke('profile:updateBatch', ids, data),
  cloneProfile: (id: string): Promise<ProfileData> => ipcRenderer.invoke('profile:clone', id),
  setProfilePassword: (id: string, password: string): Promise<void> => ipcRenderer.invoke('profile:setPassword', id, password),
  removeProfilePassword: (id: string, password: string): Promise<void> => ipcRenderer.invoke('profile:removePassword', id, password),
  verifyProfilePassword: (id: string, password: string): Promise<boolean> => ipcRenderer.invoke('profile:verifyPassword', id, password),
  deleteProfile: (id: string): Promise<void> => ipcRenderer.invoke('profile:delete', id),
  deleteProfiles: (ids: string[]): Promise<void> => ipcRenderer.invoke('profile:deleteMany', ids),
  exportProfiles: (ids?: string[]): Promise<{ success: boolean; error?: string; canceled?: boolean }> => ipcRenderer.invoke('profile:export', ids),
  importProfiles: (): Promise<{ success: boolean; count?: number; error?: string; canceled?: boolean }> => ipcRenderer.invoke('profile:import'),
  
  // Chrome operations
  launchProfile: (id: string): Promise<void> => ipcRenderer.invoke('chrome:launch', id),
  stopProfile: (id: string): Promise<void> => ipcRenderer.invoke('chrome:stop', id),

  // Proxy operations
  checkProxy: (type: string, host: string, port: number, user?: string, pass?: string): Promise<ProxyCheckResult> =>
    ipcRenderer.invoke('proxy:check', type, host, port, user, pass),

  // Cookie and Backup operations
  importCookies: (profileId: string): Promise<{ success: boolean; error?: string; canceled?: boolean }> => ipcRenderer.invoke('cookie:import', profileId),
  exportCookies: (profileId: string): Promise<{ success: boolean; error?: string; canceled?: boolean }> => ipcRenderer.invoke('cookie:export', profileId),
  backupProfile: (profileId: string): Promise<{ success: boolean; error?: string; canceled?: boolean }> => ipcRenderer.invoke('profile:backup', profileId),
  restoreProfile: (profileId: string): Promise<{ success: boolean; error?: string; canceled?: boolean }> => ipcRenderer.invoke('profile:restore', profileId),

  // Group operations
  getGroups: (): Promise<{ id: string; name: string; color: string }[]> => ipcRenderer.invoke('group:getAll'),
  createGroup: (name: string, color: string): Promise<void> => ipcRenderer.invoke('group:create', name, color),
  deleteGroup: (id: string): Promise<void> => ipcRenderer.invoke('group:delete', id),

  // Settings
  getChromePath: (): Promise<string> => ipcRenderer.invoke('settings:getChromePath'),
  setChromePath: (path: string): Promise<void> => ipcRenderer.invoke('settings:setChromePath', path),
  selectChromePath: (): Promise<string | null> => ipcRenderer.invoke('settings:selectChromePath'),
  getProfilesDir: (): Promise<string> => ipcRenderer.invoke('settings:getProfilesDir'),
  setProfilesDir: (dir: string): Promise<void> => ipcRenderer.invoke('settings:setProfilesDir', dir),
  selectProfilesDir: (): Promise<string | null> => ipcRenderer.invoke('settings:selectProfilesDir'),

  // Browser version management
  getAvailableBrowserVersions: () => ipcRenderer.invoke('browser:getAvailable'),
  getInstalledBrowserVersions: () => ipcRenderer.invoke('browser:getInstalled'),
  downloadBrowserVersion: (version: string, channel: string) => ipcRenderer.invoke('browser:download', version, channel),
  deleteBrowserVersion: (version: string) => ipcRenderer.invoke('browser:delete', version),

  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),

  // Events
  onProfileStatusChanged: (callback: (profileId: string, status: string) => void) => {
    ipcRenderer.on('profile:statusChanged', (_event, profileId, status) => callback(profileId, status));
  },
  onBackupProgress: (callback: (profileId: string, progress: string) => void) => {
    ipcRenderer.on('profile:backupProgress', (_event, profileId, progress) => callback(profileId, progress));
  },
  onBrowserDownloadProgress: (callback: (version: string, percent: number, message: string) => void) => {
    ipcRenderer.on('browser:downloadProgress', (_event, version, percent, message) => callback(version, percent, message));
  },

  // App & Updater
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  quitAndInstallUpdate: () => ipcRenderer.invoke('updater:install'),
  
  onUpdaterChecking: (callback: () => void) => {
    ipcRenderer.on('updater:checking', () => callback());
  },
  onUpdateAvailable: (callback: (info: { version: string; releaseDate: string }) => void) => {
    ipcRenderer.on('updater:update-available', (_event, info) => callback(info));
  },
  onUpdateNotAvailable: (callback: () => void) => {
    ipcRenderer.on('updater:up-to-date', () => callback());
  },
  onUpdaterError: (callback: (message: string) => void) => {
    ipcRenderer.on('updater:error', (_event, message) => callback(message));
  },
  onDownloadProgress: (callback: (info: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => {
    ipcRenderer.on('updater:download-progress', (_event, info) => callback(info));
  },
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    ipcRenderer.on('updater:update-downloaded', (_event, info) => callback(info));
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
