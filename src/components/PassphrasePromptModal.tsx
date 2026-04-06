import React, { useState, useEffect } from 'react';
import { getAPI } from '../api';
import { XIcon, AlertTriangleIcon } from './Icons';

interface PassphrasePromptModalProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function PassphrasePromptModal({ onComplete, onCancel }: PassphrasePromptModalProps) {
  const [passphrase, setPassphrase] = useState('');
  const [hint, setHint] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const settings = await getAPI().syncGetSettings();
      if (settings?.passphraseHint) {
        setHint(settings.passphraseHint);
      }
    })();
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!passphrase.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await getAPI().syncSetPassphrase(passphrase);
      if (res.success) {
        onComplete();
      } else {
        setError(res.error || 'Failed to set passphrase');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999
    }}>
      <div style={{
        background: 'var(--surface-color)', width: 400, borderRadius: 12,
        boxShadow: '0 12px 32px rgba(0,0,0,0.3)', overflow: 'hidden',
        border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column'
      }}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Decryption Required</h3>
          <button onClick={onCancel} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-secondary)', padding: 4
          }}>
            <XIcon size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 20 }}>
          <p style={{ margin: '0 0 16px 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            To protect your data, profiles are encrypted on the cloud. 
            Please enter your encryption passphrase for this session to continue.
          </p>

          {hint && (
            <div style={{
              background: 'rgba(66,133,244,0.1)', borderLeft: '4px solid #4285f4',
              padding: '8px 12px', fontSize: 13, borderRadius: '0 6px 6px 0',
              marginBottom: 16, color: 'var(--text-primary)'
            }}>
              <strong>Hint:</strong> <em>{hint}</em>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Encryption passphrase..."
              style={{ width: '100%', padding: '10px 12px', fontSize: 13 }}
              autoFocus
            />
          </div>

          {error && (
            <div style={{ color: '#ea4335', fontSize: 13, marginBottom: 16, display: 'flex', gap: 6 }}>
              <AlertTriangleIcon size={16} />
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn btn-sm btn-outline" onClick={onCancel} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-sm btn-primary" disabled={loading || !passphrase}>
              {loading ? 'Unlocking...' : 'Unlock & Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
