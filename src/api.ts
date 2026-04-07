import { ProfileData, CreateProfileInput, ProxyCheckResult, ProxyData } from './types';

// Mock electronAPI for browser-only development (when not running in Electron)
const mockProfiles: ProfileData[] = [];
const mockGroups: { id: string; name: string; color: string }[] = [];
const mockProxies: ProxyData[] = [];
let mockIdCounter = 0;

export function isElectron(): boolean {
  return !!(window as any).electronAPI;
}

function createMockProfile(input: CreateProfileInput): ProfileData {
  mockIdCounter++;
  const id = `mock-${mockIdCounter}-${Date.now()}`;
  return {
    id,
    name: input.name,
    group_name: input.group_name || null,
    proxy_type: input.proxy_type || null,
    proxy_host: input.proxy_host || null,
    proxy_port: input.proxy_port || null,
    proxy_user: input.proxy_user || null,
    proxy_pass: input.proxy_pass || null,
    proxy_enabled: input.proxy_enabled ?? 0,
    notes: input.notes || null,
    browser_version: 'latest',
    user_data_dir: `/mock/profiles/${id}`,
    startup_url: input.startup_url || null,
    startup_type: input.startup_type || 'continue',
    startup_urls: input.startup_urls || null,
    has_password: false,
    fingerprint_flags: null,
    status: 'ready',
    last_run_at: null,
    created_at: new Date().toISOString().replace('Z', ''),
    updated_at: new Date().toISOString().replace('Z', ''),
  };
}

export const mockElectronAPI: typeof window.electronAPI = {
  getProfiles: async () => [...mockProfiles],
  createProfile: async (data) => {
    const profile = createMockProfile(data);
    mockProfiles.unshift(profile);
    return profile;
  },
  updateProfile: async (id, data) => {
    const idx = mockProfiles.findIndex((p) => p.id === id);
    if (idx >= 0) {
      mockProfiles[idx] = { ...mockProfiles[idx], ...data } as ProfileData;
      return mockProfiles[idx];
    }
    throw new Error('Not found');
  },
  updateProfiles: async (ids, data) => {
    ids.forEach(id => {
      const idx = mockProfiles.findIndex((p) => p.id === id);
      if (idx >= 0) {
        mockProfiles[idx] = { ...mockProfiles[idx], ...data } as ProfileData;
      }
    });
  },
  deleteProfile: async (id) => {
    const idx = mockProfiles.findIndex((p) => p.id === id);
    if (idx >= 0) mockProfiles.splice(idx, 1);
  },
  cloneProfile: async (id) => {
    const source = mockProfiles.find((p) => p.id === id);
    if (!source) throw new Error('Not found');
    const cloned = createMockProfile({
      name: `${source.name} (Copy)`,
      group_name: source.group_name || undefined,
      proxy_type: source.proxy_type || undefined,
      proxy_host: source.proxy_host || undefined,
      proxy_port: source.proxy_port || undefined,
      proxy_user: source.proxy_user || undefined,
      proxy_pass: source.proxy_pass || undefined,
      notes: source.notes || undefined,
      startup_url: source.startup_url || undefined,
      startup_type: source.startup_type || undefined,
      startup_urls: source.startup_urls || undefined,
    });
    mockProfiles.unshift(cloned);
    return cloned;
  },
  setProfilePassword: async (id: string, _password: string) => {
    const idx = mockProfiles.findIndex((p) => p.id === id);
    if (idx >= 0) mockProfiles[idx].has_password = true;
  },
  removeProfilePassword: async (id: string, _password: string) => {
    const idx = mockProfiles.findIndex((p) => p.id === id);
    if (idx >= 0) mockProfiles[idx].has_password = false;
  },
  verifyProfilePassword: async () => true,
  deleteProfiles: async (ids) => {
    ids.forEach((id) => {
      const idx = mockProfiles.findIndex((p) => p.id === id);
      if (idx >= 0) mockProfiles.splice(idx, 1);
    });
  },
  exportProfiles: async () => ({ success: true }),
  importProfiles: async () => ({ success: true, count: 0 }),
  launchProfile: async (id) => {
    const idx = mockProfiles.findIndex((p) => p.id === id);
    if (idx >= 0) {
      mockProfiles[idx].status = 'running';
      mockProfiles[idx].last_run_at = new Date().toISOString().replace('Z', '');
    }
  },
  stopProfile: async (id) => {
    const idx = mockProfiles.findIndex((p) => p.id === id);
    if (idx >= 0) mockProfiles[idx].status = 'ready';
  },
  checkProxy: async () => ({ success: true, ip: '127.0.0.1', latency: 50 }),
  getProxies: async () => [...mockProxies],
  createProxy: async (data) => {
    const proxy: ProxyData = {
      id: `proxy-${Date.now()}`, ...data,
      username: data.username || null, password: data.password || null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    mockProxies.unshift(proxy);
    return proxy;
  },
  updateProxy: async (id, data) => {
    const idx = mockProxies.findIndex(p => p.id === id);
    if (idx >= 0) mockProxies[idx] = { ...mockProxies[idx], ...data, updated_at: new Date().toISOString() } as ProxyData;
    return mockProxies[idx];
  },
  deleteProxy: async (id) => {
    const idx = mockProxies.findIndex(p => p.id === id);
    if (idx >= 0) mockProxies.splice(idx, 1);
  },
  importCookies: async () => ({ success: true }),
  exportCookies: async () => ({ success: true }),
  backupProfile: async () => ({ success: true }),
  restoreProfile: async () => ({ success: true }),
  getGroups: async () => [...mockGroups],
  createGroup: async (name, color) => {
    mockGroups.push({ id: `group-${Date.now()}`, name, color });
  },
  deleteGroup: async (id) => {
    const idx = mockGroups.findIndex(g => g.id === id);
    if (idx >= 0) mockGroups.splice(idx, 1);
  },
  getChromePath: async () => '/usr/bin/google-chrome',
  setChromePath: async () => {},
  selectChromePath: async () => null,
  getProfilesDir: async () => '',
  setProfilesDir: async () => {},
  selectProfilesDir: async () => null,
  settingsExportBackup: async (_password: string) => ({ success: true }),
  settingsImportBackup: async (_password: string) => ({ success: true }),
  getCheckUpdateOnStartup: async () => true,
  setCheckUpdateOnStartup: async () => {},
  getAvailableBrowserVersions: async () => [],
  getInstalledBrowserVersions: async () => [],
  downloadBrowserVersion: async () => ({ success: true }),
  deleteBrowserVersion: async () => ({ success: true }),
  addCustomBrowserVersion: async () => ({ success: true, version: 'Custom - Mock', chromePath: '/mock/chrome' }),
  getDefaultBrowserVersion: async () => 'system',
  setDefaultBrowserVersion: async () => ({ success: true }),
  minimizeWindow: async () => {},
  maximizeWindow: async () => {},
  closeWindow: async () => {},
  onProfileStatusChanged: () => {},
  onBackupProgress: () => {},
  onBrowserDownloadProgress: () => {},

  // App & Updater
  getAppVersion: async () => '1.0.0 (Web)',
  getPlatform: async () => 'linux',
  openExternal: async (url: string) => { window.open(url, '_blank'); },
  checkForUpdates: async () => { console.log('Mock checking for updates...'); },
  downloadUpdate: async () => { console.log('Mock downloading update...'); },
  quitAndInstallUpdate: async () => { console.log('Mock quit and install update...'); },
  onUpdaterChecking: () => {},
  onUpdateAvailable: () => {},
  onUpdateNotAvailable: () => {},
  onUpdaterError: () => {},
  onDownloadProgress: () => {},
  onUpdateDownloaded: () => {},

  // Sync mocks
  syncGetSettings: async () => ({
    provider: null, autoSyncOnClose: false, syncMaxBackups: 5,
    passphraseHint: '', gdrive: { connected: false }, s3: null,
    hasPassphrase: false
  }),
  syncSetProvider: async () => {},
  syncSaveS3Config: async (_config) => ({ success: true }),
  syncTestS3: async () => ({ success: true, error: 'Mock mode' }),
  syncStartGoogleAuth: async () => ({ success: false, error: 'Mock mode' }),
  syncGetGoogleAuthStatus: async () => ({ connected: false, clientId: '' }),
  syncRevokeGoogle: async () => ({ success: true }),
  syncSaveGoogleClientId: async () => ({ success: true }),
  syncSaveGoogleClientSecret: async () => ({ success: true }),
  syncSetPassphrase: async () => ({ success: true }),
  syncChangePassphrase: async () => ({ success: true }),
  syncClearPassphrase: async () => ({ success: true }),
  syncHasPassphrase: async () => false,
  syncUploadProfile: async (_id: string, _isBackup?: boolean, _targetProvider?: 'googledrive' | 's3' | 'all') => ({ success: true }),
  syncDownloadProfile: async () => ({ success: true }),
  syncListBackups: async (_profileId?: string, _targetProvider?: 'googledrive' | 's3' | 'all') => [],
  syncUploadAll: async () => ({ success: true, total: 0, success_count: 0, failed: 0 }),
  syncSetAutoSyncOnClose: async () => ({ success: true }),
  syncSetMaxBackups: async () => ({ success: true }),
  syncGetSyncLog: async () => [],
  syncDeleteBackup: async (_remoteFileRef: string, _provider?: 'googledrive' | 's3') => ({ success: true }),
  syncBackupAllListToCloud: async () => ({ success: true }),
  syncRestoreAllListFromCloud: async (_passphrase?: string) => ({ success: true, count: 0 }),
  syncRestoreAll: async () => ({ success: true, count: 0, failed: 0 }),
  onSyncProgress: () => {},
  onSyncAllComplete: () => {},
};

export function getAPI(): typeof window.electronAPI {
  return isElectron() ? window.electronAPI : mockElectronAPI;
}
