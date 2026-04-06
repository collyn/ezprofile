import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ProxyData } from '../types';
import { getAPI } from '../api';
import { useDialog } from '../contexts/DialogContext';
import { CheckCircleIcon, XCircleIcon, TrashIcon, EditIcon, DownloadIcon, ClipboardIcon, XIcon } from './Icons';

const api = getAPI();

interface ProxyManagerModalProps {
  onClose: () => void;
}

export default function ProxyManagerModal({ onClose }: ProxyManagerModalProps) {
  const { t } = useTranslation();
  const dialog = useDialog();
  const [proxies, setProxies] = useState<ProxyData[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState('http');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [checkResults, setCheckResults] = useState<Record<string, { status: string; info?: string }>>({});
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProxies();
  }, []);

  const loadProxies = async () => {
    try {
      const data = await api.getProxies();
      setProxies(data);
    } catch (err) {
      console.error(err);
    }
  };

  const resetForm = () => {
    setName('');
    setType('http');
    setHost('');
    setPort('');
    setUsername('');
    setPassword('');
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !host.trim() || !port.trim()) return;

    setSubmitting(true);
    try {
      const data = {
        name: name.trim(),
        type,
        host: host.trim(),
        port: parseInt(port, 10),
        username: username.trim() || undefined,
        password: password.trim() || undefined,
      };

      if (editingId) {
        await api.updateProxy(editingId, data);
      } else {
        await api.createProxy(data);
      }
      resetForm();
      await loadProxies();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (proxy: ProxyData) => {
    setEditingId(proxy.id);
    setName(proxy.name);
    setType(proxy.type);
    setHost(proxy.host);
    setPort(proxy.port.toString());
    setUsername(proxy.username || '');
    setPassword(proxy.password || '');
  };

  const handleDelete = async (id: string) => {
    const proxyName = proxies.find(p => p.id === id)?.name || 'Unknown Proxy';
    const isConfirmed = await dialog.confirm(t('proxyManager.deleteConfirm', { name: proxyName }));
    if (!isConfirmed) return;
    try {
      await api.deleteProxy(id);
      await loadProxies();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCheck = async (proxy: ProxyData) => {
    setCheckResults(prev => ({ ...prev, [proxy.id]: { status: 'checking' } }));
    try {
      const result = await api.checkProxy(
        proxy.type,
        proxy.host,
        proxy.port,
        proxy.username || undefined,
        proxy.password || undefined,
      );
      if (result.success) {
        setCheckResults(prev => ({ ...prev, [proxy.id]: { status: 'live', info: `IP: ${result.ip}` } }));
      } else {
        setCheckResults(prev => ({ ...prev, [proxy.id]: { status: 'error', info: result.error } }));
      }
    } catch {
      setCheckResults(prev => ({ ...prev, [proxy.id]: { status: 'error', info: 'Check failed' } }));
    }
  };

  // Parse proxy lines: supports type://host:port:user:pass, host:port:user:pass, host:port, user:pass@host:port
  const parseProxyLines = (text: string) => {
    const lines = text.split(/\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    const results: { type: string; host: string; port: number; username?: string; password?: string }[] = [];

    for (const line of lines) {
      let parsed = line;
      let proxyType = 'http';

      // Extract protocol prefix
      const protoMatch = parsed.match(/^(https?|socks[45]):\/\//i);
      if (protoMatch) {
        proxyType = protoMatch[1].toLowerCase().replace('https', 'http');
        parsed = parsed.slice(protoMatch[0].length);
      }

      // Split by @: user:pass@host:port
      const atSplit = parsed.split('@');
      let hostPort: string;
      let userPass: string | undefined;

      if (atSplit.length === 2) {
        userPass = atSplit[0];
        hostPort = atSplit[1];
      } else {
        hostPort = parsed;
      }

      const parts = hostPort.split(':');
      if (parts.length < 2) continue;

      const host = parts[0];
      const port = parseInt(parts[1], 10);
      if (!host || isNaN(port)) continue;

      let username: string | undefined;
      let password: string | undefined;

      if (userPass) {
        const upParts = userPass.split(':');
        username = upParts[0] || undefined;
        password = upParts.slice(1).join(':') || undefined;
      } else if (parts.length >= 4) {
        username = parts[2] || undefined;
        password = parts.slice(3).join(':') || undefined;
      }

      results.push({ type: proxyType, host, port, username, password });
    }
    return results;
  };

  const handleImport = async () => {
    const parsed = parseProxyLines(importText);
    if (parsed.length === 0) return;

    setImporting(true);
    try {
      const existingCount = proxies.length;
      for (let i = 0; i < parsed.length; i++) {
        const p = parsed[i];
        await api.createProxy({
          name: `Proxy ${existingCount + i + 1}`,
          type: p.type,
          host: p.host,
          port: p.port,
          username: p.username,
          password: p.password,
        });
      }
      setImportText('');
      setShowImport(false);
      await loadProxies();
    } catch (err) {
      console.error(err);
    } finally {
      setImporting(false);
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setImportText(text);
      setShowImport(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 600 }}>
        <div className="modal-header">
          <h2>{t('proxyManager.title')}</h2>
          <button className="modal-close" onClick={onClose}>
            <XIcon size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: '20px 20px 0' }}>
          {/* Add/Edit form */}
          <form onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>
              {editingId ? t('proxyManager.editProxy') : t('proxyManager.addNew')}
            </label>
            <div className="form-row" style={{ gap: 8 }}>
              <div className="form-group" style={{ flex: 2 }}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('proxyManager.namePlaceholder')}
                  required
                />
              </div>
              <div className="form-group" style={{ maxWidth: 100 }}>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="http">HTTP</option>
                  <option value="socks4">SOCKS4</option>
                  <option value="socks5">SOCKS5</option>
                </select>
              </div>
            </div>
            <div className="form-row" style={{ gap: 8 }}>
              <div className="form-group" style={{ flex: 2 }}>
                <input
                  type="text"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder={t('proxyManager.hostPlaceholder')}
                  required
                />
              </div>
              <div className="form-group" style={{ maxWidth: 80 }}>
                <input
                  type="text"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder={t('proxyManager.portPlaceholder')}
                  required
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('proxyManager.userOptional')}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('proxyManager.passOptional')}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={submitting || !name.trim() || !host.trim() || !port.trim()}
              >
                {editingId ? t('proxyManager.update') : t('proxyManager.add')}
              </button>
              {editingId && (
                <button type="button" className="btn btn-sm" onClick={resetForm}>
                  {t('proxyManager.cancelEdit')}
                </button>
              )}
            </div>
          </form>

          {/* Import section */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              type="button"
              className={`btn btn-outline btn-sm`}
              onClick={() => setShowImport(!showImport)}
            >
              <ClipboardIcon size={14} />
              {t('proxyManager.importFromClipboard')}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <DownloadIcon size={14} />
              {t('proxyManager.importFromFile')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.csv"
              style={{ display: 'none' }}
              onChange={handleFileImport}
            />
          </div>

          {showImport && (
            <div style={{ marginBottom: 16, padding: '12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
                {t('proxyManager.importHint')}
              </label>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={`host:port\nhost:port:username:password\nsocks5://host:port:user:pass\nuser:pass@host:port`}
                  rows={5}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={importing || !importText.trim()}
                  onClick={handleImport}
                >
                  {importing ? t('proxyManager.importing') : t('proxyManager.importBtn', { count: parseProxyLines(importText).length })}
                </button>
                <button type="button" className="btn btn-sm" onClick={() => { setShowImport(false); setImportText(''); }}>
                  {t('proxyManager.cancelEdit')}
                </button>
                {importText.trim() && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {t('proxyManager.parsedCount', { count: parseProxyLines(importText).length })}
                  </span>
                )}
              </div>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--border-color)', margin: '0 -20px' }}></div>

          {/* Proxy list */}
          <div style={{ padding: '16px 0', maxHeight: 350, overflowY: 'auto' }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>
              {t('proxyManager.listTitle', { count: proxies.length })}
            </label>

            {proxies.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                {t('proxyManager.emptyList')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {proxies.map(proxy => {
                  const checkResult = checkResults[proxy.id];
                  return (
                    <div
                      key={proxy.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{proxy.name}</span>
                          <span style={{
                            fontSize: 10,
                            padding: '1px 6px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-muted)',
                            textTransform: 'uppercase',
                            fontWeight: 600,
                          }}>
                            {proxy.type}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {proxy.host}:{proxy.port}
                          {proxy.username && ` • ${proxy.username}`}
                        </div>
                        {checkResult && (
                          <div style={{
                            fontSize: 11,
                            marginTop: 3,
                            color: checkResult.status === 'live' ? '#34a853'
                              : checkResult.status === 'checking' ? 'var(--text-muted)'
                              : '#ea4335',
                          }}>
                            {checkResult.status === 'checking' && t('proxyManager.checking')}
                            {checkResult.status === 'live' && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircleIcon size={14} /> Live! {checkResult.info}</span>}
                            {checkResult.status === 'error' && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><XCircleIcon size={14} /> {checkResult.info}</span>}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button
                          className="btn btn-icon"
                          style={{ width: 28, height: 28, color: 'var(--text-secondary)' }}
                          onClick={() => handleCheck(proxy)}
                          title={t('proxyManager.checkProxy')}
                        >
                          <CheckCircleIcon size={14} />
                        </button>
                        <button
                          className="btn btn-icon"
                          style={{ width: 28, height: 28, color: 'var(--accent-blue)' }}
                          onClick={() => handleEdit(proxy)}
                          title={t('proxyManager.edit')}
                        >
                          <EditIcon size={14} />
                        </button>
                        <button
                          className="btn btn-icon"
                          style={{ width: 28, height: 28, color: 'var(--accent-red)' }}
                          onClick={() => handleDelete(proxy.id)}
                          title={t('proxyManager.deleteTooltip')}
                        >
                          <TrashIcon size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer" style={{ padding: '12px 20px' }}>
          <button type="button" className="btn" onClick={onClose}>
            {t('proxyManager.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
