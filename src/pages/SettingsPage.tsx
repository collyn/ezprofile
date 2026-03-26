import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getAPI } from '../api';

const api = getAPI();

interface SettingsPageProps {
  onBack: () => void;
}

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'up-to-date' | 'error';

export default function SettingsPage({ onBack }: SettingsPageProps) {
  const { t } = useTranslation();
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

  useEffect(() => {
    const load = async () => {
      try {
        const [path, dir, version] = await Promise.all([
          api.getChromePath(),
          api.getProfilesDir(),
          api.getAppVersion(),
        ]);
        setChromePath(path || '');
        setProfilesDir(dir || '');
        setAppVersion(version || '1.0.0');
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setLoading(false);
      }
    };
    load();

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

  if (loading) {
    return (
      <div style={{ padding: 24, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <span style={{ color: 'var(--text-secondary)' }}>{t('settings.loading')}</span>
      </div>
    );
  }

  return (
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          {t('settings.back')}
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{t('settings.title')}</h1>
        {saved && (
          <span style={{
            marginLeft: 'auto', fontSize: 12, color: '#34a853',
            display: 'flex', alignItems: 'center', gap: 4,
            animation: 'fadeIn 0.3s ease',
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="M20 6L9 17l-5-5" />
            </svg>
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="4" />
            <line x1="21.17" y1="8" x2="12" y2="8" />
            <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
            <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
          </svg>
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
            <button className="btn btn-sm btn-outline" onClick={handleResetChromePath} title="Reset về mặc định">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M1 4v6h6M23 20v-6h-6" />
                <path d="M20.49 9A9 9 0 105.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
              </svg>
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
          </svg>
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

      {/* App Info */}
      <section style={{ marginBottom: 28 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
          marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
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
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                  </svg>
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
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2v10m0 0l3-3m-3 3l-3-3" />
                      <path d="M20 21H4" />
                    </svg>
                    {t('settings.appInfo.updateAvailable', { version: newVersion })}
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={handleDownloadUpdate} style={{
                    background: 'linear-gradient(135deg, #4285f4, #34a853)',
                    border: 'none', fontWeight: 600,
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 4 }}>
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
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
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    {t('settings.appInfo.downloadReady', { version: newVersion })}
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={handleInstallUpdate} style={{
                    background: 'linear-gradient(135deg, #34a853, #0f9d58)',
                    border: 'none', fontWeight: 600,
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 4 }}>
                      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                    </svg>
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
        </div>
      </section>

      {/* Keyboard Shortcuts */}
      <section style={{ marginBottom: 28 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
          marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <line x1="6" y1="8" x2="6.01" y2="8" />
            <line x1="10" y1="8" x2="10.01" y2="8" />
            <line x1="14" y1="8" x2="14.01" y2="8" />
            <line x1="18" y1="8" x2="18.01" y2="8" />
            <line x1="8" y1="12" x2="8.01" y2="12" />
            <line x1="12" y1="12" x2="12.01" y2="12" />
            <line x1="16" y1="12" x2="16.01" y2="12" />
            <line x1="7" y1="16" x2="17" y2="16" />
          </svg>
          {t('settings.shortcuts.title')}
        </div>
        <div style={{
          padding: '14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)', fontSize: 12,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <ShortcutRow keys={['Ctrl', 'A']} desc={t('settings.shortcuts.selectAll')} />
          <ShortcutRow keys={['Ctrl', 'Click']} desc={t('settings.shortcuts.selectMulti')} />
          <ShortcutRow keys={['Right Click']} desc={t('settings.shortcuts.contextMenu')} />
          <ShortcutRow keys={['Esc']} desc={t('settings.shortcuts.close')} />
        </div>
      </section>
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
