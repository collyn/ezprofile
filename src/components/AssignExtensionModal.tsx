import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ExtensionData } from '../types';
import { getAPI } from '../api';
import { PuzzleIcon, XIcon, SpinnerIcon } from './Icons';

const api = getAPI();

interface AssignExtensionModalProps {
  profileIds: string[];
  onClose: () => void;
  onSaved: () => void;
}

export default function AssignExtensionModal({ profileIds, onClose, onSaved }: AssignExtensionModalProps) {
  const { t } = useTranslation();
  const [extensions, setExtensions] = useState<ExtensionData[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [iconCache, setIconCache] = useState<Record<string, string>>({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const allExts = await api.getExtensions();
      setExtensions(allExts);

      // If single profile, load its current extensions
      if (profileIds.length === 1) {
        const profileExts = await api.getProfileExtensions(profileIds[0]);
        setSelectedIds(new Set(profileExts.map(e => e.id)));
      }

      // Load icons
      for (const ext of allExts) {
        if (ext.icon_path) {
          try {
            const dataUrl = await api.getExtensionIcon(ext.icon_path);
            if (dataUrl) {
              setIconCache(prev => ({ ...prev, [ext.id]: dataUrl }));
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleExtension = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.setProfileExtensions(profileIds, Array.from(selectedIds));
      onSaved();
      onClose();
    } catch (err: any) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PuzzleIcon size={16} />
            {t('extensionManager.assignTitle', { count: profileIds.length })}
          </h2>
          <button className="modal-close" onClick={onClose}>
            <XIcon size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: 'calc(70vh - 130px)', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 30 }}>
              <SpinnerIcon size={20} />
            </div>
          ) : extensions.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '30px 20px', color: 'var(--text-muted)',
              background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)', fontSize: 13,
            }}>
              <PuzzleIcon size={28} style={{ opacity: 0.3, marginBottom: 8, display: 'inline-block' }} />
              <div>{t('extensionManager.noExtensions')}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {extensions.map(ext => (
                <label
                  key={ext.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                    background: selectedIds.has(ext.id) ? 'rgba(74, 158, 255, 0.08)' : 'var(--bg-tertiary)',
                    border: `1px solid ${selectedIds.has(ext.id) ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                    transition: 'all 0.15s',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(ext.id)}
                    onChange={() => toggleExtension(ext.id)}
                    style={{ accentColor: 'var(--accent-blue)' }}
                  />
                  <div style={{
                    width: 28, height: 28, borderRadius: 6, overflow: 'hidden',
                    background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {iconCache[ext.id] ? (
                      <img src={iconCache[ext.id]} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                    ) : (
                      <PuzzleIcon size={14} style={{ opacity: 0.4 }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ext.name}
                    </div>
                    {ext.version && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>v{ext.version}</div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>
            {t('extensionManager.cancel')}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saving ? <SpinnerIcon size={14} /> : t('extensionManager.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
