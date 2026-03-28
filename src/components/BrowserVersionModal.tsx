import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ChromeVersionInfo, InstalledBrowserVersion } from '../types';
import { getAPI } from '../api';

const api = getAPI();

interface BrowserVersionModalProps {
  onClose: () => void;
}

export default function BrowserVersionModal({ onClose }: BrowserVersionModalProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'installed' | 'available'>('installed');
  const [installed, setInstalled] = useState<InstalledBrowserVersion[]>([]);
  const [available, setAvailable] = useState<ChromeVersionInfo[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ percent: number; message: string }>({ percent: 0, message: '' });
  const [error, setError] = useState<string | null>(null);
  const [defaultVersion, setDefaultVersion] = useState<string>('system');

  const [channelTab, setChannelTab] = useState<string>('CloakBrowser');
  const CHANNELS = ['CloakBrowser', 'Stable', 'Beta', 'Dev', 'Canary', 'Milestone'];

  const loadInstalled = useCallback(() => {
    api.getInstalledBrowserVersions().then(setInstalled);
  }, []);

  const loadDefault = useCallback(() => {
    api.getDefaultBrowserVersion().then(setDefaultVersion);
  }, []);

  const loadAvailable = useCallback(async () => {
    setLoadingAvailable(true);
    setError(null);
    try {
      const data = await api.getAvailableBrowserVersions();
      setAvailable(data);
    } catch (err: any) {
      setError(t('browserVersion.loadError'));
    } finally {
      setLoadingAvailable(false);
    }
  }, []);

  useEffect(() => {
    loadInstalled();
    loadDefault();
    api.onBrowserDownloadProgress((version: string, percent: number, message: string) => {
      setDownloadProgress({ percent, message });
      if (message === 'Completed!' || message === t('browserVersion.completed') || message === 'Hoàn tất!') {
        setDownloading(null);
        loadInstalled();
        loadAvailable();
      }
    });
  }, [loadInstalled, loadDefault, loadAvailable]);

  useEffect(() => {
    if (tab === 'available' && available.length === 0) {
      loadAvailable();
    }
  }, [tab, available.length, loadAvailable]);

  const handleDownload = async (version: string, channel: string) => {
    setDownloading(version);
    setDownloadProgress({ percent: 0, message: t('browserVersion.initializing') });
    const result = await api.downloadBrowserVersion(version, channel);
    if (!result.success) {
      setError(result.error || t('browserVersion.downloadError'));
      setDownloading(null);
    }
  };

  const handleDelete = async (version: string) => {
    const result = await api.deleteBrowserVersion(version);
    if (result.success) {
      // If deleting the default version, reset to system
      if (defaultVersion === version) {
        await api.setDefaultBrowserVersion('system');
        setDefaultVersion('system');
      }
      loadInstalled();
      if (available.length > 0) {
        const updatedAvailable = available.map(v =>
          v.version === version ? { ...v, installed: false } : v
        );
        setAvailable(updatedAvailable);
      }
    } else {
      setError(result.error || t('browserVersion.deleteError'));
    }
  };

  const handleAddCustom = async () => {
    setError(null);
    const result = await api.addCustomBrowserVersion();
    if (result.canceled) return;
    if (result.success) {
      loadInstalled();
    } else {
      setError(result.error || t('browserVersion.invalidChrome'));
    }
  };

  const handleSetDefault = async (version: string) => {
    await api.setDefaultBrowserVersion(version);
    setDefaultVersion(version);
  };

  const getChannelStyle = (channel: string): { background: string; color: string } => {
    if (channel === 'CloakBrowser') return { background: 'linear-gradient(135deg, #0d9488, #065f46)', color: '#fff' };
    if (channel === 'Custom') return { background: '#7c3aed', color: '#fff' };
    if (channel === 'Stable') return { background: '#34a853', color: '#fff' };
    if (channel === 'Beta') return { background: '#fbbc04', color: '#333' };
    if (channel === 'Dev') return { background: '#ea4335', color: '#fff' };
    if (channel === 'Canary') return { background: '#ff6d00', color: '#fff' };
    // Milestone
    return { background: '#4285f4', color: '#fff' };
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600, maxHeight: '80vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('browserVersion.title')}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border-color)', marginBottom: 16 }}>
          <button
            onClick={() => setTab('installed')}
            style={{
              padding: '10px 20px', background: 'none', border: 'none',
              color: tab === 'installed' ? 'var(--primary)' : 'var(--text-secondary)',
              borderBottom: tab === 'installed' ? '2px solid var(--primary)' : '2px solid transparent',
              cursor: 'pointer', fontWeight: tab === 'installed' ? 600 : 400, fontSize: 13,
            }}
          >
            {t('browserVersion.tabInstalled', { count: installed.length })}
          </button>
          <button
            onClick={() => setTab('available')}
            style={{
              padding: '10px 20px', background: 'none', border: 'none',
              color: tab === 'available' ? 'var(--primary)' : 'var(--text-secondary)',
              borderBottom: tab === 'available' ? '2px solid var(--primary)' : '2px solid transparent',
              cursor: 'pointer', fontWeight: tab === 'available' ? 600 : 400, fontSize: 13,
            }}
          >
            {t('browserVersion.tabDownload')}
          </button>
        </div>

        {/* Secondary Channel Tabs */}
        {tab === 'available' && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 16, paddingBottom: 4 }}>
            {CHANNELS.map(c => (
              <button
                key={c}
                onClick={() => setChannelTab(c)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  border: '1px solid',
                  borderColor: channelTab === c ? 'var(--primary)' : 'var(--border-color)',
                  background: channelTab === c ? 'rgba(var(--primary-rgb), 0.1)' : 'var(--bg-tertiary)',
                  color: channelTab === c ? 'var(--primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: channelTab === c ? 600 : 400,
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s',
                }}
              >
                {c === 'CloakBrowser' ? t('browserVersion.cloakBrowserLabel', 'CloakBrowser') : c}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div style={{ padding: '8px 12px', background: 'rgba(234,67,53,0.15)', borderRadius: 6, color: '#ea4335', fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {/* Content */}
        <div style={{ overflowY: 'auto', maxHeight: 'calc(80vh - 160px)' }}>
          {tab === 'installed' && (
            <>
              {/* Add Custom Version button */}
              <button
                onClick={handleAddCustom}
                style={{
                  width: '100%', padding: '10px 16px', marginBottom: 12,
                  background: 'none', border: '1px dashed var(--border-color)', borderRadius: 8,
                  color: 'var(--primary)', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.borderColor = 'var(--primary)';
                  (e.target as HTMLElement).style.background = 'rgba(var(--primary-rgb), 0.05)';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.borderColor = 'var(--border-color)';
                  (e.target as HTMLElement).style.background = 'none';
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {t('browserVersion.addCustom')}
              </button>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* System Chrome entry */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: 8,
                  border: defaultVersion === 'system' ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{t('browserVersion.systemChrome')}</span>
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                      {t('browserVersion.systemChromeDesc')}
                    </span>
                  </div>
                  {defaultVersion === 'system' ? (
                    <span style={{ fontSize: 11, color: '#34a853', fontWeight: 600 }}>{t('browserVersion.isDefault')}</span>
                  ) : (
                    <button
                      className="btn btn-sm"
                      onClick={() => handleSetDefault('system')}
                      style={{ fontSize: 10, padding: '3px 8px' }}
                    >
                      {t('browserVersion.setDefault')}
                    </button>
                  )}
                </div>

                {installed.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-secondary)' }}>
                    <p style={{ fontSize: 13 }}>{t('browserVersion.emptyInstalled1')}</p>
                    <p style={{ fontSize: 11, marginTop: 4 }}>{t('browserVersion.emptyInstalled2')}</p>
                  </div>
                )}

                {installed.map((v) => (
                  <div key={v.version} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: 8,
                    border: defaultVersion === v.version ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{v.version}</span>
                        <span style={{
                          fontSize: 10, padding: '2px 6px', borderRadius: 4,
                          ...getChannelStyle(v.channel),
                        }}>
                          {v.channel === 'Custom' ? t('browserVersion.customLabel') : v.channel}
                        </span>
                        {defaultVersion === v.version && (
                          <span style={{ fontSize: 10, color: '#34a853', fontWeight: 600 }}>
                            {t('browserVersion.isDefault')}
                          </span>
                        )}
                      </div>
                      {v.channel === 'Custom' && v.chromePath && (
                        <div style={{
                          fontSize: 10, color: 'var(--text-secondary)', marginTop: 3,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '350px',
                        }} title={v.chromePath}>
                          {t('browserVersion.customPath', { path: v.chromePath })}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                        {t('browserVersion.installedAt', { date: new Date(v.installedAt).toLocaleString() })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {defaultVersion !== v.version && (
                        <button
                          className="btn btn-sm"
                          onClick={() => handleSetDefault(v.version)}
                          style={{ fontSize: 10, padding: '3px 8px' }}
                        >
                          {t('browserVersion.setDefault')}
                        </button>
                      )}
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(v.version)}
                        style={{ fontSize: 11, padding: '4px 10px' }}
                      >
                        {t('browserVersion.delete')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'available' && (
            <>
              {loadingAvailable ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
                  <p>{t('browserVersion.loadingVersions')}</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {available.filter(v => {
                    if (channelTab === 'Milestone') {
                      return !CHANNELS.includes(v.channel) || v.channel.startsWith('Milestone');
                    }
                    if (channelTab === 'CloakBrowser') {
                      return v.channel === 'CloakBrowser';
                    }
                    return v.channel === channelTab;
                  }).map((v) => (
                    <div key={v.version + v.channel} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: 8,
                      border: '1px solid var(--border-color)',
                    }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{v.version}</span>
                        <span style={{
                          marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 4,
                          ...getChannelStyle(v.channel),
                        }}>
                          {v.channel}
                        </span>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                          {t('browserVersion.revision', { rev: v.revision })}
                        </div>
                      </div>
                      <div>
                        {v.installed ? (
                          <span style={{ fontSize: 12, color: '#34a853', fontWeight: 500 }}>{t('browserVersion.installedCheck')}</span>
                        ) : downloading === v.version ? (
                          <div style={{ textAlign: 'right', minWidth: 150 }}>
                            <div style={{
                              width: '100%', height: 6, background: 'var(--bg-secondary)',
                              borderRadius: 3, overflow: 'hidden', marginBottom: 4,
                            }}>
                              <div style={{
                                width: `${downloadProgress.percent}%`, height: '100%',
                                background: 'var(--primary)', borderRadius: 3, transition: 'width 0.3s ease',
                              }} />
                            </div>
                            <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                              {downloadProgress.message}
                            </span>
                          </div>
                        ) : (
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => handleDownload(v.version, v.channel)}
                            disabled={downloading !== null}
                            style={{ fontSize: 11, padding: '4px 12px' }}
                          >
                            {t('browserVersion.downloadBtn')}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
