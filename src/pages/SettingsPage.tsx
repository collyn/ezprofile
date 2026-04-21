import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialog } from '../contexts/DialogContext';
import { getAPI } from '../api';
import SyncSettingsSection from '../components/SyncSettingsSection';
import { ArrowLeftIcon, CheckIcon, ChromeIcon, ResetIcon, FolderIcon, InfoIcon, SpinnerIcon, DownloadIcon, ArrowDownIcon, SparklesIcon, KeyboardIcon } from '../components/Icons';

const api = getAPI();

interface SettingsPageProps {
  onBack: () => void;
}

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'up-to-date' | 'error';

export default function SettingsPage({ onBack }: SettingsPageProps) {
  const { t } = useTranslation();
  const dialog = useDialog();
  const [chromePath, setChromePath] = useState('');
  const [profilesDir, setProfilesDir] = useState('');
  const [appVersion, setAppVersion] = useState('');
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  // Update states
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [newVersion, setNewVersion] = useState('');
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [updateError, setUpdateError] = useState('');
  const [isMac, setIsMac] = useState(false);
  const [isExportingSettings, setIsExportingSettings] = useState(false);
  const [isImportingSettings, setIsImportingSettings] = useState(false);
  const [settingsPassword, setSettingsPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [checkUpdateOnStartup, setCheckUpdateOnStartup] = useState(true);
  const [includePrereleaseUpdates, setIncludePrereleaseUpdates] = useState(false);
  const [disableGpuAcceleration, setDisableGpuAcceleration] = useState(false);
  const [gpuRestartRequired, setGpuRestartRequired] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [path, dir, version, platform] = await Promise.all([
          api.getChromePath(),
          api.getProfilesDir(),
          api.getAppVersion(),
          api.getPlatform(),
        ]);
        setChromePath(path || '');
        setProfilesDir(dir || '');
        setIsMac(platform === 'darwin');
        setAppVersion(version || '1.0.0');
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setLoading(false);
      }
    };
    load();

    // Load check update on startup setting
    api.getCheckUpdateOnStartup().then(val => setCheckUpdateOnStartup(val));
    api.getIncludePrereleaseUpdates().then(val => setIncludePrereleaseUpdates(val));
    api.getDisableGpuAcceleration().then(val => setDisableGpuAcceleration(val));

    // Listen for updater events
    api.onUpdaterChecking(() => {
      setUpdateStatus('checking');
      setUpdateError('');
    });
    api.onUpdateAvailable((info) => {
      setUpdateStatus('available');
      setNewVersion(info.version);
    });
    api.onUpdateNotAvailable(() => {
      setUpdateStatus('up-to-date');
    });
    api.onUpdaterError((message) => {
      setUpdateStatus('error');
      setUpdateError(message);
    });
    api.onDownloadProgress((info) => {
      setUpdateStatus('downloading');
      setDownloadPercent(Math.round(info.percent));
    });
    api.onUpdateDownloaded((info) => {
      setUpdateStatus('ready');
      setNewVersion(info.version);
    });
  }, []);

  const handleCheckForUpdates = () => {
    setUpdateStatus('checking');
    setUpdateError('');
    setDownloadPercent(0);
    api.checkForUpdates();
  };

  const handleDownloadUpdate = () => {
    setUpdateStatus('downloading');
    setDownloadPercent(0);
    api.downloadUpdate();
  };

  const handleInstallUpdate = () => {
    api.quitAndInstallUpdate();
  };

  const handleSelectChromePath = async () => {
    const selected = await api.selectChromePath();
    if (selected) {
      setChromePath(selected);
      await api.setChromePath(selected);
      showSaved();
    }
  };

  const handleSaveChromePath = async () => {
    await api.setChromePath(chromePath);
    showSaved();
  };

  const handleResetChromePath = async () => {
    setChromePath('');
    await api.setChromePath('');
    showSaved();
  };

  const handleSelectProfilesDir = async () => {
    const selected = await api.selectProfilesDir();
    if (selected) {
      setProfilesDir(selected);
      await api.setProfilesDir(selected);
      showSaved();
    }
  };

  const handleSaveProfilesDir = async () => {
    await api.setProfilesDir(profilesDir);
    showSaved();
  };

  const showSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleExportSettings = async () => {
    if (!settingsPassword) {
      setPasswordError(true);
      dialog.alert(t('settings.backup.requirePassword', 'Please enter a password to encrypt your settings Backup!'));
      return;
    }
    setPasswordError(false);
    setIsExportingSettings(true);
    const res = await api.settingsExportBackup(settingsPassword);
    if (res.success && !res.canceled) {
      dialog.alert(t('settings.backup.exportSuccess', 'Settings exported successfully!'));
      setSettingsPassword('');
    } else if (res.error) {
      dialog.alert(t('settings.backup.exportError', 'Export failed: ') + res.error);
    }
    setIsExportingSettings(false);
  };

  const handleImportSettings = async () => {
    if (!settingsPassword) {
      setPasswordError(true);
      dialog.alert(t('settings.backup.requirePassword', 'Please enter a password to decrypt your settings Backup!'));
      return;
    }
    setPasswordError(false);
    
    const confirmed = await dialog.confirm(
      t('settings.backup.importConfirm', 'Importing settings will overwrite your current configurations. Do you want to proceed?')
    );
    if (!confirmed) return;
    
    setIsImportingSettings(true);
    const res = await api.settingsImportBackup(settingsPassword);
    if (res.success && !res.canceled) {
      dialog.alert(t('settings.backup.importSuccess', 'Settings imported successfully!'));
      setSettingsPassword('');
      // Reload settings to reflect changes
      const [path, dir] = await Promise.all([
        api.getChromePath(),
        api.getProfilesDir()
      ]);
      setChromePath(path || '');
      setProfilesDir(dir || '');
    } else if (res.error) {
      dialog.alert(t('settings.backup.importError', 'Import failed: ') + res.error);
    }
    setIsImportingSettings(false);
  };

  if (loading) {
    return (
      <div style={{ padding: 24, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <span style={{ color: 'var(--text-secondary)' }}>{t('settings.loading')}</span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
    <div style={{ padding: '0 24px 24px', maxWidth: 720, margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '16px 0', marginBottom: 8,
        borderBottom: '1px solid var(--border-color)',
      }}>
        <button
          className="btn btn-sm"
          onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <ArrowLeftIcon size={14} />
          {t('settings.back')}
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{t('settings.title')}</h1>
        {saved && (
          <span style={{
            marginLeft: 'auto', fontSize: 12, color: '#34a853',
            display: 'flex', alignItems: 'center', gap: 4,
            animation: 'fadeIn 0.3s ease',
          }}>
            <CheckIcon size={14} />
            {t('settings.saved')}
          </span>
        )}
      </div>

      {/* Chrome Path */}
      <section style={{ marginBottom: 28 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
          marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <ChromeIcon size={16} />
          {t('settings.chromePath.title')}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10, marginTop: 0 }}>
          {t('settings.chromePath.desc')}
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            value={chromePath}
            onChange={(e) => setChromePath(e.target.value)}
            placeholder={t('settings.chromePath.placeholder')}
            style={{ flex: 1 }}
          />
          <button className="btn btn-sm" onClick={handleSelectChromePath}>
            {t('settings.chromePath.select')}
          </button>
          <button className="btn btn-sm" onClick={handleSaveChromePath} disabled={!chromePath}>
            {t('settings.chromePath.save')}
          </button>
          {chromePath && (
            <button className="btn btn-sm btn-outline" onClick={handleResetChromePath} title={t('settings.chromePath.reset')}>
              <ResetIcon size={14} />
            </button>
          )}
        </div>
      </section>

      {/* Profiles Directory */}
      <section style={{ marginBottom: 28 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
          marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <FolderIcon size={16} />
          {t('settings.profilesDir.title')}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10, marginTop: 0 }}>
          {t('settings.profilesDir.desc')}
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            value={profilesDir}
            onChange={(e) => setProfilesDir(e.target.value)}
            placeholder={t('settings.profilesDir.placeholder')}
            style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
          />
          <button className="btn btn-sm" onClick={handleSelectProfilesDir}>
            {t('settings.profilesDir.select')}
          </button>
          <button className="btn btn-sm" onClick={handleSaveProfilesDir}>
            {t('settings.profilesDir.save')}
          </button>
        </div>
      </section>

      {/* Cloud Sync */}
      <SyncSettingsSection />

      {/* Settings Backup */}
      <section style={{ marginBottom: 28 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
          marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <FolderIcon size={16} />
          {t('settings.backup.title', 'Backup & Restore Settings')}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10, marginTop: 0 }}>
          {t('settings.backup.desc', 'Backup your local settings, Sync provider configurations, and encryption keys. You must provide a password.')}
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="password"
            value={settingsPassword}
            onChange={(e) => {
              setSettingsPassword(e.target.value);
              if (passwordError && e.target.value) setPasswordError(false);
            }}
            placeholder={t('settings.backup.passwordPlaceholder', 'Encryption Password...')}
            disabled={isExportingSettings || isImportingSettings}
            style={{ 
              width: 180, 
              borderColor: passwordError ? '#ea4335' : undefined,
              boxShadow: passwordError ? '0 0 0 1px #ea4335' : undefined
            }}
          />
          <button className="btn btn-sm btn-primary" onClick={handleExportSettings} disabled={isExportingSettings || isImportingSettings}>
            {isExportingSettings ? <SpinnerIcon size={14} /> : <DownloadIcon size={14} />}
            {t('settings.backup.exportBtn', 'Export Settings')}
          </button>
          <button className="btn btn-sm" onClick={handleImportSettings} disabled={isExportingSettings || isImportingSettings}>
            {isImportingSettings ? <SpinnerIcon size={14} /> : <FolderIcon size={14} />}
            {t('settings.backup.importBtn', 'Import Settings')}
          </button>
        </div>
      </section>

      {/* Rendering */}
      <section style={{ marginBottom: 28 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
          marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <ChromeIcon size={16} />
          {t('settings.gpuAcceleration.title', { defaultValue: 'Rendering' })}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10, marginTop: 0 }}>
          {t('settings.gpuAcceleration.desc', {
            defaultValue: 'Disable GPU acceleration if the app flickers, renders incorrectly, or lags because of graphics driver issues. This only applies after restarting EzProfile.',
          })}
        </p>
        <div style={{
          padding: '14px',
          background: 'var(--bg-tertiary)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <div>
            <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
              {t('settings.gpuAcceleration.disableLabel', { defaultValue: 'Disable GPU acceleration' })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              {gpuRestartRequired
                ? t('settings.gpuAcceleration.restartRequired', { defaultValue: 'Restart EzProfile to apply this change.' })
                : t('settings.gpuAcceleration.restartHint', { defaultValue: 'Recommended only when you see rendering glitches, driver instability, or remote desktop lag.' })}
            </div>
          </div>
          <label className="toggle-switch" style={{ flexShrink: 0 }}>
            <input
              type="checkbox"
              checked={disableGpuAcceleration}
              onChange={async (e) => {
                const val = e.target.checked;
                setDisableGpuAcceleration(val);
                setGpuRestartRequired(true);
                await api.setDisableGpuAcceleration(val);
                showSaved();
              }}
            />
            <span className="toggle-slider" />
          </label>
        </div>
      </section>

      {/* App Info */}
      <section style={{ marginBottom: 28 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
          marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <InfoIcon size={16} />
          {t('settings.appInfo.title')}
        </div>
        <div style={{
          padding: '14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)', fontSize: 12,
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <InfoRow label={t('settings.appInfo.app')} value="EzProfile" />
              <InfoRow label={t('settings.appInfo.version')} value={appVersion} />
              <InfoRow label={t('settings.appInfo.framework')} value="Electron + React + TypeScript" />
              <InfoRow label={t('settings.appInfo.database')} value="SQLite (better-sqlite3)" />
              <InfoRow label={t('settings.appInfo.os')} value={navigator.platform} />
            </tbody>
          </table>

          {/* Update Status Banner */}
          {updateStatus !== 'idle' && (
            <div style={{
              marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-color)',
            }}>
              {/* Checking */}
              {updateStatus === 'checking' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
                  <SpinnerIcon size={14} />
                  {t('settings.appInfo.checking')}
                </div>
              )}

              {/* Up to date */}
              {updateStatus === 'up-to-date' && (
                <div style={{ color: '#34a853', fontWeight: 500 }}>
                  {t('settings.appInfo.upToDate')}
                </div>
              )}

              {/* Update available */}
              {updateStatus === 'available' && (
                <div>
                  <div style={{
                    color: '#fbbc05', fontWeight: 600, marginBottom: 10,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <ArrowDownIcon size={14} />
                    {t('settings.appInfo.updateAvailable', { version: newVersion })}
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={handleDownloadUpdate}>
                    <DownloadIcon size={12} strokeWidth={2.5} style={{ marginRight: 4 }} />
                    {t('settings.appInfo.downloadUpdate')}
                  </button>
                </div>
              )}

              {/* Downloading */}
              {updateStatus === 'downloading' && (
                <div>
                  <div style={{ color: '#4285f4', fontWeight: 500, marginBottom: 8 }}>
                    {t('settings.appInfo.downloading', { percent: downloadPercent })}
                  </div>
                  <div style={{
                    width: '100%', height: 6, background: 'var(--bg-secondary)',
                    borderRadius: 3, overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${downloadPercent}%`, height: '100%',
                      background: 'linear-gradient(90deg, #4285f4, #34a853)',
                      borderRadius: 3, transition: 'width 0.3s ease',
                    }} />
                  </div>
                </div>
              )}

              {/* Download ready */}
              {updateStatus === 'ready' && (
                <div>
                  <div style={{
                    color: '#34a853', fontWeight: 600, marginBottom: 10,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <CheckIcon size={14} />
                    {t('settings.appInfo.downloadReady', { version: newVersion })}
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={handleInstallUpdate}>
                    <SparklesIcon size={12} strokeWidth={2.5} style={{ marginRight: 4 }} />
                    {t('settings.appInfo.installUpdate')}
                  </button>
                </div>
              )}

              {/* Error */}
              {updateStatus === 'error' && (
                <div>
                  <div style={{ color: '#ea4335', fontWeight: 500, marginBottom: 10 }}>
                    {t('settings.appInfo.updateError', { error: updateError })}
                  </div>
                  <button className="btn btn-sm" onClick={handleCheckForUpdates}>
                    {t('settings.appInfo.retryCheck')}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Check for updates button (only shown when idle) */}
          {updateStatus === 'idle' && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-color)' }}>
              <button className="btn btn-primary btn-sm" onClick={handleCheckForUpdates}>
                {t('settings.appInfo.checkUpdate')}
              </button>
            </div>
          )}

          {/* Check update on startup toggle */}
          <div style={{
            marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-color)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                {t('settings.appInfo.checkUpdateOnStartup')}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                {t('settings.appInfo.checkUpdateOnStartupDesc')}
              </div>
            </div>
            <label className="toggle-switch" style={{ flexShrink: 0, marginLeft: 16 }}>
              <input
                type="checkbox"
                checked={checkUpdateOnStartup}
                onChange={(e) => {
                  const val = e.target.checked;
                  setCheckUpdateOnStartup(val);
                  api.setCheckUpdateOnStartup(val);
                  showSaved();
                }}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          <div style={{
            marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-color)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                {t('settings.appInfo.includePrereleaseUpdates')}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                {t('settings.appInfo.includePrereleaseUpdatesDesc')}
              </div>
            </div>
            <label className="toggle-switch" style={{ flexShrink: 0, marginLeft: 16 }}>
              <input
                type="checkbox"
                checked={includePrereleaseUpdates}
                onChange={(e) => {
                  const val = e.target.checked;
                  setIncludePrereleaseUpdates(val);
                  api.setIncludePrereleaseUpdates(val);
                  showSaved();
                }}
              />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>
      </section>

      {/* Keyboard Shortcuts */}
      <section style={{ marginBottom: 28 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
          marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <KeyboardIcon size={16} />
          {t('settings.shortcuts.title')}
        </div>
        <div style={{
          padding: '14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)', fontSize: 12,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <ShortcutRow keys={[isMac ? '⌘' : 'Ctrl', 'A']} desc={t('settings.shortcuts.selectAll')} />
          <ShortcutRow keys={[isMac ? '⌘' : 'Ctrl', 'Click']} desc={t('settings.shortcuts.selectMulti')} />
          <ShortcutRow keys={['Right Click']} desc={t('settings.shortcuts.contextMenu')} />
          <ShortcutRow keys={['Esc']} desc={t('settings.shortcuts.close')} />
        </div>
      </section>
    </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{ padding: '4px 0', color: 'var(--text-secondary)', width: 130 }}>{label}</td>
      <td style={{ padding: '4px 0', color: 'var(--text-primary)', fontWeight: 500 }}>{value}</td>
    </tr>
  );
}

function ShortcutRow({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {keys.map((key, i) => (
          <span key={i}>
            <kbd style={{
              padding: '2px 6px', borderRadius: 4, fontSize: 11, fontFamily: 'inherit',
              background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
            }}>
              {key}
            </kbd>
            {i < keys.length - 1 && <span style={{ color: 'var(--text-muted)', margin: '0 2px' }}>+</span>}
          </span>
        ))}
      </div>
      <span style={{ color: 'var(--text-secondary)' }}>{desc}</span>
    </div>
  );
}
