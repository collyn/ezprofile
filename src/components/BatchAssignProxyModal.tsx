import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getAPI } from '../api';
import { ProxyData } from '../types';
import { useDialog } from '../contexts/DialogContext';
import { XIcon } from './Icons';
import { countryCodeToFlag } from './CountryFlag';

interface BatchAssignProxyModalProps {
  selectedCount: number;
  onClose: () => void;
  onSave: (proxyData: {
    proxy_type: string | null;
    proxy_host: string | null;
    proxy_port: number | null;
    proxy_user: string | null;
    proxy_pass: string | null;
  }) => Promise<void>;
}

export default function BatchAssignProxyModal({
  selectedCount,
  onClose,
  onSave,
}: BatchAssignProxyModalProps) {
  const { t } = useTranslation();
  const dialog = useDialog();
  const [proxyType, setProxyType] = useState('');
  const [proxyHost, setProxyHost] = useState('');
  const [proxyPort, setProxyPort] = useState('');
  const [proxyUser, setProxyUser] = useState('');
  const [proxyPass, setProxyPass] = useState('');
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{ success: boolean; msg: string; lat?: number } | null>(null);
  const [savedProxies, setSavedProxies] = useState<ProxyData[]>([]);
  const [proxySource, setProxySource] = useState<'custom' | 'list'>('list');
  const [selectedProxyId, setSelectedProxyId] = useState('');

  useEffect(() => {
    getAPI().getProxies().then((data) => {
      setSavedProxies(data);
      // If no proxies saved, default to custom input
      if (data.length === 0) setProxySource('custom');
    });
  }, []);

  const handleSelectProxy = (proxyId: string) => {
    setSelectedProxyId(proxyId);
    const proxy = savedProxies.find(p => p.id === proxyId);
    if (proxy) {
      setProxyType(proxy.type);
      setProxyHost(proxy.host);
      setProxyPort(proxy.port.toString());
      setProxyUser(proxy.username || '');
      setProxyPass(proxy.password || '');
      setCheckResult(null);
    }
  };

  const handleCheckProxy = async () => {
    if (!proxyType || !proxyHost || !proxyPort) return;
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await getAPI().checkProxy(proxyType, proxyHost, parseInt(proxyPort), proxyUser, proxyPass);
      if (res.success) {
        setCheckResult({ success: true, msg: t('batchProxy.live', { ip: res.ip }), lat: res.latency });
      } else {
        setCheckResult({ success: false, msg: res.error || t('batchProxy.proxyError') });
      }
    } catch (err: any) {
      setCheckResult({ success: false, msg: err.message || t('batchProxy.checkFailed') });
    } finally {
      setChecking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (!proxyType) {
        // Clear proxy
        await onSave({
          proxy_type: null,
          proxy_host: null,
          proxy_port: null,
          proxy_user: null,
          proxy_pass: null
        });
      } else {
        await onSave({
          proxy_type: proxyType,
          proxy_host: proxyHost,
          proxy_port: parseInt(proxyPort) || null,
          proxy_user: proxyUser || null,
          proxy_pass: proxyPass || null
        });
      }
      onClose();
    } catch (err) {
      console.error(err);
      await dialog.alert(t('batchProxy.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 500 }}>
        <div className="modal-header">
          <h2>{t('batchProxy.title', { count: selectedCount })}</h2>
          <button className="modal-close" onClick={onClose}>
            <XIcon size={16} />
          </button>
        </div>

        <div className="modal-body">
          <form id="batch-proxy-form" onSubmit={handleSubmit}>

            {/* Proxy Source Toggle */}
            {savedProxies.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
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
              <>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label>{t('profileForm.selectProxy')}</label>
                  <select
                    value={selectedProxyId}
                    onChange={(e) => handleSelectProxy(e.target.value)}
                  >
                    <option value="" disabled>{t('profileForm.selectProxy')}</option>
                    {savedProxies.map(p => {
                      const flag = p.country_code ? countryCodeToFlag(p.country_code) + ' ' : '';
                      return (
                        <option key={p.id} value={p.id}>
                          {flag}{p.host}:{p.port} ({p.type.toUpperCase()})
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Show selected proxy details */}
                {selectedProxyId && proxyHost && (
                  <div style={{
                    padding: '10px 14px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    marginBottom: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                    {(() => {
                      const proxy = savedProxies.find(p => p.id === selectedProxyId);
                      if (!proxy) return null;
                      return (
                        <>
                          {proxy.country_code && (
                            <span style={{ fontSize: 16 }}>{countryCodeToFlag(proxy.country_code)}</span>
                          )}
                          <span>
                            <strong>{proxyType.toUpperCase()}</strong> {proxyHost}:{proxyPort}
                            {proxyUser && ` • ${proxyUser}`}
                          </span>
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* Check Proxy button for list-selected proxy */}
                {proxyHost && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, marginBottom: 8 }}>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={handleCheckProxy}
                      disabled={checking || !proxyHost || !proxyPort}
                    >
                      {checking ? t('batchProxy.checking') : t('batchProxy.checkProxy')}
                    </button>
                    
                    {checkResult && (
                      <span style={{ 
                        fontSize: 13, 
                        color: checkResult.success ? 'var(--accent-green)' : 'var(--accent-red)',
                        fontWeight: 500
                      }}>
                        {checkResult.msg}
                        {checkResult.lat && <span style={{ opacity: 0.7, marginLeft: 8 }}>{checkResult.lat}ms</span>}
                      </span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Custom proxy input */}
                <div className="form-group">
                  <label>{t('batchProxy.proxyType')}</label>
                  <select
                    value={proxyType}
                    onChange={(e) => setProxyType(e.target.value)}
                  >
                    <option value="">{t('batchProxy.noProxy')}</option>
                    <option value="http">HTTP</option>
                    <option value="socks4">SOCKS4</option>
                    <option value="socks5">SOCKS5</option>
                  </select>
                </div>

                {proxyType && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 12, marginBottom: 16 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>{t('batchProxy.proxyHost')}</label>
                        <input
                          type="text"
                          value={proxyHost}
                          onChange={(e) => setProxyHost(e.target.value)}
                          placeholder="123.45.67.89"
                          required
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>{t('batchProxy.proxyPort')}</label>
                        <input
                          type="number"
                          value={proxyPort}
                          onChange={(e) => setProxyPort(e.target.value)}
                          placeholder="8080"
                          required
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>{t('batchProxy.proxyUser')}</label>
                        <input
                          type="text"
                          value={proxyUser}
                          onChange={(e) => setProxyUser(e.target.value)}
                          placeholder={t('batchProxy.userOptional')}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>{t('batchProxy.proxyPass')}</label>
                        <input
                          type="password"
                          value={proxyPass}
                          onChange={(e) => setProxyPass(e.target.value)}
                          placeholder={t('batchProxy.passOptional')}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={handleCheckProxy}
                        disabled={checking || !proxyHost || !proxyPort}
                      >
                        {checking ? t('batchProxy.checking') : t('batchProxy.checkProxy')}
                      </button>
                      
                      {checkResult && (
                        <span style={{ 
                          fontSize: 13, 
                          color: checkResult.success ? 'var(--accent-green)' : 'var(--accent-red)',
                          fontWeight: 500
                        }}>
                          {checkResult.msg}
                          {checkResult.lat && <span style={{ opacity: 0.7, marginLeft: 8 }}>{checkResult.lat}ms</span>}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </form>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            {t('batchProxy.cancel')}
          </button>
          <button
            type="submit"
            form="batch-proxy-form"
            className="btn btn-primary"
            disabled={saving || (proxySource === 'list' && !selectedProxyId)}
          >
            {saving ? t('batchProxy.saving') : t('batchProxy.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
