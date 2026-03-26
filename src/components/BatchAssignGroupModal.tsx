import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GroupData } from '../types';

interface BatchAssignGroupModalProps {
  groups: GroupData[];
  selectedCount: number;
  onClose: () => void;
  onSave: (groupName: string) => Promise<void>;
}

export default function BatchAssignGroupModal({
  groups,
  selectedCount,
  onClose,
  onSave,
}: BatchAssignGroupModalProps) {
  const { t } = useTranslation();
  const [groupName, setGroupName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(groupName);
      onClose();
    } catch (err) {
      console.error(err);
      alert(t('batchGroup.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 400 }}>
        <div className="modal-header">
          <h2>{t('batchGroup.title', { count: selectedCount })}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <form id="batch-group-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label>{t('batchGroup.selectGroup')}</label>
              <select
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              >
                <option value="">{t('batchGroup.noGroup')}</option>
                {groups.map(g => (
                  <option key={g.id} value={g.name}>{g.name}</option>
                ))}
              </select>
            </div>
          </form>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            {t('batchGroup.cancel')}
          </button>
          <button
            type="submit"
            form="batch-group-form"
            className="btn btn-primary"
            disabled={saving}
          >
            {saving ? t('batchGroup.saving') : t('batchGroup.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
