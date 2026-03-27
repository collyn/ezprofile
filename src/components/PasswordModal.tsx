import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface PasswordModalProps {
  mode: 'set' | 'verify' | 'remove';
  profileName: string;
  onConfirm: (password: string) => Promise<void>;
  onClose: () => void;
}

export default function PasswordModal({ mode, profileName, onConfirm, onClose }: PasswordModalProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const title = mode === 'set'
    ? t('passwordModal.setTitle')
    : mode === 'remove'
      ? t('passwordModal.removeTitle')
      : t('passwordModal.verifyTitle');

  const submitLabel = mode === 'set'
    ? t('passwordModal.set')
    : mode === 'remove'
      ? t('passwordModal.remove')
      : t('passwordModal.verify');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'set') {
      if (password.length < 4) {
        setError(t('passwordModal.minLength'));
        return;
      }
      if (password !== confirmPassword) {
        setError(t('passwordModal.mismatch'));
        return;
      }
    }

    setSubmitting(true);
    try {
      await onConfirm(password);
    } catch (err: any) {
      setError(err.message || t('passwordModal.wrongPassword'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal password-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <strong>{profileName}</strong>
              </span>
            </div>

            {mode !== 'set' && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                {t('passwordModal.enterPassword')}
              </div>
            )}

            <div className="form-group">
              <label>{mode === 'set' ? t('passwordModal.newPassword') : t('passwordModal.passwordLabel')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                placeholder="••••••"
                required
              />
            </div>

            {mode === 'set' && (
              <div className="form-group">
                <label>{t('passwordModal.confirmPassword')}</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••"
                  required
                />
              </div>
            )}

            {error && (
              <div style={{
                color: '#ef4444',
                fontSize: 12,
                padding: '8px 12px',
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: 'var(--radius-md)',
                marginTop: 8,
              }}>
                {error}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose}>
              {t('passwordModal.cancel')}
            </button>
            <button
              type="submit"
              className={`btn ${mode === 'remove' ? 'btn-danger' : 'btn-primary'}`}
              disabled={submitting || !password}
            >
              {submitting ? '...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
