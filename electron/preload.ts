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
  countryCode?: string;
  countryName?: string;
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
  launchProfile: (id: string, bounds?: { x: number; y: number; width: number; height: number }): Promise<void> => ipcRenderer.invoke('chrome:launch', id, bounds),
  stopProfile: (id: string): Promise<void> => ipcRenderer.invoke('chrome:stop', id),
  focusProfile: (id: string): Promise<void> => ipcRenderer.invoke('chrome:focus', id),

  // Proxy operations
  checkProxy: (type: string, host: string, port: number, user?: string, pass?: string): Promise<ProxyCheckResult> =>
    ipcRenderer.invoke('proxy:check', type, host, port, user, pass),

  // Proxy list management
  getProxies: (): Promise<any[]> => ipcRenderer.invoke('proxy:getAll'),
  createProxy: (data: { name: string; type: string; host: string; port: number; username?: string; password?: string; country_code?: string; country_name?: string }): Promise<any> =>
    ipcRenderer.invoke('proxy:create', data),
  updateProxy: (id: string, data: { name?: string; type?: string; host?: string; port?: number; username?: string; password?: string; country_code?: string; country_name?: string }): Promise<any> =>
    ipcRenderer.invoke('proxy:update', id, data),
  deleteProxy: (id: string): Promise<void> => ipcRenderer.invoke('proxy:delete', id),
  lookupProxyCountry: (ip: string): Promise<{ countryCode: string; countryName: string } | null> =>
    ipcRenderer.invoke('proxy:lookupCountry', ip),

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
  settingsExportBackup: (password: string): Promise<{ success: boolean, canceled?: boolean, error?: string }> => ipcRenderer.invoke('settings:exportBackup', password),
  settingsImportBackup: (password: string): Promise<{ success: boolean, canceled?: boolean, error?: string }> => ipcRenderer.invoke('settings:importBackup', password),
  getCheckUpdateOnStartup: (): Promise<boolean> => ipcRenderer.invoke('settings:getCheckUpdateOnStartup'),
  setCheckUpdateOnStartup: (enabled: boolean): Promise<void> => ipcRenderer.invoke('settings:setCheckUpdateOnStartup', enabled),
  getIncludePrereleaseUpdates: (): Promise<boolean> => ipcRenderer.invoke('settings:getIncludePrereleaseUpdates'),
  setIncludePrereleaseUpdates: (enabled: boolean): Promise<void> => ipcRenderer.invoke('settings:setIncludePrereleaseUpdates', enabled),

  // Browser version management
  getAvailableBrowserVersions: () => ipcRenderer.invoke('browser:getAvailable'),
  getInstalledBrowserVersions: () => ipcRenderer.invoke('browser:getInstalled'),
  downloadBrowserVersion: (version: string, channel: string) => ipcRenderer.invoke('browser:download', version, channel),
  deleteBrowserVersion: (version: string) => ipcRenderer.invoke('browser:delete', version),
  addCustomBrowserVersion: () => ipcRenderer.invoke('browser:addCustom'),
  getDefaultBrowserVersion: () => ipcRenderer.invoke('browser:getDefault'),
  setDefaultBrowserVersion: (version: string) => ipcRenderer.invoke('browser:setDefault', version),

  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),

  // Events
  onProfileStatusChanged: (callback: (profileId: string, status: string) => void) => {
    ipcRenderer.removeAllListeners('profile:statusChanged');
    ipcRenderer.on('profile:statusChanged', (_event, profileId, status) => callback(profileId, status));
  },
  onProxyUpdated: (callback: () => void) => {
    ipcRenderer.removeAllListeners('proxy:updated');
    ipcRenderer.on('proxy:updated', () => callback());
  },
  onBackupProgress: (callback: (profileId: string, progress: string) => void) => {
    ipcRenderer.removeAllListeners('profile:backupProgress');
    ipcRenderer.on('profile:backupProgress', (_event, profileId, progress) => callback(profileId, progress));
  },
  onBrowserDownloadProgress: (callback: (version: string, percent: number, message: string) => void) => {
    ipcRenderer.removeAllListeners('browser:downloadProgress');
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
    ipcRenderer.removeAllListeners('updater:checking');
    ipcRenderer.on('updater:checking', () => callback());
  },
  onUpdateAvailable: (callback: (info: { version: string; releaseDate: string }) => void) => {
    ipcRenderer.removeAllListeners('updater:update-available');
    ipcRenderer.on('updater:update-available', (_event, info) => callback(info));
  },
  onUpdateNotAvailable: (callback: () => void) => {
    ipcRenderer.removeAllListeners('updater:up-to-date');
    ipcRenderer.on('updater:up-to-date', () => callback());
  },
  onUpdaterError: (callback: (message: string) => void) => {
    ipcRenderer.removeAllListeners('updater:error');
    ipcRenderer.on('updater:error', (_event, message) => callback(message));
  },
  onDownloadProgress: (callback: (info: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => {
    ipcRenderer.removeAllListeners('updater:download-progress');
    ipcRenderer.on('updater:download-progress', (_event, info) => callback(info));
  },
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    ipcRenderer.removeAllListeners('updater:update-downloaded');
    ipcRenderer.on('updater:update-downloaded', (_event, info) => callback(info));
  },

  // ── Cloud Sync ──────────────────────────────────────────────
  syncGetSettings: (): Promise<any> => ipcRenderer.invoke('sync:getSettings'),
  syncSetProvider: (provider: string) => ipcRenderer.invoke('sync:setProvider', provider),
  syncSaveS3Config: (config: { accessKeyId: string; secretAccessKey: string; bucket: string; region: string; prefix: string; endpoint?: string }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('sync:saveS3Config', config),
  syncTestS3: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('sync:testS3'),
  syncStartGoogleAuth: (): Promise<{ success: boolean; email?: string; error?: string }> => ipcRenderer.invoke('sync:startGoogleAuth'),
  syncGetGoogleAuthStatus: (): Promise<{ gdrive?: { connected: boolean; email?: string; clientId?: string; hasSecret?: boolean } }> => ipcRenderer.invoke('sync:getGoogleAuthStatus'),
  syncRevokeGoogle: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('sync:revokeGoogle'),
  syncSaveGoogleClientId: (clientId: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('sync:saveGoogleClientId', clientId),
  syncSaveGoogleClientSecret: (secret: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('sync:saveGoogleClientSecret', secret),
  syncSetPassphrase: (passphrase: string, hint?: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('sync:setPassphrase', passphrase, hint),
  syncChangePassphrase: (oldPassphrase: string, newPassphrase: string, newHint?: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('sync:changePassphrase', oldPassphrase, newPassphrase, newHint),
  syncClearPassphrase: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('sync:clearPassphrase'),
  syncHasPassphrase: (): Promise<boolean> => ipcRenderer.invoke('sync:hasPassphrase'),
  syncUploadProfile: (profileId: string, isBackup?: boolean, targetProvider?: 'googledrive' | 's3' | 'all'): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('sync:uploadProfile', profileId, isBackup, targetProvider),
  syncDownloadProfile: (profileId: string, remoteFileRef: string, overridePassphrase?: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('sync:downloadProfile', profileId, remoteFileRef, overridePassphrase),
  syncListBackups: (profileId?: string, targetProvider?: 'googledrive' | 's3' | 'all'): Promise<any[]> => ipcRenderer.invoke('sync:listBackups', profileId, targetProvider),
  syncUploadAll: (): Promise<{ success: boolean; total?: number; succeeded?: number; failed?: number; error?: string }> =>
    ipcRenderer.invoke('sync:uploadAll'),
  syncSetAutoSyncOnClose: (enabled: boolean): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('sync:setAutoSyncOnClose', enabled),
  syncSetMaxBackups: (maxLimit: number): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('sync:setMaxBackups', maxLimit),
  syncGetSyncLog: (profileId?: string): Promise<any[]> => ipcRenderer.invoke('sync:getSyncLog', profileId),
  syncDeleteBackup: (remoteFileRef: string, provider?: 'googledrive' | 's3'): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('sync:deleteBackup', remoteFileRef, provider),
  syncBackupAllListToCloud: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('sync:backupAllListToCloud'),
  syncRestoreAllListFromCloud: (passphrase?: string): Promise<{ success: boolean; count?: number; error?: string }> => ipcRenderer.invoke('sync:restoreAllListFromCloud', passphrase),
  syncRestoreAll: (): Promise<{ success: boolean; count?: number; failed?: number; error?: string }> => ipcRenderer.invoke('sync:restoreAll'),

  // Sync events
  onSyncProgress: (callback: (progress: { profileId: string; message: string; percent?: number }) => void) => {
    ipcRenderer.removeAllListeners('sync:progress');
    ipcRenderer.on('sync:progress', (_event, progress) => callback(progress));
  },
  onSyncAllComplete: (callback: (result: { total: number; success: number; failed: number; errors: any[] }) => void) => {
    ipcRenderer.removeAllListeners('sync:allComplete');
    ipcRenderer.on('sync:allComplete', (_event, result) => callback(result));
  },

  // ── Extensions ──────────────────────────────────────────────
  getExtensions: (): Promise<any[]> => ipcRenderer.invoke('extension:getAll'),
  uploadExtension: (): Promise<{ success: boolean; extension?: any; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke('extension:upload'),
  downloadExtensionFromStore: (storeUrl: string): Promise<{ success: boolean; extension?: any; error?: string }> =>
    ipcRenderer.invoke('extension:downloadFromStore', storeUrl),
  updateExtension: (id: string, data: { name?: string }): Promise<any> =>
    ipcRenderer.invoke('extension:update', id, data),
  deleteExtension: (id: string): Promise<void> =>
    ipcRenderer.invoke('extension:delete', id),
  checkExtensionUpdate: (id: string): Promise<{ success: boolean; current_version?: string; store_version?: string; has_update?: boolean; error?: string }> =>
    ipcRenderer.invoke('extension:checkUpdate', id),
  performExtensionUpdate: (id: string): Promise<{ success: boolean; extension?: any; error?: string }> =>
    ipcRenderer.invoke('extension:performUpdate', id),
  getProfileExtensions: (profileId: string): Promise<any[]> =>
    ipcRenderer.invoke('extension:getProfileExtensions', profileId),
  setProfileExtensions: (profileIds: string[], extensionIds: string[]): Promise<void> =>
    ipcRenderer.invoke('extension:setProfileExtensions', profileIds, extensionIds),
  addExtensionToProfiles: (extensionId: string, profileIds: string[]): Promise<void> =>
    ipcRenderer.invoke('extension:addToProfiles', extensionId, profileIds),
  getExtensionIcon: (iconPath: string): Promise<string | null> =>
    ipcRenderer.invoke('extension:getIcon', iconPath),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
