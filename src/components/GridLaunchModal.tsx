import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutGridIcon, XIcon } from './Icons';

interface GridLaunchModalProps {
  selectedCount: number;
  onClose: () => void;
  onLaunch: (cols: number, rows: number, padding: number) => void;
}

export default function GridLaunchModal({ selectedCount, onClose, onLaunch }: GridLaunchModalProps) {
  const { t } = useTranslation();
  // Auto-calculate default grid dimensions based on selected count
  const defaultCols = Math.ceil(Math.sqrt(selectedCount));
  const defaultRows = Math.ceil(selectedCount / defaultCols);

  const [cols, setCols] = useState<number>(defaultCols);
  const [rows, setRows] = useState<number>(defaultRows);
  const [padding, setPadding] = useState<number>(() => {
    const saved = localStorage.getItem('gridLaunch.padding');
    return saved !== null ? parseInt(saved, 10) : 16;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cols > 0 && rows > 0) {
      localStorage.setItem('gridLaunch.padding', padding.toString());
      onLaunch(cols, rows, padding);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h2>
            <LayoutGridIcon size={20} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />
            {t('profiles.gridLaunch.title', 'Grid Launch')}
          </h2>
          <button className="icon-btn" onClick={onClose}><XIcon /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p style={{ marginBottom: 15, fontSize: 13, color: 'var(--text-secondary)' }}>
              {t('profiles.gridLaunch.description', 'Launch {{count}} selected profiles in a grid layout across your screen.', { count: selectedCount })}
            </p>
            
            <div className="form-row" style={{ display: 'flex', gap: 15 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>{t('profiles.gridLaunch.columns', 'Columns')}</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={cols}
                  onChange={(e) => setCols(parseInt(e.target.value) || 1)}
                  className="form-control"
                  required
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>{t('profiles.gridLaunch.rows', 'Rows')}</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={rows}
                  onChange={(e) => setRows(parseInt(e.target.value) || 1)}
                  className="form-control"
                  required
                />
              </div>
            </div>

            <div className="form-group" style={{ marginTop: 15 }}>
              <label>Border Overlap Adjustment (px)
                <span style={{ fontWeight: 'normal', color: 'var(--text-secondary)', marginLeft: 8 }}>
                  (Increase this if the OS leaves invisible gaps between windows)
                </span>
              </label>
              <input
                type="number"
                value={padding}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setPadding(isNaN(val) ? 0 : val);
                }}
                className="form-control"
              />
            </div>

            <div style={{ marginTop: 15, padding: 10, background: 'var(--bg-secondary)', borderRadius: 4, textAlign: 'center', fontSize: 13 }}>
              {t('profiles.gridLaunch.preview', 'Grid capacity: {{capacity}} windows', { capacity: cols * rows })}
              {cols * rows < selectedCount && (
                <div style={{ color: 'var(--danger-color)', marginTop: 5 }}>
                  {t('profiles.gridLaunch.warning', 'Warning: Grid capacity is less than selected profiles.')}
                </div>
              )}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              {t('common.cancel', 'Cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={cols * rows < selectedCount}>
              {t('profiles.gridLaunch.launch', 'Launch')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
