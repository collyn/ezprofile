export {};

declare global {
  interface Window {
    electronAPI: {
      // Profile operations
      getProfiles: () => Promise<ProfileData[]>;
      createProfile: (data: CreateProfileInput) => Promise<ProfileData>;
      updateProfile: (id: string, data: Partial<CreateProfileInput>) => Promise<ProfileData>;
      updateProfiles: (ids: string[], data: Partial<CreateProfileInput>) => Promise<void>;
      deleteProfile: (id: string) => Promise<void>;
      cloneProfile: (id: string) => Promise<ProfileData>;
      setProfilePassword: (id: string, password: string) => Promise<void>;
      removeProfilePassword: (id: string, password: string) => Promise<void>;
      verifyProfilePassword: (id: string, password: string) => Promise<boolean>;
      deleteProfiles: (ids: string[]) => Promise<void>;
      exportProfiles: (ids?: string[]) => Promise<{ success: boolean; error?: string; canceled?: boolean }>;
      importProfiles: () => Promise<{ success: boolean; count?: number; error?: string; canceled?: boolean }>;
      
      // Chrome operations
      launchProfile: (id: string) => Promise<void>;
      stopProfile: (id: string) => Promise<void>;

      // Proxy operations
      checkProxy: (type: string, host: string, port: number, user?: string, pass?: string) => Promise<ProxyCheckResult>;

      // Proxy list management
      getProxies: () => Promise<ProxyData[]>;
      createProxy: (data: { name: string; type: string; host: string; port: number; username?: string; password?: string }) => Promise<ProxyData>;
      updateProxy: (id: string, data: { name?: string; type?: string; host?: string; port?: number; username?: string; password?: string }) => Promise<ProxyData>;
      deleteProxy: (id: string) => Promise<void>;

      // Cookie and Backup operations
      importCookies: (profileId: string) => Promise<{ success: boolean; error?: string; canceled?: boolean }>;
      exportCookies: (profileId: string) => Promise<{ success: boolean; error?: string; canceled?: boolean }>;
      backupProfile: (profileId: string) => Promise<{ success: boolean; error?: string; canceled?: boolean }>;
      restoreProfile: (profileId: string) => Promise<{ success: boolean; error?: string; canceled?: boolean }>;

      // Group operations
      getGroups: () => Promise<GroupData[]>;
      createGroup: (name: string, color: string) => Promise<void>;
      deleteGroup: (id: string) => Promise<void>;

      // Settings
      getChromePath: () => Promise<string>;
      setChromePath: (path: string) => Promise<void>;
      selectChromePath: () => Promise<string | null>;
      getProfilesDir: () => Promise<string>;
      setProfilesDir: (dir: string) => Promise<void>;
      selectProfilesDir: () => Promise<string | null>;

      // Browser version management
      getAvailableBrowserVersions: () => Promise<ChromeVersionInfo[]>;
      getInstalledBrowserVersions: () => Promise<InstalledBrowserVersion[]>;
      downloadBrowserVersion: (version: string, channel: string) => Promise<{ success: boolean; error?: string }>;
      deleteBrowserVersion: (version: string) => Promise<{ success: boolean; error?: string }>;
      addCustomBrowserVersion: () => Promise<{ success: boolean; error?: string; canceled?: boolean; version?: string; chromePath?: string }>;
      getDefaultBrowserVersion: () => Promise<string>;
      setDefaultBrowserVersion: (version: string) => Promise<{ success: boolean }>;

      // Window controls
      minimizeWindow: () => Promise<void>;
      maximizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;

      // Events
      onProfileStatusChanged: (callback: (profileId: string, status: string) => void) => void;
      onBackupProgress: (callback: (profileId: string, progress: string) => void) => void;
      onBrowserDownloadProgress: (callback: (version: string, percent: number, message: string) => void) => void;

      // App & Updater
      getAppVersion: () => Promise<string>;
      getPlatform: () => Promise<string>;
      openExternal: (url: string) => Promise<void>;
      checkForUpdates: () => Promise<void>;
      downloadUpdate: () => Promise<void>;
      quitAndInstallUpdate: () => Promise<void>;
      onUpdaterChecking: (callback: () => void) => void;
      onUpdateAvailable: (callback: (info: { version: string; releaseDate: string }) => void) => void;
      onUpdateNotAvailable: (callback: () => void) => void;
      onUpdaterError: (callback: (message: string) => void) => void;
      onDownloadProgress: (callback: (info: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => void;
      onUpdateDownloaded: (callback: (info: { version: string }) => void) => void;
    };
  }
}

export interface GroupData {
  id: string;
  name: string;
  color: string;
}

export interface ProfileData {
  id: string;
  name: string;
  group_name: string | null;
  proxy_type: string | null;
  proxy_host: string | null;
  proxy_port: number | null;
  proxy_user: string | null;
  proxy_pass: string | null;
  proxy_enabled: number;
  notes: string | null;
  browser_version: string | null;
  user_data_dir: string;
  startup_url: string | null;
  startup_type: 'new_tab' | 'continue' | 'specific_pages';
  startup_urls: string | null;
  has_password: boolean;
  fingerprint_flags: string | null;
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
  proxy_enabled?: number;
  notes?: string;
  startup_url?: string;
  startup_type?: 'new_tab' | 'continue' | 'specific_pages';
  startup_urls?: string;
  browser_version?: string;
  fingerprint_flags?: string;
}

export interface ChromeVersionInfo {
  version: string;
  channel: string;
  revision: string;
  installed: boolean;
}

export interface InstalledBrowserVersion {
  version: string;
  channel: string;
  installedAt: string;
  chromePath: string;
}

export interface ProxyCheckResult {
  success: boolean;
  ip?: string;
  country?: string;
  latency?: number;
  error?: string;
}

export interface ProxyData {
  id: string;
  name: string;
  type: string;
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  created_at: string;
  updated_at: string;
}
