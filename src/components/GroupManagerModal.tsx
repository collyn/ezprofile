import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GroupData } from '../types';
import { getAPI } from '../api';

interface GroupManagerModalProps {
  groups: GroupData[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

const PRESET_COLORS = [
  '#4a9eff', // Blue
  '#34d399', // Green
  '#f87171', // Red
  '#fbbf24', // Yellow
  '#a78bfa', // Purple
  '#fb923c', // Orange
  '#ec4899', // Pink
  '#9ca3af', // Gray
];

export default function GroupManagerModal({ groups, onClose, onRefresh }: GroupManagerModalProps) {
  const { t } = useTranslation();
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState(PRESET_COLORS[0]);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    setSubmitting(true);
    try {
      await getAPI().createGroup(newGroupName.trim(), newGroupColor);
      setNewGroupName('');
      await onRefresh();
    } catch (err) {
      console.error(err);
      alert(t('groupManager.createFail'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(t('groupManager.deleteConfirm', { name }))) {
      return;
    }
    try {
      await getAPI().deleteGroup(id);
      await onRefresh();
    } catch (err) {
      console.error(err);
      alert(t('groupManager.deleteFail'));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 440 }}>
        <div className="modal-header">
          <h2>{t('groupManager.title')}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="modal-body" style={{ padding: '20px 20px 0' }}>
          <form onSubmit={handleCreate} className="form-group" style={{ marginBottom: 24 }}>
            <label>{t('groupManager.createNew')}</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder={t('groupManager.namePlaceholder')}
                style={{ flex: 1 }}
              />
              <input
                type="color"
                value={newGroupColor}
                onChange={(e) => setNewGroupColor(e.target.value)}
                style={{
                  width: 34,
                  height: 34,
                  padding: 0,
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  background: 'none'
                }}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting || !newGroupName.trim()}
                style={{ height: 34 }}
              >
                {t('groupManager.add')}
              </button>
            </div>
            {/* Color Presets */}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {PRESET_COLORS.map(color => (
                <div
                  key={color}
                  onClick={() => setNewGroupColor(color)}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    backgroundColor: color,
                    cursor: 'pointer',
                    border: newGroupColor === color ? '2px solid white' : '2px solid transparent',
                    boxShadow: newGroupColor === color ? '0 0 0 1px var(--text-muted)' : 'none'
                  }}
                />
              ))}
            </div>
          </form>

          <div style={{ borderTop: '1px solid var(--border-color)', margin: '0 -20px' }}></div>

          <div style={{ padding: '16px 0', maxHeight: 300, overflowY: 'auto' }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>
              {t('groupManager.listTitle', { count: groups.length })}
            </label>
            
            {groups.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                {t('groupManager.emptyList')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {groups.map(group => (
                  <div
                    key={group.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-color)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          backgroundColor: group.color
                        }}
                      />
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{group.name}</span>
                    </div>
                    <button
                      className="btn btn-icon"
                      style={{ color: 'var(--accent-red)', width: 26, height: 26 }}
                      onClick={() => handleDelete(group.id, group.name)}
                      title={t('groupManager.deleteTooltip')}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer" style={{ padding: '12px 20px' }}>
          <button type="button" className="btn" onClick={onClose}>
            {t('groupManager.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
