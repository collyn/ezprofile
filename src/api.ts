import { ProfileData, CreateProfileInput, ProxyCheckResult } from './types';

// Mock electronAPI for browser-only development (when not running in Electron)
const mockProfiles: ProfileData[] = [];
const mockGroups: { id: string; name: string; color: string }[] = [];
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
    notes: input.notes || null,
    browser_version: 'latest',
    user_data_dir: `/mock/profiles/${id}`,
    startup_url: input.startup_url || null,
    startup_type: input.startup_type || 'continue',
    startup_urls: input.startup_urls || null,
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
  getAvailableBrowserVersions: async () => [],
  getInstalledBrowserVersions: async () => [],
  downloadBrowserVersion: async () => ({ success: true }),
  deleteBrowserVersion: async () => ({ success: true }),
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
};

export function getAPI(): typeof window.electronAPI {
  return isElectron() ? window.electronAPI : mockElectronAPI;
}
