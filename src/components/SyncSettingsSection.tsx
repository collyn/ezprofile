import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getAPI } from '../api';
import type { SyncSettings } from '../types';
import { useDialog } from '../contexts/DialogContext';
import { CheckCircleIcon, AlertTriangleIcon, LightbulbIcon, XCircleIcon, ChevronRightIcon, CloudIcon, LockIcon, ClockIcon, SlashIcon, GDriveIcon, S3Icon, SpinnerIcon, UploadIcon } from './Icons';
const api = getAPI();

const INTERVAL_OPTIONS = [
  { value: 15, labelKey: 'cloudSync.every15min' },
  { value: 30, labelKey: 'cloudSync.every30min' },
  { value: 60, labelKey: 'cloudSync.every1h' },
  { value: 120, labelKey: 'cloudSync.every2h' },
  { value: 360, labelKey: 'cloudSync.every6h' },
  { value: 720, labelKey: 'cloudSync.every12h' },
  { value: 1440, labelKey: 'cloudSync.every24h' },
];

const getGDRIVE_STEPS = (t: any) => [
  {
    step: 1,
    title: t('cloudSync.gdriveStep1Title', 'Create a Google Cloud Project'),
    desc: t('cloudSync.gdriveStep1Desc', 'Go to Google Cloud Console → create a new project (or use an existing one).'),
    link: 'https://console.cloud.google.com/projectcreate',
    linkLabel: t('cloudSync.gdriveStep1Link', 'Open Google Cloud Console →'),
  },
  {
    step: 2,
    title: t('cloudSync.gdriveStep2Title', 'Enable Google Drive API'),
    desc: t('cloudSync.gdriveStep2Desc', 'APIs & Services → Enable APIs → search "Google Drive API" → Enable.'),
    link: 'https://console.cloud.google.com/apis/library/drive.googleapis.com',
    linkLabel: t('cloudSync.gdriveStep2Link', 'Enable Drive API →'),
  },
  {
    step: 3,
    title: t('cloudSync.gdriveStep3Title', 'Configure OAuth Consent Screen'),
    desc: t('cloudSync.gdriveStep3Desc', 'APIs & Services → OAuth consent screen → choose "External" → fill in App name (e.g. "EzProfile Sync") → Save & Continue through all steps.'),
    link: 'https://console.cloud.google.com/apis/credentials/consent',
    linkLabel: t('cloudSync.gdriveStep3Link', 'Configure consent screen →'),
  },
  {
    step: 4,
    title: t('cloudSync.gdriveStep4Title', 'Publish the App (fixes 403 error)'),
    desc: t('cloudSync.gdriveStep4Desc', 'On the OAuth consent screen page → click "Publish App" → Confirm. This removes the test-user restriction. Google shows an "unverified" warning — click "Advanced" → "Go to [app name]" to proceed. This is safe for a personal tool you created yourself.'),
    link: 'https://console.cloud.google.com/apis/credentials/consent',
    linkLabel: t('cloudSync.gdriveStep4Link', 'Go to consent screen →'),
    highlight: true,
  },
  {
    step: 5,
    title: t('cloudSync.gdriveStep5Title', 'Create OAuth Client ID (Desktop app type)'),
    desc: t('cloudSync.gdriveStep5Desc', 'APIs & Services → Credentials → Create Credentials → OAuth Client ID → Application type: "Desktop app" → Create.'),
    link: 'https://console.cloud.google.com/apis/credentials',
    linkLabel: t('cloudSync.gdriveStep5Link', 'Create credentials →'),
  },
  {
    step: 6,
    title: t('cloudSync.gdriveStep6Title', 'Copy Client ID and Client Secret'),
    desc: t('cloudSync.gdriveStep6Desc', 'After creation you\'ll see both "Client ID" and "Client Secret". Copy both — paste them in the fields above. The Client Secret for a Desktop app is NOT truly secret (it can\'t be hidden in any desktop app), but Google still requires it for token exchange.'),
  },
];

export default function SyncSettingsSection() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<SyncSettings & { hasPassphrase: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const dialog = useDialog();

  // Provider
  const [selectedProvider, setSelectedProvider] = useState<'googledrive' | 's3' | null>(null);

  // Google Drive state
  const [gdriveClientId, setGdriveClientId] = useState('');
  const [gdriveClientSecret, setGdriveClientSecret] = useState('');
  const [savedClientId, setSavedClientId] = useState('');
  const [savedClientSecret, setSavedClientSecret] = useState(false);
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [credentialsSaved, setCredentialsSaved] = useState(false);
  const [connectingGdrive, setConnectingGdrive] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  // S3 state
  const [s3Form, setS3Form] = useState({ accessKeyId: '', secretAccessKey: '', bucket: '', region: 'ap-southeast-1', prefix: 'ezprofile/', endpoint: '' });
  const [testingS3, setTestingS3] = useState(false);
  const [s3TestResult, setS3TestResult] = useState<'idle' | 'ok' | 'error'>('idle');
  const [s3TestError, setS3TestError] = useState('');

  // Passphrase
  const [passphrase, setPassphrase] = useState('');
  const [hint, setHint] = useState('');
  const [savingPassphrase, setSavingPassphrase] = useState(false);
  const [passphraseSaved, setPassphraseSaved] = useState(false);

  // Change passphrase
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [changeOldPass, setChangeOldPass] = useState('');
  const [changeNewPass, setChangeNewPass] = useState('');
  const [changeNewHint, setChangeNewHint] = useState('');
  const [changingPass, setChangingPass] = useState(false);
  const [changeError, setChangeError] = useState('');

  // Auto sync & backup
  const [autoSyncOnClose, setAutoSyncOnClose] = useState(false);
  const [syncMaxBackups, setSyncMaxBackups] = useState(5);

  // Manual sync
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncAllResult, setSyncAllResult] = useState<{ total: number; success: number; failed: number } | null>(null);
  const [syncProgress, setSyncProgress] = useState('');

  const loadSettings = useCallback(async () => {
    try {
      const s = await api.syncGetSettings();
      setSettings(s);
      setSelectedProvider(s.provider);
      setAutoSyncOnClose(s.autoSyncOnClose);
      setSyncMaxBackups(s.syncMaxBackups);
      setHint(s.passphraseHint || '');

      const clientId = s.gdrive?.clientId || '';
      setGdriveClientId(clientId);
      setSavedClientId(clientId);
      setSavedClientSecret(s.gdrive?.hasSecret ?? false);

      if (s.s3) {
        setS3Form(prev => ({
          ...prev,
          accessKeyId: s.s3!.accessKeyId || '',
          bucket: s.s3!.bucket || '',
          region: s.s3!.region || 'ap-southeast-1',
          prefix: s.s3!.prefix || 'ezprofile/',
          endpoint: s.s3!.endpoint || '',
        }));
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSettings();
    api.onSyncProgress?.((p) => setSyncProgress(p.message));
    api.onSyncAllComplete?.((r) => {
      setSyncingAll(false);
      setSyncProgress('');
      setSyncAllResult({ total: r.total, success: r.success, failed: r.failed });
    });
  }, []);

  // ── Provider ──────────────────────────────
  const handleSelectProvider = async (p: 'googledrive' | 's3' | null) => {
    setSelectedProvider(p);
    await api.syncSetProvider(p ?? '');
    setSettings(prev => prev ? { ...prev, provider: p } : prev);
  };

  // ── Google Drive ──────────────────────────
  const handleSaveCredentials = async () => {
    if (!gdriveClientId.trim()) return;
    setSavingCredentials(true);
    const r1 = await api.syncSaveGoogleClientId(gdriveClientId.trim());
    if (!r1.success) { await dialog.alert(`Error saving Client ID: ${r1.error}`); setSavingCredentials(false); return; }
    if (gdriveClientSecret.trim()) {
      const r2 = await api.syncSaveGoogleClientSecret(gdriveClientSecret.trim());
      if (!r2.success) { await dialog.alert(`Error saving Client Secret: ${r2.error}`); setSavingCredentials(false); return; }
      setSavedClientSecret(true);
    }
    setSavedClientId(gdriveClientId.trim());
    setSavingCredentials(false);
    setCredentialsSaved(true);
    setTimeout(() => setCredentialsSaved(false), 3000);
  };

  const handleConnectGoogle = async () => {
    if (!savedClientId || !savedClientSecret) {
      await dialog.alert(t('cloudSync.saveCredentialsFirst'));
      return;
    }
    setConnectingGdrive(true);
    const res = await api.syncStartGoogleAuth();
    setConnectingGdrive(false);
    if (res.success) {
      loadSettings();
    } else {
      await dialog.alert(`Google Auth failed: ${res.error}`);
    }
  };

  const handleDisconnectGoogle = async () => {
    const confirmed = await dialog.confirm(t('cloudSync.disconnectConfirm'));
    if (!confirmed) return;
    await api.syncRevokeGoogle();
    loadSettings();
  };

  // ── S3 ───────────────────────────────────
  const handleSaveS3 = async () => {
    const res = await api.syncSaveS3Config(s3Form);
    if (res.success) { setS3TestResult('idle'); loadSettings(); }
  };

  const handleTestS3 = async () => {
    setTestingS3(true); setS3TestResult('idle');
    const res = await api.syncTestS3();
    setTestingS3(false);
    if (res.success) setS3TestResult('ok');
    else { setS3TestResult('error'); setS3TestError(res.error ?? 'Unknown error'); }
  };

  // ── Passphrase ───────────────────────────
  const handleSetPassphrase = async () => {
    if (!passphrase) return;
    setSavingPassphrase(true);
    const res = await api.syncSetPassphrase(passphrase, hint || undefined);
    setSavingPassphrase(false);
    if (res.success) {
      setPassphrase('');
      setPassphraseSaved(true);
      setTimeout(() => setPassphraseSaved(false), 3000);
      loadSettings();
    } else await dialog.alert(`Error: ${res.error}`);
  };

  const handleChangePassphrase = async () => {
    if (!changeOldPass || !changeNewPass) return;
    setChangingPass(true);
    setChangeError('');
    const res = await api.syncChangePassphrase(changeOldPass, changeNewPass, changeNewHint || undefined);
    setChangingPass(false);
    if (res.success) {
      setShowChangeForm(false);
      setChangeOldPass('');
      setChangeNewPass('');
      setChangeNewHint('');
      setPassphraseSaved(true);
      setTimeout(() => setPassphraseSaved(false), 3000);
      loadSettings();
    } else {
      if (res.error === 'wrong_passphrase') {
        setChangeError(t('cloudSync.encryptionWrongPass'));
      } else {
        setChangeError(res.error || 'Error');
      }
    }
  };

  const handleClearPassphrase = async () => {
    const confirmed = await dialog.confirm(t('cloudSync.encryptionClearConfirm'));
    if (!confirmed) return;
    await api.syncClearPassphrase();
    loadSettings();
  };

  // ── Auto Sync & Backup ────────────────────────────
  const handleAutoSyncOnClose = async (enabled: boolean) => {
    setAutoSyncOnClose(enabled);
    await api.syncSetAutoSyncOnClose(enabled);
    loadSettings();
  };

  const handleMaxBackupsChange = async (limit: number) => {
    setSyncMaxBackups(limit);
    await api.syncSetMaxBackups(limit);
    loadSettings();
  };

  // ── Sync All ─────────────────────────────
  const handleSyncAll = async () => {
    if (!settings?.hasPassphrase) { await dialog.alert(t('cloudSync.encryptionRequired')); return; }
    setSyncingAll(true); setSyncAllResult(null); setSyncProgress('Starting sync...');
    await api.syncUploadAll();
  };

  if (loading) return null;

  const isGdriveConnected = settings?.gdrive?.connected;
  const isS3Configured = settings?.s3?.hasSecret;
  const credentialsDirty = gdriveClientId !== savedClientId || gdriveClientSecret.trim().length > 0;
  const canConnect = savedClientId && savedClientSecret;

  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
        <CloudIcon size={16} />
        {t('cloudSync.title')}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16, marginTop: 0 }}>
        {t('cloudSync.subtitle')}
        <strong style={{ color: 'var(--text-primary)' }}> {t('cloudSync.subtitleStrong')}</strong>
      </p>

      {/* Provider picker */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <ProviderCard id="disabled" icon={<SlashIcon />} title={t('cloudSync.providerDisabled')} desc={t('cloudSync.providerDisabledDesc')}
          selected={!selectedProvider} onClick={() => handleSelectProvider(null)} />
        <ProviderCard id="googledrive" icon={<GDriveIcon />} title={t('cloudSync.providerGDrive')} desc={t('cloudSync.providerGDriveDesc')}
          selected={selectedProvider === 'googledrive'} onClick={() => handleSelectProvider('googledrive')}
          badge={isGdriveConnected ? t('cloudSync.connected') : undefined} />
        <ProviderCard id="s3" icon={<S3Icon />} title={t('cloudSync.providerS3')} desc={t('cloudSync.providerS3Desc')}
          selected={selectedProvider === 's3'} onClick={() => handleSelectProvider('s3')}
          badge={isS3Configured ? t('cloudSync.configured') : undefined} />
      </div>

      {/* ── Google Drive config ── */}
      {selectedProvider === 'googledrive' && (
        <ConfigBox>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>
            Google Drive Connection
          </div>

          {isGdriveConnected ? (
            /* Connected state */
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'linear-gradient(135deg, #4285f4, #34a853)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, flexShrink: 0, color: 'white', fontWeight: 700,
              }}>G</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {settings?.gdrive?.email ?? t('cloudSync.connected')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {t('cloudSync.gdriveFolderNote')}
                </div>
              </div>
              <button className="btn btn-sm" onClick={handleDisconnectGoogle}
                style={{ color: '#ea4335', borderColor: '#ea4335', fontSize: 11 }}>
                Disconnect
              </button>
            </div>
          ) : (
            /* Setup flow */
            <div>
              {/* Credentials inputs */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  OAuth Credentials
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(66,133,244,0.15)', color: '#4285f4' }}>
                    Desktop app type
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input
                    type="text"
                    value={gdriveClientId}
                    onChange={(e) => setGdriveClientId(e.target.value)}
                    placeholder="Client ID: xxxxxxxxxxxx.apps.googleusercontent.com"
                    style={{ fontFamily: 'monospace', fontSize: 11 }}
                  />
                  <input
                    type="password"
                    value={gdriveClientSecret}
                    onChange={(e) => setGdriveClientSecret(e.target.value)}
                    placeholder={savedClientSecret
                      ? 'Client Secret: ●●●●●● (saved — leave blank to keep)'
                      : 'Client Secret: GOCSPX-...'}
                    style={{ fontFamily: 'monospace', fontSize: 11 }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveCredentials()}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      className="btn btn-sm"
                      onClick={handleSaveCredentials}
                      disabled={!gdriveClientId.trim() || savingCredentials || !credentialsDirty}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {savingCredentials ? t('cloudSync.savingCredentials') : credentialsSaved ? t('cloudSync.credentialsSaved') : t('cloudSync.saveCredentials')}
                    </button>
                    {credentialsSaved && <span style={{ fontSize: 11, color: '#34a853', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircleIcon size={14} /> Credentials saved</span>}
                    {savedClientId && savedClientSecret && !credentialsDirty && (
                      <span style={{ fontSize: 11, color: '#34a853', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircleIcon size={14} /> Credentials configured</span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    <LightbulbIcon size={12} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />The Client Secret for a Desktop app is a "public secret" — it cannot be truly hidden in any desktop app.
                    EzProfile stores it encrypted on your device. Whoever has it still needs your Google login to do anything.
                  </div>
                </div>
              </div>

              {/* Connect button */}
              <button
                className="btn btn-primary btn-sm"
                onClick={handleConnectGoogle}
                disabled={connectingGdrive || !canConnect}
                style={{
                  background: canConnect ? 'linear-gradient(135deg, #4285f4, #34a853)' : undefined,
                  border: 'none', display: 'flex', alignItems: 'center', gap: 6,
                }}
                title={!canConnect ? t('cloudSync.connectGoogleTooltip') : ''}
              >
                {connectingGdrive ? <SpinnerIcon /> : <GDriveIcon size={14} />}
                {connectingGdrive ? t('cloudSync.connectingGoogle') : t('cloudSync.connectGoogle')}
              </button>

              {!canConnect && (
                <div style={{ fontSize: 11, color: '#fbbc05', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertTriangleIcon size={14} /> Save your Client ID and Client Secret above to enable connecting
                </div>
              )}
            </div>
          )}

          {/* Setup guide collapsible */}
          <div style={{ marginTop: 14, borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
            <button
              onClick={() => setShowGuide(!showGuide)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                display: 'flex', alignItems: 'center', gap: 6,
                color: '#4285f4', fontSize: 12, fontWeight: 500,
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', transition: 'transform 0.2s', transform: showGuide ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                <ChevronRightIcon size={14} />
              </span>
              {showGuide ? t('cloudSync.hideGuide') : t('cloudSync.showGuide')} — {t('cloudSync.guideStepByStep')}
            </button>

            {showGuide && (
              <div style={{ marginTop: 12 }}>
                <div style={{
                  padding: '10px 12px', borderRadius: 6, marginBottom: 12,
                  background: 'rgba(66,133,244,0.06)', border: '1px solid rgba(66,133,244,0.15)',
                  fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, display: 'flex', gap: 6,
                }}>
                  <LockIcon size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong>Privacy note:</strong> You create and own the Google Cloud Project — no EzProfile developer credentials involved.
                    Your Client ID and Client Secret are stored encrypted on this device only.
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {getGDRIVE_STEPS(t).map((s) => (
                    <div key={s.step} style={{ display: 'flex', gap: 10 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                        background: s.highlight ? 'rgba(251,188,5,0.2)' : 'rgba(66,133,244,0.15)',
                        color: s.highlight ? '#fbbc05' : '#4285f4',
                        border: s.highlight ? '1px solid rgba(251,188,5,0.4)' : 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 700, marginTop: 1,
                      }}>
                        {s.step}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: 12, fontWeight: 600, marginBottom: 2,
                          color: s.highlight ? '#fbbc05' : 'var(--text-primary)',
                        }}>
                          {s.title}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                          {s.desc}
                        </div>
                        {s.link && (
                          <button
                            onClick={() => api.openExternal(s.link!)}
                            style={{
                              marginTop: 4, background: 'none', border: 'none', padding: 0,
                              color: '#4285f4', cursor: 'pointer', fontSize: 11,
                              textDecoration: 'underline', textUnderlineOffset: 2,
                            }}
                          >
                            {s.linkLabel}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ConfigBox>
      )}

      {/* ── S3 config ── */}
      {selectedProvider === 's3' && (
      <ConfigBox>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>
            {t('cloudSync.s3Title')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <FormField label={t('cloudSync.s3Endpoint')}>
              <input type="text" value={s3Form.endpoint} onChange={(e) => setS3Form(p => ({ ...p, endpoint: e.target.value }))}
                placeholder="https://<account_id>.r2.cloudflarestorage.com" style={{ width: '100%' }} />
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <FormField label={t('cloudSync.s3AccessKey')}>
                <input type="text" value={s3Form.accessKeyId} onChange={(e) => setS3Form(p => ({ ...p, accessKeyId: e.target.value }))}
                  placeholder="AKIAIOSFODNN7EXAMPLE" style={{ width: '100%', fontFamily: 'monospace', fontSize: 11 }} />
              </FormField>
              <FormField label={t('cloudSync.s3SecretKey')}>
                <input type="password" value={s3Form.secretAccessKey} onChange={(e) => setS3Form(p => ({ ...p, secretAccessKey: e.target.value }))}
                  placeholder={isS3Configured ? '••••••••••••••••••' : 'Your secret key'} style={{ width: '100%', fontFamily: 'monospace', fontSize: 11 }} />
              </FormField>
              <FormField label={t('cloudSync.s3Bucket')}>
                <input type="text" value={s3Form.bucket} onChange={(e) => setS3Form(p => ({ ...p, bucket: e.target.value }))}
                  placeholder="my-ezprofile-bucket" style={{ width: '100%' }} />
              </FormField>
              <FormField label={t('cloudSync.s3Region')}>
                <input type="text" value={s3Form.region} onChange={(e) => setS3Form(p => ({ ...p, region: e.target.value }))}
                  placeholder="us-east-1 (or auto for R2)" style={{ width: '100%' }} />
              </FormField>
            </div>
            <FormField label={t('cloudSync.s3Prefix')}>
              <input type="text" value={s3Form.prefix} onChange={(e) => setS3Form(p => ({ ...p, prefix: e.target.value }))}
                placeholder="ezprofile/" style={{ width: '100%' }} />
            </FormField>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <button className="btn btn-sm" onClick={handleSaveS3}>Save</button>
            <button className="btn btn-sm" onClick={handleTestS3} disabled={testingS3}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {testingS3 ? <SpinnerIcon /> : null}
              Test Connection
            </button>
            {s3TestResult === 'ok' && <span style={{ fontSize: 11, color: '#34a853', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircleIcon size={14} /> Connected</span>}
            {s3TestResult === 'error' && <span style={{ fontSize: 11, color: '#ea4335', display: 'flex', alignItems: 'center', gap: 4 }}><XCircleIcon size={14} /> {s3TestError}</span>}
          </div>
        </ConfigBox>
      )}

      {/* ── Encryption Passphrase ── */}
      {selectedProvider && (
        <ConfigBox>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <LockIcon size={13} />
            {t('cloudSync.encryptionTitle')}
            {settings?.hasPassphrase && (
              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: 'rgba(52,168,83,0.15)', color: '#34a853', fontWeight: 500 }}>
                {t('cloudSync.encryptionConfigured')}
              </span>
            )}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10, marginTop: 0 }}>
            {t('cloudSync.encryptionDesc')}
            Your passphrase <strong>{t('cloudSync.encryptionDescStrong')}</strong> {t('cloudSync.encryptionDescEnd')}
          </p>

          {settings?.hasPassphrase ? (
            /* ── Already configured ── */
            <div>
              {/* Status + hint */}
              <div style={{
                padding: '10px 14px', borderRadius: 8,
                background: 'rgba(52,168,83,0.06)', border: '1px solid rgba(52,168,83,0.15)',
                marginBottom: 10,
              }}>
                <div style={{ fontSize: 12, color: '#34a853', display: 'flex', alignItems: 'center', gap: 6, marginBottom: settings?.passphraseHint ? 6 : 0 }}>
                  <CheckCircleIcon size={14} />
                  {t('cloudSync.encryptionSetStatus')}
                </div>
                {settings?.passphraseHint && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {t('cloudSync.encryptionHint')}: <em style={{ color: 'var(--text-primary)' }}>{settings.passphraseHint}</em>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              {!showChangeForm && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-sm" onClick={() => { setShowChangeForm(true); setChangeError(''); }}
                    style={{ fontSize: 11 }}>
                    {t('cloudSync.encryptionChange')}
                  </button>
                  <button className="btn btn-sm" onClick={handleClearPassphrase}
                    style={{ fontSize: 11, color: '#ea4335', borderColor: 'rgba(234,67,53,0.3)' }}>
                    {t('cloudSync.encryptionClear')}
                  </button>
                  {passphraseSaved && <span style={{ fontSize: 11, color: '#34a853' }}>{t('cloudSync.encryptionDone')}</span>}
                </div>
              )}

              {/* Change passphrase form */}
              {showChangeForm && (
                <div style={{
                  padding: 14, borderRadius: 8,
                  background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  {/* Warning */}
                  <div style={{
                    padding: '8px 10px', borderRadius: 6,
                    background: 'rgba(251,188,5,0.1)', border: '1px solid rgba(251,188,5,0.25)',
                    fontSize: 11, color: '#fbbc05', display: 'flex', gap: 6, alignItems: 'flex-start',
                  }}>
                    <AlertTriangleIcon size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>{t('cloudSync.encryptionChangeWarning')}</span>
                  </div>

                  <input type="password" value={changeOldPass} onChange={(e) => setChangeOldPass(e.target.value)}
                    placeholder={t('cloudSync.encryptionOldPass')} autoFocus />
                  <input type="password" value={changeNewPass} onChange={(e) => setChangeNewPass(e.target.value)}
                    placeholder={t('cloudSync.encryptionNewPass')} />
                  <input type="text" value={changeNewHint} onChange={(e) => setChangeNewHint(e.target.value)}
                    placeholder={t('cloudSync.encryptionNewHint')} style={{ fontSize: 11 }} />

                  {changeError && (
                    <div style={{ color: '#ea4335', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <XCircleIcon size={12} /> {changeError}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button className="btn btn-sm btn-primary" onClick={handleChangePassphrase}
                      disabled={!changeOldPass || !changeNewPass || changingPass}
                      style={{ background: 'linear-gradient(135deg, #4285f4, #0f9d58)', border: 'none', fontSize: 11 }}>
                      {changingPass ? t('cloudSync.encryptionChanging') : t('cloudSync.encryptionConfirmChange')}
                    </button>
                    <button className="btn btn-sm btn-outline" onClick={() => { setShowChangeForm(false); setChangeError(''); }}
                      disabled={changingPass} style={{ fontSize: 11 }}>
                      {t('cloudSync.encryptionCancelChange')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── First time setup ── */
            <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
              <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)}
                placeholder={t('cloudSync.encryptionPlaceholder')}
                onKeyDown={(e) => e.key === 'Enter' && handleSetPassphrase()} />
              <input type="text" value={hint} onChange={(e) => setHint(e.target.value)}
                placeholder={t('cloudSync.encryptionHintPlaceholder')} style={{ fontSize: 11 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="btn btn-sm btn-primary" onClick={handleSetPassphrase}
                  disabled={!passphrase || savingPassphrase}
                  style={{ background: 'linear-gradient(135deg, #4285f4, #0f9d58)', border: 'none' }}>
                  {savingPassphrase ? t('cloudSync.encryptionSetting') : t('cloudSync.encryptionSet')}
                </button>
                {passphraseSaved && <span style={{ fontSize: 11, color: '#34a853' }}>{t('cloudSync.encryptionDone')}</span>}
              </div>
            </div>
          )}
        </ConfigBox>
      )}

      {/* ── Auto Sync on Close ── */}
      {selectedProvider && (
        <ConfigBox>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CloudIcon size={13} />
                {t('cloudSync.autoSyncOnCloseTitle', 'Auto Sync')}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                {settings?.hasPassphrase ? t('cloudSync.autoSyncOnCloseDesc', 'Sync profile when closed (overwrites previous version).') : t('cloudSync.autoSyncDisabledHint')}
              </div>
            </div>
            <ToggleSwitch checked={autoSyncOnClose} onChange={handleAutoSyncOnClose} disabled={!settings?.hasPassphrase} />
          </div>
        </ConfigBox>
      )}

      {/* ── Auto Backup ── */}
      {selectedProvider && (
        <ConfigBox>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <ClockIcon size={13} />
                {t('cloudSync.maxBackupsTitle', 'Max Backups per Profile')}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                {t('cloudSync.maxBackupsDesc', 'Older backups are automatically deleted when the limit is reached.')}
              </div>
            </div>
            <select
              value={syncMaxBackups}
              onChange={(e) => handleMaxBackupsChange(Number(e.target.value))}
              style={{
                fontSize: 12,
                padding: '4px 8px',
                borderRadius: 4,
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
              }}
            >
              {[1, 3, 5, 10, 20].map((limit) => (
                <option key={limit} value={limit}>
                  {limit}
                </option>
              ))}
            </select>
          </div>
        </ConfigBox>
      )}

      {/* ── Quick Actions ── */}
      {selectedProvider && settings?.hasPassphrase && (
        <ConfigBox>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>
            {t('cloudSync.quickActionsTitle')}
          </div>
          <button className="btn btn-sm btn-primary" onClick={handleSyncAll} disabled={syncingAll}
            style={{ background: 'linear-gradient(135deg, #4285f4, #34a853)', border: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
            {syncingAll ? <SpinnerIcon /> : <UploadIcon size={13} />}
            {syncingAll ? t('cloudSync.syncingAll') : t('cloudSync.syncAllNow')}
          </button>

          {syncingAll && syncProgress && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, background: 'rgba(66,133,244,0.08)', border: '1px solid rgba(66,133,244,0.2)', fontSize: 12, color: '#4285f4', display: 'flex', alignItems: 'center', gap: 6 }}>
              <SpinnerIcon /> {syncProgress}
            </div>
          )}
          {syncAllResult && !syncingAll && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, background: syncAllResult.failed > 0 ? 'rgba(234,67,53,0.08)' : 'rgba(52,168,83,0.08)', border: `1px solid ${syncAllResult.failed > 0 ? 'rgba(234,67,53,0.2)' : 'rgba(52,168,83,0.2)'}`, fontSize: 12 }}>
              <span style={{ color: syncAllResult.failed > 0 ? '#ea4335' : '#34a853', fontWeight: 600 }}>
                {syncAllResult.failed > 0
                  ? t('cloudSync.syncResultPartial', { success: syncAllResult.success, total: syncAllResult.total, failed: syncAllResult.failed })
                  : t('cloudSync.syncResultSuccess', { total: syncAllResult.total })}
              </span>
            </div>
          )}
        </ConfigBox>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────
function ProviderCard({ id, icon, title, desc, selected, onClick, badge }: {
  id: string; icon: React.ReactNode; title: string; desc: string;
  selected: boolean; onClick: () => void; badge?: string;
}) {
  return (
    <button id={`sync-provider-${id}`} onClick={onClick} style={{
      flex: 1, padding: '14px 12px', borderRadius: 8, cursor: 'pointer',
      border: selected ? '2px solid #4285f4' : '2px solid var(--border-color)',
      background: selected ? 'rgba(66,133,244,0.08)' : 'var(--bg-secondary)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      transition: 'all 0.15s ease', textAlign: 'center', color: 'var(--text-primary)',
    }}>
      <div style={{ fontSize: 22, lineHeight: 1 }}>{icon}</div>
      <div style={{ fontSize: 12, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{desc}</div>
      {badge && (
        <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 10, fontWeight: 600, background: 'rgba(52,168,83,0.15)', color: '#34a853' }}>
          {badge}
        </span>
      )}
    </button>
  );
}

function ConfigBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 14, marginBottom: 12, background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
      {children}
    </div>
  );
}

function FormField({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function ToggleSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button onClick={() => !disabled && onChange(!checked)} style={{
      width: 40, height: 22, borderRadius: 11, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
      background: checked ? '#4285f4' : 'var(--bg-secondary)', position: 'relative',
      transition: 'background 0.2s', opacity: disabled ? 0.5 : 1, flexShrink: 0, outline: '1px solid var(--border-color)',
    }}>
      <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: checked ? 21 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
    </button>
  );
}


