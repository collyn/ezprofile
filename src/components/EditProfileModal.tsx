import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ProfileData, CreateProfileInput, GroupData, InstalledBrowserVersion, ProxyData } from '../types';
import { getAPI } from '../api';
import FingerprintSettings, { FingerprintFlags } from './FingerprintSettings';
import { XIcon } from './Icons';

const api = getAPI();

interface EditProfileModalProps {
  profile: ProfileData;
  groups: GroupData[];
  onClose: () => void;
  onSave: (id: string, input: Partial<CreateProfileInput>) => Promise<void>;
}

export default function EditProfileModal({ profile, groups, onClose, onSave }: EditProfileModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(profile.name);
  const [groupName, setGroupName] = useState(profile.group_name || '');
  const [proxyType, setProxyType] = useState(profile.proxy_type || '');
  const [proxyHost, setProxyHost] = useState(profile.proxy_host || '');
  const [proxyPort, setProxyPort] = useState(profile.proxy_port?.toString() || '');
  const [proxyUser, setProxyUser] = useState(profile.proxy_user || '');
  const [proxyPass, setProxyPass] = useState(profile.proxy_pass || '');
  const [proxyEnabled, setProxyEnabled] = useState(!!profile.proxy_enabled);
  const [notes, setNotes] = useState(profile.notes || '');
  const [startupType, setStartupType] = useState<'new_tab' | 'continue' | 'specific_pages'>(profile.startup_type || 'continue');
  const [startupUrls, setStartupUrls] = useState(profile.startup_urls || '');
  const [browserVersion, setBrowserVersion] = useState(profile.browser_version || 'system');
  const [installedVersions, setInstalledVersions] = useState<InstalledBrowserVersion[]>([]);
  const [savedProxies, setSavedProxies] = useState<ProxyData[]>([]);
  const [proxySource, setProxySource] = useState<'custom' | 'list'>('custom');
  const [submitting, setSubmitting] = useState(false);
  const [fingerprintFlags, setFingerprintFlags] = useState<FingerprintFlags>(() => {
    try {
      return profile.fingerprint_flags ? JSON.parse(profile.fingerprint_flags) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    api.getInstalledBrowserVersions().then(setInstalledVersions);
    api.getProxies().then(setSavedProxies);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      await onSave(profile.id, {
        name: name.trim(),
        group_name: groupName || undefined,
        proxy_type: proxyType || undefined,
        proxy_host: proxyHost || undefined,
        proxy_port: proxyPort ? parseInt(proxyPort, 10) : undefined,
        proxy_user: proxyUser || undefined,
        proxy_pass: proxyPass || undefined,
        proxy_enabled: proxyEnabled ? 1 : 0,
        notes: notes || undefined,
        startup_type: startupType,
        startup_urls: startupType === 'specific_pages' ? startupUrls : undefined,
        browser_version: browserVersion !== 'system' ? browserVersion : undefined,
        fingerprint_flags: (() => {
          const isCB = installedVersions.some(
            v => v.version === browserVersion && v.channel === 'CloakBrowser'
          );
          if (!isCB) return undefined;
          const nonEmpty = Object.fromEntries(
            Object.entries(fingerprintFlags).filter(([, v]) => v && v.trim())
          );
          return Object.keys(nonEmpty).length > 0 ? JSON.stringify(nonEmpty) : undefined;
        })(),
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('profileForm.editTitle')}</h2>
          <button className="modal-close" onClick={onClose}>
            <XIcon size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>{t('profileForm.nameLabel')}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>{t('profileForm.groupLabel')}</label>
              <select
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              >
                <option value="">{t('profileForm.noGroup')}</option>
                {groups.map(g => (
                  <option key={g.id} value={g.name}>{g.name}</option>
                ))}
              </select>
            </div>

            {/* Browser Version */}
            <div className="form-group">
              <label>{t('profileForm.chromeVersion')}</label>
              <select
                value={browserVersion}
                onChange={(e) => setBrowserVersion(e.target.value)}
              >
                <option value="system">{t('profileForm.systemChrome')}</option>
                {installedVersions.map(v => (
                  <option key={v.version} value={v.version}>{v.version} ({v.channel})</option>
                ))}
              </select>
            </div>

            {/* CloakBrowser Fingerprint Settings */}
            {installedVersions.some(
              v => v.version === browserVersion && v.channel === 'CloakBrowser'
            ) && (
              <FingerprintSettings flags={fingerprintFlags} onChange={setFingerprintFlags} />
            )}

            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {t('profileForm.proxy')}
                </label>
                {profile.status === 'running' && (
                  <span style={{ fontSize: 11, color: 'var(--accent-orange)' }}>
                    (Please close profile to edit)
                  </span>
                )}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: profile.status === 'running' ? 'not-allowed' : 'pointer', fontSize: 12 }}>
                <div
                  onClick={() => {
                    if (profile.status === 'running') return;
                    setProxyEnabled(!proxyEnabled);
                  }}
                  style={{
                    width: 32, height: 18, borderRadius: 9, position: 'relative', 
                    cursor: profile.status === 'running' ? 'not-allowed' : 'pointer',
                    opacity: profile.status === 'running' ? 0.6 : 1,
                    background: proxyEnabled ? '#34a853' : 'var(--border-color)', transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute',
                    top: 2, left: proxyEnabled ? 16 : 2, transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                  }} />
                </div>
                <span style={{ color: proxyEnabled ? '#34a853' : 'var(--text-secondary)', opacity: profile.status === 'running' ? 0.6 : 1 }}>
                  {proxyEnabled ? 'ON' : 'OFF'}
                </span>
              </label>
            </div>

            {proxyEnabled && (
              <div style={{ opacity: profile.status === 'running' ? 0.6 : 1, pointerEvents: profile.status === 'running' ? 'none' : 'auto' }}>
            {/* Proxy Source Toggle */}
            {savedProxies.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button
                  type="button"
                  className={`btn btn-sm ${proxySource === 'list' ? 'btn-primary' : ''}`}
                  onClick={() => setProxySource('list')}
                >
                  {t('profileForm.fromList')}
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${proxySource === 'custom' ? 'btn-primary' : ''}`}
                  onClick={() => setProxySource('custom')}
                >
                  {t('profileForm.customProxy')}
                </button>
              </div>
            )}

            {proxySource === 'list' && savedProxies.length > 0 ? (
              <div className="form-group" style={{ marginBottom: 12 }}>
                <select
                  onChange={(e) => {
                    const proxy = savedProxies.find(p => p.id === e.target.value);
                    if (proxy) {
                      setProxyType(proxy.type);
                      setProxyHost(proxy.host);
                      setProxyPort(proxy.port.toString());
                      setProxyUser(proxy.username || '');
                      setProxyPass(proxy.password || '');
                    }
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>{t('profileForm.selectProxy')}</option>
                  {savedProxies.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.type.toUpperCase()} {p.host}:{p.port})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
            <div className="form-row">
              <div className="form-group" style={{ maxWidth: 120 }}>
                <label>{t('profileForm.type')}</label>
                <select value={proxyType} onChange={(e) => setProxyType(e.target.value)}>
                  <option value="">{t('profileForm.none')}</option>
                  <option value="http">HTTP</option>
                  <option value="socks4">SOCKS4</option>
                  <option value="socks5">SOCKS5</option>
                </select>
              </div>
              <div className="form-group">
                <label>{t('profileForm.host')}</label>
                <input type="text" value={proxyHost} onChange={(e) => setProxyHost(e.target.value)} />
              </div>
              <div className="form-group" style={{ maxWidth: 100 }}>
                <label>{t('profileForm.port')}</label>
                <input type="text" value={proxyPort} onChange={(e) => setProxyPort(e.target.value)} />
              </div>
            </div>

            {proxyType && (
              <div className="form-row">
                <div className="form-group">
                  <label>{t('profileForm.username')}</label>
                  <input type="text" value={proxyUser} onChange={(e) => setProxyUser(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>{t('profileForm.password')}</label>
                  <input type="password" value={proxyPass} onChange={(e) => setProxyPass(e.target.value)} />
                </div>
              </div>
            )}
              </>
            )}

            {/* Show current proxy info when selected from list */}
            {proxySource === 'list' && proxyHost && (
              <div style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                {proxyType?.toUpperCase()} {proxyHost}:{proxyPort}
                {proxyUser && ` • ${proxyUser}`}
              </div>
            )}
              </div>
            )}

            {/* On Startup section */}
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                {t('profileForm.onStartup')}
              </label>
            </div>
            <div className="radio-group">
              <label className="radio-option">
                <input
                  type="radio"
                  name="editStartupType"
                  value="new_tab"
                  checked={startupType === 'new_tab'}
                  onChange={() => setStartupType('new_tab')}
                />
                <span>{t('profileForm.newTab')}</span>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="editStartupType"
                  value="continue"
                  checked={startupType === 'continue'}
                  onChange={() => setStartupType('continue')}
                />
                <span>{t('profileForm.continue')}</span>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="editStartupType"
                  value="specific_pages"
                  checked={startupType === 'specific_pages'}
                  onChange={() => setStartupType('specific_pages')}
                />
                <span>{t('profileForm.specificPages')}</span>
              </label>
            </div>

            {startupType === 'specific_pages' && (
              <div className="form-group" style={{ marginTop: 8 }}>
                <label>{t('profileForm.urlsLabel')}</label>
                <textarea
                  value={startupUrls}
                  onChange={(e) => setStartupUrls(e.target.value)}
                  placeholder={'https://google.com\nhttps://facebook.com'}
                  rows={3}
                />
              </div>
            )}

            <div className="form-group">
              <label>{t('profileForm.notes')}</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            {/* Profile Info */}
            <div style={{ padding: '12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: 11, color: 'var(--text-muted)' }}>
              <div>{t('profileForm.id')}: {profile.id}</div>
              <div>{t('profileForm.dataDir')}: {profile.user_data_dir}</div>
              <div>{t('profileForm.created')}: {new Date(profile.created_at + 'Z').toLocaleString()}</div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose}>
              {t('profileForm.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !name.trim()}>
              {submitting ? t('profileForm.saving') : t('profileForm.saveChanges')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
