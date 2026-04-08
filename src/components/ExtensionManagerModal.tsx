import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ExtensionData } from '../types';
import { getAPI } from '../api';
import { useDialog } from '../contexts/DialogContext';
import {
  PuzzleIcon, TrashIcon, EditIcon, XIcon, UploadIcon,
  DownloadIcon, RefreshCwIcon, CheckCircleIcon, GlobeIcon,
  SpinnerIcon,
} from './Icons';

const api = getAPI();

interface ExtensionManagerModalProps {
  onClose: () => void;
}

export default function ExtensionManagerModal({ onClose }: ExtensionManagerModalProps) {
  const { t } = useTranslation();
  const dialog = useDialog();
  const [extensions, setExtensions] = useState<ExtensionData[]>([]);
  const [storeUrl, setStoreUrl] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [iconCache, setIconCache] = useState<Record<string, string>>({});
  const [updateStatus, setUpdateStatus] = useState<Record<string, { checking?: boolean; updating?: boolean; hasUpdate?: boolean; storeVersion?: string; error?: string }>>({});

  useEffect(() => {
    loadExtensions();
  }, []);

  const loadExtensions = async () => {
    try {
      const data = await api.getExtensions();
      setExtensions(data);
      for (const ext of data) {
        if (ext.icon_path && !iconCache[ext.id]) {
          loadIcon(ext.id, ext.icon_path);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadIcon = async (id: string, iconPath: string) => {
    try {
      const dataUrl = await api.getExtensionIcon(iconPath);
      if (dataUrl) {
        setIconCache(prev => ({ ...prev, [id]: dataUrl }));
      }
    } catch { /* ignore */ }
  };

  const handleDownloadFromStore = async () => {
    if (!storeUrl.trim()) return;
    setDownloading(true);
    try {
      const result = await api.downloadExtensionFromStore(storeUrl.trim());
      if (result.success && result.extension) {
        setExtensions(prev => [result.extension!, ...prev]);
        setStoreUrl('');
        if (result.extension!.icon_path) {
          loadIcon(result.extension!.id, result.extension!.icon_path);
        }
      } else if (result.error) {
        dialog.alert(`${t('extensionManager.downloadError')}: ${result.error}`);
      }
    } catch (err: any) {
      dialog.alert(`${t('extensionManager.downloadError')}: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };

  const handleUploadFile = async () => {
    setUploading(true);
    try {
      const result = await api.uploadExtension();
      if (result.success && result.extension) {
        setExtensions(prev => [result.extension!, ...prev]);
        if (result.extension!.icon_path) {
          loadIcon(result.extension!.id, result.extension!.icon_path);
        }
      } else if (result.error) {
        dialog.alert(`${t('extensionManager.uploadError')}: ${result.error}`);
      }
    } catch (err: any) {
      dialog.alert(`${t('extensionManager.uploadError')}: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (ext: ExtensionData) => {
    const confirmed = await dialog.confirm(
      t('extensionManager.deleteConfirm', { name: ext.name })
    );
    if (!confirmed) return;
    try {
      await api.deleteExtension(ext.id);
      setExtensions(prev => prev.filter(e => e.id !== ext.id));
    } catch (err: any) {
      dialog.alert(err.message);
    }
  };

  const handleStartEdit = (ext: ExtensionData) => {
    setEditingId(ext.id);
    setEditName(ext.name);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    try {
      const updated = await api.updateExtension(editingId, { name: editName.trim() });
      setExtensions(prev => prev.map(e => e.id === editingId ? { ...e, ...updated } : e));
      setEditingId(null);
      setEditName('');
    } catch (err: any) {
      dialog.alert(err.message);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const handleCheckUpdate = async (ext: ExtensionData) => {
    if (!ext.ext_id) return;
    setUpdateStatus(prev => ({ ...prev, [ext.id]: { checking: true } }));
    try {
      const result = await api.checkExtensionUpdate(ext.id);
      if (result.success) {
        setUpdateStatus(prev => ({
          ...prev,
          [ext.id]: { hasUpdate: result.has_update, storeVersion: result.store_version }
        }));
        if (!result.has_update) {
          setExtensions(prev => prev.map(e => e.id === ext.id ? { ...e, store_version: result.store_version || e.store_version } : e));
        }
      } else {
        setUpdateStatus(prev => ({ ...prev, [ext.id]: { error: result.error } }));
      }
    } catch (err: any) {
      setUpdateStatus(prev => ({ ...prev, [ext.id]: { error: err.message } }));
    }
  };

  const handlePerformUpdate = async (ext: ExtensionData) => {
    setUpdateStatus(prev => ({ ...prev, [ext.id]: { updating: true } }));
    try {
      const result = await api.performExtensionUpdate(ext.id);
      if (result.success && result.extension) {
        setExtensions(prev => prev.map(e => e.id === ext.id ? result.extension! : e));
        setUpdateStatus(prev => ({ ...prev, [ext.id]: {} }));
        if (result.extension!.icon_path) {
          loadIcon(result.extension!.id, result.extension!.icon_path);
        }
      } else {
        setUpdateStatus(prev => ({ ...prev, [ext.id]: { error: result.error } }));
      }
    } catch (err: any) {
      setUpdateStatus(prev => ({ ...prev, [ext.id]: { error: err.message } }));
    }
  };

  const handleCheckAllUpdates = async () => {
    const storeExts = extensions.filter(e => e.ext_id);
    for (const ext of storeExts) {
      await handleCheckUpdate(ext);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 640 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PuzzleIcon size={18} />
            {t('extensionManager.title')}
          </h2>
          <button className="modal-close" onClick={onClose}>
            <XIcon size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: 'calc(85vh - 130px)', overflowY: 'auto' }}>
          {/* Download from Chrome Web Store */}
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <GlobeIcon size={12} />
              {t('extensionManager.chromeStoreUrl')}
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={storeUrl}
                onChange={e => setStoreUrl(e.target.value)}
                placeholder={t('extensionManager.storeUrlPlaceholder')}
                style={{ flex: 1 }}
                onKeyDown={e => e.key === 'Enter' && handleDownloadFromStore()}
                disabled={downloading}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={handleDownloadFromStore}
                disabled={downloading || !storeUrl.trim()}
                style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {downloading ? <SpinnerIcon size={12} /> : <DownloadIcon size={12} />}
                {downloading ? t('extensionManager.downloading') : t('extensionManager.download')}
              </button>
            </div>
          </div>

          {/* Upload + Check all */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              className="btn btn-outline btn-sm"
              onClick={handleUploadFile}
              disabled={uploading}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {uploading ? <SpinnerIcon size={12} /> : <UploadIcon size={12} />}
              {t('extensionManager.uploadFile')}
            </button>
            {extensions.some(e => e.ext_id) && (
              <button
                className="btn btn-outline btn-sm"
                onClick={handleCheckAllUpdates}
                style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}
              >
                <RefreshCwIcon size={12} />
                {t('extensionManager.checkAllUpdates')}
              </button>
            )}
          </div>

          {/* List header */}
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>
            {t('extensionManager.listTitle', { count: extensions.length })}
          </label>

          {/* Extension list */}
          {extensions.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '32px 20px', color: 'var(--text-muted)',
              background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)', fontSize: 13,
            }}>
              <PuzzleIcon size={28} style={{ opacity: 0.3, marginBottom: 8, display: 'inline-block' }} />
              <div>{t('extensionManager.emptyList')}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {extensions.map(ext => {
                const status = updateStatus[ext.id] || {};
                const isEditing = editingId === ext.id;

                return (
                  <div
                    key={ext.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px', borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
                      transition: 'border-color 0.15s',
                    }}
                  >
                    {/* Icon */}
                    <div style={{
                      width: 36, height: 36, borderRadius: 'var(--radius-md)', overflow: 'hidden',
                      background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {iconCache[ext.id] ? (
                        <img src={iconCache[ext.id]} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
                      ) : (
                        <PuzzleIcon size={16} style={{ opacity: 0.4 }} />
                      )}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            type="text"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveEdit();
                              if (e.key === 'Escape') handleCancelEdit();
                            }}
                            style={{ fontSize: 13, padding: '4px 8px', height: 28, flex: 1 }}
                            autoFocus
                          />
                          <button className="btn btn-primary btn-sm" onClick={handleSaveEdit} style={{ padding: '2px 10px', height: 28 }}>
                            {t('extensionManager.save')}
                          </button>
                          <button className="btn btn-outline btn-sm" onClick={handleCancelEdit} style={{ padding: '2px 8px', height: 28 }}>
                            <XIcon size={12} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ext.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                            {ext.version && <span>v{ext.version}</span>}
                            {ext.ext_id && (
                              <span style={{ opacity: 0.7 }}>
                                {ext.source_url ? '• Chrome Web Store' : `• ${ext.ext_id.substring(0, 8)}...`}
                              </span>
                            )}
                            <span style={{ opacity: 0.7 }}>
                              • {t('extensionManager.profileCount', { count: ext.profile_count })}
                            </span>
                          </div>
                        </>
                      )}

                      {/* Update status */}
                      {status.hasUpdate && (
                        <div style={{ fontSize: 11, color: '#f0b429', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {t('extensionManager.updateAvailable', { version: status.storeVersion })}
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handlePerformUpdate(ext)}
                            disabled={status.updating}
                            style={{ padding: '1px 8px', height: 22, fontSize: 11 }}
                          >
                            {status.updating ? <SpinnerIcon size={10} /> : t('extensionManager.updateBtn')}
                          </button>
                        </div>
                      )}
                      {status.error && (
                        <div style={{ fontSize: 11, color: 'var(--accent-red)', marginTop: 3 }}>
                          {status.error}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                      {ext.ext_id && (
                        <button
                          className="action-btn"
                          onClick={() => handleCheckUpdate(ext)}
                          disabled={status.checking || status.updating}
                          title={t('extensionManager.checkUpdate')}
                        >
                          {status.checking ? <SpinnerIcon size={14} /> : (
                            status.hasUpdate === false ? <CheckCircleIcon size={14} style={{ color: 'var(--accent-green)' }} /> : <RefreshCwIcon size={14} />
                          )}
                        </button>
                      )}
                      <button
                        className="action-btn"
                        onClick={() => handleStartEdit(ext)}
                        title={t('extensionManager.edit')}
                      >
                        <EditIcon size={14} />
                      </button>
                      <button
                        className="action-btn"
                        onClick={() => handleDelete(ext)}
                        title={t('extensionManager.deleteTooltip')}
                        style={{ color: 'var(--accent-red)' }}
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

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>
            {t('extensionManager.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
