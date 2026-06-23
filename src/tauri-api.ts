import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

function noopListener() {
  return;
}

export function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__;
}

// --- Updater event emitter (keeps API compatible with Electron pattern) ---
type UpdaterEventMap = {
  checking: Array<() => void>;
  available: Array<(info: { version: string; releaseDate: string }) => void>;
  notAvailable: Array<() => void>;
  error: Array<(message: string) => void>;
  progress: Array<(info: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void>;
  downloaded: Array<(info: { version: string }) => void>;
};

const updaterListeners: UpdaterEventMap = {
  checking: [],
  available: [],
  notAvailable: [],
  error: [],
  progress: [],
  downloaded: [],
};

function updaterEmit<K extends keyof UpdaterEventMap>(event: K, ...args: Parameters<UpdaterEventMap[K][number]>) {
  (updaterListeners[event] as Array<(...args: any[]) => void>).forEach((cb) => (cb as any)(...args));
}

let pendingUpdate: any = null;

import type { AppAPI } from './types';

export const tauriAPI: AppAPI = {
  getProfiles: () => invoke('profile_get_all'),
  createProfile: (data) => invoke('profile_create', { data }),
  updateProfile: (id, data) => invoke('profile_update', { id, data }),
  updateProfiles: (ids, data) => invoke('profile_update_batch', { ids, data }),
  deleteProfile: (id) => invoke('profile_delete', { id }),
  cloneProfile: (id) => invoke('profile_clone', { id }),
  setProfilePassword: (id, password) => invoke('profile_set_password', { id, password }),
  removeProfilePassword: (id, password) => invoke('profile_remove_password', { id, password }),
  verifyProfilePassword: (id, password) => invoke('profile_verify_password', { id, password }),
  deleteProfiles: (ids) => invoke('profile_delete_many', { ids }),
  exportProfiles: (ids) => invoke('profile_export', { ids }),
  importProfiles: () => invoke('profile_import'),
  launchProfile: (id, bounds) => invoke('chrome_launch', { id, bounds }),
  stopProfile: (id) => invoke('chrome_stop', { id }),
  focusProfile: (id) => invoke('chrome_focus', { id }),
  checkProxy: (proxyType, host, port, user, pass) => invoke('proxy_check', { proxyType, host, port, user, pass }),
  lookupProxyCountry: (ip) => invoke('proxy_lookup_country', { ip }),
  getProxies: () => invoke('proxy_get_all'),
  createProxy: (data) => invoke('proxy_create', { data }),
  updateProxy: (id, data) => invoke('proxy_update', { id, data }),
  deleteProxy: (id) => invoke('proxy_delete', { id }),
  getExtensions: () => invoke('extension_get_all'),
  uploadExtension: () => invoke('extension_upload'),
  downloadExtensionFromStore: (storeUrl) => invoke('extension_download_from_store', { storeUrl }),
  updateExtension: (id, data) => invoke('extension_update', { id, data }),
  deleteExtension: (id) => invoke('extension_delete', { id }),
  checkExtensionUpdate: (id) => invoke('extension_check_update', { id }),
  performExtensionUpdate: (id) => invoke('extension_perform_update', { id }),
  getProfileExtensions: (profileId) => invoke('extension_get_profile_extensions', { profileId }),
  setProfileExtensions: (profileIds, extensionIds) => invoke('extension_set_profile_extensions', { profileIds, extensionIds }),
  addExtensionToProfiles: (extensionId, profileIds) => invoke('extension_add_to_profiles', { extensionId, profileIds }),
  getExtensionIcon: (iconPath) => invoke('extension_get_icon', { iconPath }),
  importCookies: (profileId) => invoke('cookie_import', { profileId }),
  exportCookies: (profileId) => invoke('cookie_export', { profileId }),
  backupProfile: (profileId) => invoke('profile_backup', { profileId }),
  restoreProfile: (profileId) => invoke('profile_restore', { profileId }),
  getGroups: () => invoke('group_get_all'),
  createGroup: (name, color) => invoke('group_create', { name, color }),
  deleteGroup: (id) => invoke('group_delete', { id }),
  getChromePath: () => invoke('settings_get_chrome_path'),
  setChromePath: (path) => invoke('settings_set_chrome_path', { path }),
  selectChromePath: () => invoke('settings_select_chrome_path'),
  getProfilesDir: () => invoke('settings_get_profiles_dir'),
  setProfilesDir: (dir) => invoke('settings_set_profiles_dir', { dir }),
  selectProfilesDir: () => invoke('settings_select_profiles_dir'),
  settingsExportBackup: (password) => invoke('settings_export_backup', { password }),
  settingsImportBackup: (password) => invoke('settings_import_backup', { password }),
  getCheckUpdateOnStartup: () => invoke('settings_get_check_update_on_startup'),
  setCheckUpdateOnStartup: (enabled) => invoke('settings_set_check_update_on_startup', { enabled }),
  getIncludePrereleaseUpdates: () => invoke('settings_get_include_prerelease_updates'),
  setIncludePrereleaseUpdates: (enabled) => invoke('settings_set_include_prerelease_updates', { enabled }),

  getAvailableBrowserVersions: () => invoke('browser_get_available'),
  getInstalledBrowserVersions: () => invoke('browser_get_installed'),
  downloadBrowserVersion: (version, channel) => invoke('browser_download', { version, channel }),
  deleteBrowserVersion: (version) => invoke('browser_delete', { version }),
  addCustomBrowserVersion: () => invoke('browser_add_custom'),
  getDefaultBrowserVersion: () => invoke('browser_get_default'),
  setDefaultBrowserVersion: (version) => invoke('browser_set_default', { version }),
  minimizeWindow: () => invoke('window_minimize'),
  maximizeWindow: () => invoke('window_maximize'),
  closeWindow: () => invoke('window_close'),
  onProfileStatusChanged: (callback) => {
    listen<[string, string]>('profile:statusChanged', (event) => callback(event.payload[0], event.payload[1])).catch(noopListener);
  },
  onProxyUpdated: (callback) => {
    listen('proxy:updated', callback).catch(noopListener);
  },
  onBackupProgress: (callback) => {
    listen<[string, string]>('profile:backupProgress', (event) => callback(event.payload[0], event.payload[1])).catch(noopListener);
  },
  onBrowserDownloadProgress: (callback) => {
    listen<[string, number, string]>('browser:downloadProgress', (event) => callback(event.payload[0], event.payload[1], event.payload[2])).catch(noopListener);
  },
  getAppVersion: () => invoke('app_get_version'),
  getPlatform: () => invoke('app_get_platform'),
  openExternal: (url) => invoke('app_open_external', { url }),
  checkForUpdates: async () => {
    updaterEmit('checking');
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      pendingUpdate = update;
      if (update) {
        updaterEmit('available', { version: update.version, releaseDate: update.date || '' });
      } else {
        updaterEmit('notAvailable');
      }
    } catch (e) {
      updaterEmit('error', String(e));
    }
  },
  downloadUpdate: async () => {
    if (!pendingUpdate) return;
    let totalBytes = 0;
    try {
      await pendingUpdate.downloadAndInstall((event: any) => {
        switch (event.event) {
          case 'Started':
            totalBytes = event.data.contentLength ?? 0;
            break;
          case 'Progress': {
            const pct = totalBytes > 0 ? Math.round((event.data.downloaded / totalBytes) * 100) : 0;
            updaterEmit('progress', {
              percent: pct,
              transferred: event.data.downloaded,
              total: totalBytes,
              bytesPerSecond: 0,
            });
            break;
          }
          case 'Finished':
            updaterEmit('downloaded', { version: pendingUpdate?.version ?? '' });
            break;
          case 'Error':
            updaterEmit('error', String(event.data));
            break;
        }
      });
    } catch (e) {
      updaterEmit('error', String(e));
    }
  },
  quitAndInstallUpdate: async () => {
    await invoke('app_quit');
  },
  onUpdaterChecking: (cb: () => void) => { updaterListeners.checking.push(cb); },
  onUpdateAvailable: (cb: (info: { version: string; releaseDate: string }) => void) => { updaterListeners.available.push(cb); },
  onUpdateNotAvailable: (cb: () => void) => { updaterListeners.notAvailable.push(cb); },
  onUpdaterError: (cb: (message: string) => void) => { updaterListeners.error.push(cb); },
  onDownloadProgress: (cb: (info: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => { updaterListeners.progress.push(cb); },
  onUpdateDownloaded: (cb: (info: { version: string }) => void) => { updaterListeners.downloaded.push(cb); },
  syncGetSettings: () => invoke('sync_get_settings'),
  syncSetProvider: (provider) => invoke('sync_set_provider', { provider }),
  syncSaveS3Config: (config) => invoke('sync_save_s3_config', { config }),
  syncTestS3: () => invoke('sync_test_s3'),
  syncStartGoogleAuth: () => invoke('sync_start_google_auth'),
  syncGetGoogleAuthStatus: () => invoke('sync_get_google_auth_status'),
  syncRevokeGoogle: () => invoke('sync_revoke_google'),
  syncSaveGoogleClientId: (clientId) => invoke('sync_save_google_client_id', { clientId }),
  syncSaveGoogleClientSecret: (secret) => invoke('sync_save_google_client_secret', { secret }),
  syncSetPassphrase: (passphrase, hint) => invoke('sync_set_passphrase', { passphrase, hint }),
  syncChangePassphrase: (oldPassphrase, newPassphrase, newHint) => invoke('sync_change_passphrase', { oldPassphrase, newPassphrase, newHint }),
  syncClearPassphrase: () => invoke('sync_clear_passphrase'),
  syncHasPassphrase: () => invoke('sync_has_passphrase'),
  syncUploadProfile: (profileId, isBackup, targetProvider) => invoke('sync_upload_profile', { profileId, isBackup, targetProvider }),
  syncDownloadProfile: (profileId, remoteFileRef, overridePassphrase) => invoke('sync_download_profile', { profileId, remoteFileRef, overridePassphrase }),
  syncListBackups: (profileId, targetProvider) => invoke('sync_list_backups', { profileId, targetProvider }),
  syncUploadAll: () => invoke('sync_upload_all'),
  syncSetAutoSyncOnClose: (enabled) => invoke('sync_set_auto_sync_on_close', { enabled }),
  syncSetMaxBackups: (maxLimit) => invoke('sync_set_max_backups', { maxLimit }),
  syncGetSyncLog: (profileId) => invoke('sync_get_sync_log', { profileId }),
  syncDeleteBackup: (remoteFileRef, provider) => invoke('sync_delete_backup', { remoteFileRef, provider }),
  syncBackupAllListToCloud: () => invoke('sync_backup_all_list_to_cloud'),
  syncRestoreAllListFromCloud: (passphrase) => invoke('sync_restore_all_list_from_cloud', { passphrase }),
  syncRestoreAll: () => invoke('sync_restore_all'),
  onSyncProgress: (callback) => { listen<any>('sync:progress', (event) => callback(event.payload)).catch(noopListener); },
  onSyncAllComplete: (callback) => { listen<any>('sync:allComplete', (event) => callback(event.payload)).catch(noopListener); },
};
