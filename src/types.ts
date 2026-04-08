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
      launchProfile: (id: string, bounds?: { x: number; y: number; width: number; height: number }) => Promise<void>;
      stopProfile: (id: string) => Promise<void>;
      focusProfile: (id: string) => Promise<void>;

      // Proxy operations
      checkProxy: (type: string, host: string, port: number, user?: string, pass?: string) => Promise<ProxyCheckResult>;
      lookupProxyCountry: (ip: string) => Promise<{ countryCode: string; countryName: string } | null>;

      // Proxy list management
      getProxies: () => Promise<ProxyData[]>;
      createProxy: (data: { name: string; type: string; host: string; port: number; username?: string; password?: string; country_code?: string; country_name?: string }) => Promise<ProxyData>;
      updateProxy: (id: string, data: { name?: string; type?: string; host?: string; port?: number; username?: string; password?: string; country_code?: string; country_name?: string }) => Promise<ProxyData>;
      deleteProxy: (id: string) => Promise<void>;

      // Extension operations
      getExtensions: () => Promise<ExtensionData[]>;
      uploadExtension: () => Promise<{ success: boolean; extension?: ExtensionData; canceled?: boolean; error?: string }>;
      downloadExtensionFromStore: (storeUrl: string) => Promise<{ success: boolean; extension?: ExtensionData; error?: string }>;
      updateExtension: (id: string, data: { name?: string }) => Promise<ExtensionData>;
      deleteExtension: (id: string) => Promise<void>;
      checkExtensionUpdate: (id: string) => Promise<{ success: boolean; current_version?: string; store_version?: string; has_update?: boolean; error?: string }>;
      performExtensionUpdate: (id: string) => Promise<{ success: boolean; extension?: ExtensionData; error?: string }>;
      getProfileExtensions: (profileId: string) => Promise<ExtensionData[]>;
      setProfileExtensions: (profileIds: string[], extensionIds: string[]) => Promise<void>;
      addExtensionToProfiles: (extensionId: string, profileIds: string[]) => Promise<void>;
      getExtensionIcon: (iconPath: string) => Promise<string | null>;

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
      settingsExportBackup: (password: string) => Promise<{ success: boolean, canceled?: boolean, error?: string }>;
      settingsImportBackup: (password: string) => Promise<{ success: boolean, canceled?: boolean, error?: string }>;
      getCheckUpdateOnStartup: () => Promise<boolean>;
      setCheckUpdateOnStartup: (enabled: boolean) => Promise<void>;

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
      onProxyUpdated: (callback: () => void) => void;

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
      // Sync / Cloud Backup
      syncGetSettings: () => Promise<SyncSettings & { hasPassphrase: boolean }>;
      syncSetProvider: (provider: string) => Promise<void>;
      syncSaveS3Config: (config: { accessKeyId: string; secretAccessKey: string; bucket: string; region: string; prefix: string; endpoint?: string }) => Promise<{ success: boolean; error?: string }>;
      syncTestS3: () => Promise<{ success: boolean; error?: string }>;
      syncStartGoogleAuth: () => Promise<{ success: boolean; email?: string; error?: string }>;
      syncGetGoogleAuthStatus: () => Promise<{ connected: boolean; email?: string; clientId?: string; hasSecret?: boolean }>;
      syncRevokeGoogle: () => Promise<{ success: boolean; error?: string }>;
      syncSaveGoogleClientId: (clientId: string) => Promise<{ success: boolean; error?: string }>;
      syncSaveGoogleClientSecret: (secret: string) => Promise<{ success: boolean; error?: string }>;
      syncSetPassphrase: (passphrase: string, hint?: string) => Promise<{ success: boolean; error?: string }>;
      syncChangePassphrase: (oldPassphrase: string, newPassphrase: string, newHint?: string) => Promise<{ success: boolean; error?: string }>;
      syncClearPassphrase: () => Promise<{ success: boolean; error?: string }>;
      syncHasPassphrase: () => Promise<boolean>;
      syncUploadProfile: (profileId: string, isBackup?: boolean, targetProvider?: 'googledrive' | 's3' | 'all') => Promise<{ success: boolean; error?: string }>;
      syncDownloadProfile: (profileId: string, remoteFileRef: string, overridePassphrase?: string) => Promise<{ success: boolean; error?: string }>;
      syncListBackups: (profileId?: string, targetProvider?: 'googledrive' | 's3' | 'all') => Promise<SyncBackupEntry[]>;
      syncUploadAll: () => Promise<{ success: boolean; total?: number; success_count?: number; failed?: number; error?: string }>;
      syncSetAutoSyncOnClose: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
      syncSetMaxBackups: (maxLimit: number) => Promise<{ success: boolean; error?: string }>;
      syncGetSyncLog: (profileId?: string) => Promise<SyncLogEntry[]>;
      syncDeleteBackup: (remoteFileRef: string, provider?: 'googledrive' | 's3') => Promise<{ success: boolean; error?: string }>;
      syncBackupAllListToCloud: () => Promise<{ success: boolean; error?: string }>;
      syncRestoreAllListFromCloud: (passphrase?: string) => Promise<{ success: boolean; count?: number; error?: string }>;
      syncRestoreAll: () => Promise<{ success: boolean; count?: number; failed?: number; error?: string }>;
      onSyncProgress: (callback: (progress: { profileId: string; message: string; percent?: number }) => void) => void;
      onSyncAllComplete: (callback: (result: { total: number; success: number; failed: number; errors: { profileId: string; name: string; error: string }[] }) => void) => void;
    };
  }
}

export interface SyncSettings {
  provider: 'googledrive' | 's3' | null;
  autoSyncOnClose: boolean;
  syncMaxBackups: number;
  passphraseHint: string;
  gdrive?: { connected: boolean; email?: string; clientId?: string; hasSecret?: boolean };
  s3?: {
    accessKeyId: string;
    bucket: string;
    region: string;
    prefix: string;
    endpoint?: string;
    hasSecret: boolean;
    connected: boolean;
  } | null;
}

export interface SyncBackupEntry {
  id: string;
  profileId: string;
  profileName: string;
  createdAt: string;
  sizeBytes: number;
  provider: 'googledrive' | 's3';
}

export interface SyncLogEntry {
  id: string;
  profile_id: string;
  provider: string;
  direction: 'upload' | 'download';
  status: 'success' | 'error';
  error_message?: string;
  remote_file?: string;
  size_bytes?: number;
  created_at: string;
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
  countryCode?: string;
  countryName?: string;
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
  country_code: string | null;
  country_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExtensionData {
  id: string;
  name: string;
  ext_id: string | null;
  version: string | null;
  description: string | null;
  icon_path: string | null;
  source_url: string | null;
  store_version: string | null;
  ext_dir: string;
  profile_count: number;
  created_at: string;
  updated_at: string;
}
