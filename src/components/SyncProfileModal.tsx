import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getAPI } from '../api';
import type { ProfileData, SyncBackupEntry, SyncLogEntry } from '../types';
import { useDialog } from '../contexts/DialogContext';
import { PassphrasePromptModal } from './PassphrasePromptModal';
import { CloudIcon, AlertTriangleIcon, SpinnerIcon, TrashIcon, CheckCircleIcon, XCircleIcon, ArrowDownIcon, UploadIcon } from './Icons';

const api = getAPI();

function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

interface SyncProfileModalProps {
  profile: ProfileData;
  initialTab?: 'upload' | 'restore';
  onClose: () => void;
}

export default function SyncProfileModal({ profile, initialTab = 'upload', onClose }: SyncProfileModalProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'upload' | 'restore' | 'activity'>(initialTab);
  const [backups, setBackups] = useState<SyncBackupEntry[]>([]);
  const [log, setLog] = useState<SyncLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState<'success' | 'error' | null>(null);
  const [hasPassphrase, setHasPassphrase] = useState(false);
  const [showPassphrasePrompt, setShowPassphrasePrompt] = useState(false);
  const [defaultProvider, setDefaultProvider] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState<'default' | 'googledrive' | 's3' | 'all'>('default');
  const [searchQuery, setSearchQuery] = useState('');
  const [progress, setProgress] = useState('');
  const dialog = useDialog();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [settings, passphraseOk, backupList] = await Promise.all([
          api.syncGetSettings(),
          api.syncHasPassphrase(),
          api.syncListBackups(profile.id, 'all'), // fetch all backups
        ]);
        setDefaultProvider(settings.provider);
        setHasPassphrase(passphraseOk);
        setBackups(backupList);
      } catch (err) {
        console.error('Failed to load sync info', err);
      } finally {
        setLoading(false);
      }
    };
    load();

    api.onSyncProgress?.((p) => {
      if (p.profileId === profile.id) {
        setProgress(p.message);
      }
    });
  }, [profile.id]);

  useEffect(() => {
    if (tab === 'activity' && log.length === 0) {
      api.syncGetSyncLog(profile.id).then(syncLog => setLog(syncLog.slice(0, 20)));
    }
  }, [tab, profile.id, log.length]);

  const handleUpload = async () => {
    if (!hasPassphrase) {
        setShowPassphrasePrompt(true);
        return;
    }
    setUploading(true);
    setStatusMsg('');
    setProgress('Starting...');
    
    let target: 'googledrive' | 's3' | 'all' | undefined = undefined;
    if (uploadTarget !== 'default') target = uploadTarget;

    const res = await api.syncUploadProfile(profile.id, true, target);
    setUploading(false);
    setProgress('');
    if (res.success) {
      setStatusMsg('Uploaded successfully');
      setStatusType('success');
      // Refresh list
      const updated = await api.syncListBackups(profile.id, 'all');
      setBackups(updated);
      const updatedLog = await api.syncGetSyncLog(profile.id);
      setLog(updatedLog.slice(0, 20));
    } else {
      setStatusMsg(res.error || 'Upload failed');
      setStatusType('error');
    }
  };

  // Old passphrase retry state
  const [decryptionFailedBackup, setDecryptionFailedBackup] = useState<string | null>(null);
  const [oldPassphraseInput, setOldPassphraseInput] = useState('');
  const [retryingPassphrase, setRetryingPassphrase] = useState(false);

  const handleRestore = async (backup: SyncBackupEntry) => {
    if (!hasPassphrase) {
        setShowPassphrasePrompt(true);
        return;
    }
    const isConfirmed = await dialog.confirm(`Restore profile from backup?\n\nDate: ${formatDate(backup.createdAt)}\nSize: ${formatBytes(backup.sizeBytes)}\n\nThis will REPLACE current profile data.`);
    if (!isConfirmed) return;
    setRestoring(backup.id);
    setStatusMsg('');
    setDecryptionFailedBackup(null);
    setProgress('Starting restore...');
    const res = await api.syncDownloadProfile(profile.id, backup.id);
    setRestoring(null);
    setProgress('');
    if (res.success) {
      setStatusMsg('Profile restored successfully');
      setStatusType('success');
      const updatedLog = await api.syncGetSyncLog(profile.id);
      setLog(updatedLog.slice(0, 20));
    } else if (res.error?.includes('Decryption failed') || res.error?.includes('wrong passphrase')) {
      // Backup was encrypted with a different passphrase
      setDecryptionFailedBackup(backup.id);
      setStatusMsg('');
      setStatusType(null);
    } else {
      setStatusMsg(res.error || 'Restore failed');
      setStatusType('error');
    }
  };

  const handleRetryWithPassphrase = async () => {
    if (!decryptionFailedBackup || !oldPassphraseInput) return;
    setRetryingPassphrase(true);
    setStatusMsg('');
    setProgress('Retrying with passphrase...');
    const res = await api.syncDownloadProfile(profile.id, decryptionFailedBackup, oldPassphraseInput);
    setRetryingPassphrase(false);
    setProgress('');
    if (res.success) {
      setDecryptionFailedBackup(null);
      setOldPassphraseInput('');
      setStatusMsg('Profile restored successfully');
      setStatusType('success');
      const updatedLog = await api.syncGetSyncLog(profile.id);
      setLog(updatedLog.slice(0, 20));
    } else {
      setStatusMsg(res.error || 'Restore failed');
      setStatusType('error');
    }
  };

  const handleDeleteBackup = async (backup: SyncBackupEntry) => {
    const isConfirmed = await dialog.confirm(`Delete this backup?\n${formatDate(backup.createdAt)} — ${formatBytes(backup.sizeBytes)}`);
    if (!isConfirmed) return;
    try {
      await api.syncDeleteBackup(backup.id, backup.provider);
      const updated = await api.syncListBackups(profile.id, 'all');
      setBackups(updated);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.6)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-secondary)', borderRadius: 12,
        border: '1px solid var(--border-color)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #4285f4, #34a853)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, flexShrink: 0, color: 'white',
          }}>
            <CloudIcon size={18} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              Cloud Backup
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {profile.name}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              marginLeft: 'auto', background: 'none', border: 'none',
              color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18, lineHeight: 1,
              padding: '4px',
            }}
          >
            ×
          </button>
        </div>

        {/* Passphrase warning */}
        {!loading && !hasPassphrase && (
          <div style={{
            margin: '12px 20px 0',
            padding: '8px 12px', borderRadius: 6,
            background: 'rgba(251,188,5,0.1)', border: '1px solid rgba(251,188,5,0.3)',
            fontSize: 12, color: '#fbbc05', display: 'flex', gap: 6, alignItems: 'center'
          }}>
            <AlertTriangleIcon size={14} style={{ flexShrink: 0 }} />
            Encryption passphrase not set. Go to Settings → Cloud Sync to set it.
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', padding: '0 20px' }}>
          {(['upload', 'restore', 'activity'] as const).map((tId) => (
            <button
              key={tId}
              onClick={() => setTab(tId)}
              style={{
                padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: tab === tId ? 600 : 400,
                color: tab === tId ? '#4285f4' : 'var(--text-secondary)',
                borderBottom: tab === tId ? '2px solid #4285f4' : '2px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              {tId === 'upload' ? <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><UploadIcon size={14} /> {t('cloudSync.uploadTab')}</span> : 
               tId === 'restore' ? <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><ArrowDownIcon size={14} /> {t('cloudSync.restoreTab')} ({backups.length})</span> : 
               <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{t('cloudSync.activityTab')}</span>}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {/* Upload tab */}
          {tab === 'upload' && (
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 0, marginBottom: 16 }}>
                {t('cloudSync.uploadDesc')}
              </p>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  {t('cloudSync.uploadTarget')}
                </div>
                <select
                  value={uploadTarget}
                  onChange={(e) => setUploadTarget(e.target.value as any)}
                  className="input input-sm"
                  style={{ width: '100%', maxWidth: 200 }}
                  disabled={uploading}
                >
                  <option value="default">{t('cloudSync.optionDefault', { provider: defaultProvider === 's3' ? 'S3' : defaultProvider === 'googledrive' ? 'Google Drive' : t('cloudSync.optionNone') })}</option>
                  {defaultProvider !== 'googledrive' && <option value="googledrive">Google Drive</option>}
                  {defaultProvider !== 's3' && <option value="s3">AWS S3 / Compatible</option>}
                  <option value="all">{t('cloudSync.optionAll')}</option>
                </select>
              </div>

              <button
                className="btn btn-primary btn-sm"
                onClick={handleUpload}
                disabled={uploading || !hasPassphrase}
                style={{
                  background: 'linear-gradient(135deg, #4285f4, #0f9d58)',
                  border: 'none', display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {uploading ? <SpinnerIcon size={14} style={{ flexShrink: 0 }} /> : <UploadIcon size={14} />}
                {uploading ? t('cloudSync.uploading') : t('cloudSync.uploadToCloud')}
              </button>

              {/* Progress */}
              {uploading && progress && (
                <div style={{
                  marginTop: 10, padding: '8px 12px', borderRadius: 6,
                  background: 'rgba(66,133,244,0.08)', border: '1px solid rgba(66,133,244,0.2)',
                  fontSize: 12, color: '#4285f4', display: 'flex', gap: 6, alignItems: 'center',
                }}>
                  <SpinnerIcon /> {progress}
                </div>
              )}

              {/* Status */}
              {statusMsg && !uploading && (
                <StatusBanner msg={statusMsg} type={statusType} />
              )}

            </div>
          )}

          {/* Restore tab */}
          {tab === 'restore' && (
            <div>
              {loading ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', paddingTop: 20 }}>
                  Loading backups...
                </div>
              ) : backups.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '30px 0', color: 'var(--text-secondary)', fontSize: 13,
                }}>
                  <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><CloudIcon size={32} /></div>
                  No backups found in cloud storage.
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 0, marginBottom: 12 }}>
                    Select a backup to restore. This will <strong style={{ color: '#ea4335' }}>replace</strong> the
                    current profile data.
                  </p>
                  
                  {/* Search input for filtering backups */}
                  <div style={{ marginBottom: 12 }}>
                    <input
                      type="text"
                      placeholder="Filter by profile name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: 6,
                        border: '1px solid var(--border-color)', background: 'var(--bg-primary)',
                        color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {backups
                      .filter(b => !searchQuery || b.profileName.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((b) => (
                      <div key={b.id} style={{
                        padding: '10px 12px', borderRadius: 8, background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 10,
                      }}>
                        <ProviderBadge provider={b.provider} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {b.profileName}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {formatDate(b.createdAt)} · {formatBytes(b.sizeBytes)} · {b.provider === 'googledrive' ? 'Google Drive' : 'S3'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-sm"
                            onClick={() => handleRestore(b)}
                            disabled={!hasPassphrase || restoring === b.id}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
                          >
                            {restoring === b.id ? <SpinnerIcon size={14} style={{ flexShrink: 0 }} /> : <ArrowDownIcon size={14} />}
                            {restoring === b.id ? 'Restoring...' : 'Restore'}
                          </button>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => handleDeleteBackup(b)}
                            disabled={!!restoring}
                            style={{ fontSize: 11, color: '#ea4335', borderColor: 'transparent', padding: '4px 8px' }}
                            title="Delete this backup"
                          >
                            <TrashIcon size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Progress */}
              {restoring && progress && (
                <div style={{
                  marginTop: 10, padding: '8px 12px', borderRadius: 6,
                  background: 'rgba(66,133,244,0.08)', border: '1px solid rgba(66,133,244,0.2)',
                  fontSize: 12, color: '#4285f4', display: 'flex', gap: 6, alignItems: 'center',
                }}>
                  <SpinnerIcon /> {progress}
                </div>
              )}

              {/* Decryption failed — ask for old passphrase */}
              {decryptionFailedBackup && !restoring && (
                <div style={{
                  marginTop: 10, padding: 12, borderRadius: 8,
                  background: 'rgba(251,188,5,0.08)', border: '1px solid rgba(251,188,5,0.25)',
                }}>
                  <div style={{ fontSize: 12, color: '#fbbc05', display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                    <AlertTriangleIcon size={14} style={{ flexShrink: 0 }} />
                    This backup was encrypted with a different passphrase.
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    Enter the passphrase used when this backup was created:
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="password"
                      value={oldPassphraseInput}
                      onChange={(e) => setOldPassphraseInput(e.target.value)}
                      placeholder="Old passphrase..."
                      onKeyDown={(e) => e.key === 'Enter' && handleRetryWithPassphrase()}
                      style={{ flex: 1, padding: '6px 10px', fontSize: 12 }}
                      autoFocus
                    />
                    <button
                      className="btn btn-sm"
                      onClick={handleRetryWithPassphrase}
                      disabled={!oldPassphraseInput || retryingPassphrase}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
                    >
                      {retryingPassphrase ? <SpinnerIcon size={12} /> : <ArrowDownIcon size={12} />}
                      {retryingPassphrase ? 'Retrying...' : 'Retry'}
                    </button>
                  </div>
                </div>
              )}

              {/* Status */}
              {statusMsg && !restoring && (
                <StatusBanner msg={statusMsg} type={statusType} />
              )}
            </div>
          )}

          {/* Activity tab */}
          {tab === 'activity' && (
            <div>
              {log.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '30px 0', color: 'var(--text-secondary)', fontSize: 13,
                }}>
                  No activity yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {log.map((entry) => (
                    <div key={entry.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      fontSize: 11, color: 'var(--text-secondary)',
                      padding: '8px 10px', borderRadius: 6, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)'
                    }}>
                      <span style={{ color: entry.status === 'success' ? '#34a853' : '#ea4335', display: 'flex' }}>
                        {entry.status === 'success' ? <CheckCircleIcon size={12} /> : <XCircleIcon size={12} />}
                      </span>
                      <span style={{ textTransform: 'capitalize' }}>{entry.direction}</span>
                      <span>·</span>
                      <span>{entry.provider}</span>
                      <span>·</span>
                      <span style={{ marginLeft: 'auto' }}>{formatDate(entry.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showPassphrasePrompt && (
        <PassphrasePromptModal
          onCancel={() => setShowPassphrasePrompt(false)}
          onComplete={() => {
            setShowPassphrasePrompt(false);
            setHasPassphrase(true);
            // We just let the user click the button again, or we could track pending action.
            // But tracking is complex here with arguments, letting them click again is fine.
          }}
        />
      )}
    </div>
  );
}

function ProviderBadge({ provider }: { provider: 'googledrive' | 's3' }) {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: 6,
      background: provider === 'googledrive' ? 'linear-gradient(135deg, #4285f4, #34a853)' : 'linear-gradient(135deg, #ff9900, #e67e00)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, flexShrink: 0, color: 'white',
    }}>
      {provider === 'googledrive' ? 'G' : 'S'}
    </div>
  );
}

function StatusBanner({ msg, type }: { msg: string, type: 'success' | 'error' | null }) {
  const isSuccess = type === 'success';
  return (
    <div style={{
      marginTop: 10, padding: '8px 12px', borderRadius: 6,
      background: isSuccess ? 'rgba(52,168,83,0.1)' : 'rgba(234,67,53,0.1)',
      border: `1px solid ${isSuccess ? 'rgba(52,168,83,0.3)' : 'rgba(234,67,53,0.3)'}`,
      fontSize: 12, color: isSuccess ? '#34a853' : '#ea4335',
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {isSuccess ? <CheckCircleIcon size={14} style={{ flexShrink: 0 }} /> : <XCircleIcon size={14} style={{ flexShrink: 0 }} />}
      {msg}
    </div>
  );
}
