import { useTranslation } from 'react-i18next';
import { ShieldIcon } from './Icons';

interface FingerprintFlags {
  seed?: string;
  platform?: string;
  gpuVendor?: string;
  gpuRenderer?: string;
  screenWidth?: string;
  screenHeight?: string;
  hardwareConcurrency?: string;
  deviceMemory?: string;
  timezone?: string;
  locale?: string;
  brand?: string;
}

// GPU vendor → renderer combos from CloakBrowser docs + common real-world GPUs
const GPU_OPTIONS: { vendor: string; renderers: string[] }[] = [
  {
    vendor: 'NVIDIA Corporation',
    renderers: [
      'NVIDIA GeForce RTX 4090',
      'NVIDIA GeForce RTX 4080',
      'NVIDIA GeForce RTX 4070',
      'NVIDIA GeForce RTX 4060',
      'NVIDIA GeForce RTX 3090',
      'NVIDIA GeForce RTX 3080',
      'NVIDIA GeForce RTX 3070',
      'NVIDIA GeForce RTX 3060',
      'NVIDIA GeForce RTX 2080',
      'NVIDIA GeForce RTX 2070',
      'NVIDIA GeForce RTX 2060',
      'NVIDIA GeForce GTX 1660',
      'NVIDIA GeForce GTX 1650',
      'NVIDIA GeForce GTX 1080',
      'NVIDIA GeForce GTX 1070',
      'NVIDIA GeForce GTX 1060',
    ],
  },
  {
    vendor: 'Google Inc. (AMD)',
    renderers: [
      'ANGLE (AMD, AMD Radeon RX 7900 XTX, OpenGL 4.6)',
      'ANGLE (AMD, AMD Radeon RX 6800 XT, OpenGL 4.6)',
      'ANGLE (AMD, AMD Radeon RX 6700 XT, OpenGL 4.6)',
      'ANGLE (AMD, AMD Radeon RX 5700 XT, OpenGL 4.6)',
      'ANGLE (AMD, AMD Radeon RX 580, OpenGL 4.6)',
    ],
  },
  {
    vendor: 'Google Inc. (Intel)',
    renderers: [
      'ANGLE (Intel, Intel UHD Graphics 770, OpenGL 4.6)',
      'ANGLE (Intel, Intel UHD Graphics 730, OpenGL 4.6)',
      'ANGLE (Intel, Intel UHD Graphics 630, OpenGL 4.6)',
      'ANGLE (Intel, Intel Iris Xe Graphics, OpenGL 4.6)',
      'ANGLE (Intel, Intel Iris Plus Graphics, OpenGL 4.6)',
    ],
  },
  {
    vendor: 'Google Inc. (Apple)',
    renderers: [
      'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)',
      'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
      'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',
    ],
  },
  {
    vendor: 'Intel Inc.',
    renderers: [
      'Intel Iris OpenGL Engine',
      'Intel Iris Plus OpenGL Engine',
      'Intel HD Graphics 630',
    ],
  },
];

const SCREEN_RESOLUTIONS = [
  { w: '1920', h: '1080', label: '1920 × 1080 (Full HD)' },
  { w: '2560', h: '1440', label: '2560 × 1440 (2K)' },
  { w: '3840', h: '2160', label: '3840 × 2160 (4K)' },
  { w: '1440', h: '900',  label: '1440 × 900 (macOS)' },
  { w: '1366', h: '768',  label: '1366 × 768' },
  { w: '1536', h: '864',  label: '1536 × 864' },
  { w: '1600', h: '900',  label: '1600 × 900' },
  { w: '2560', h: '1600', label: '2560 × 1600 (macOS)' },
  { w: '1280', h: '720',  label: '1280 × 720 (HD)' },
  { w: '1280', h: '800',  label: '1280 × 800' },
];

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Sao_Paulo', 'America/Mexico_City', 'America/Argentina/Buenos_Aires',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid',
  'Europe/Rome', 'Europe/Moscow', 'Europe/Istanbul', 'Europe/Warsaw',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Seoul', 'Asia/Singapore',
  'Asia/Hong_Kong', 'Asia/Taipei', 'Asia/Bangkok', 'Asia/Ho_Chi_Minh',
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Jakarta',
  'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland',
  'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos',
];

const LOCALES = [
  'en-US', 'en-GB', 'en-AU', 'en-CA',
  'fr-FR', 'de-DE', 'es-ES', 'it-IT', 'pt-BR', 'pt-PT',
  'ja-JP', 'ko-KR', 'zh-CN', 'zh-TW',
  'vi-VN', 'th-TH', 'id-ID', 'ms-MY',
  'ru-RU', 'uk-UA', 'pl-PL', 'nl-NL', 'sv-SE',
  'ar-SA', 'hi-IN', 'tr-TR',
];

const HARDWARE_CONCURRENCY = ['2', '4', '6', '8', '10', '12', '16', '24', '32'];
const DEVICE_MEMORY = ['2', '4', '8', '16', '32'];

interface FingerprintSettingsProps {
  flags: FingerprintFlags;
  onChange: (flags: FingerprintFlags) => void;
}

const selectStyle: React.CSSProperties = { fontSize: 12, width: '100%' };
const labelStyle: React.CSSProperties = { fontSize: 11 };

export default function FingerprintSettings({ flags, onChange }: FingerprintSettingsProps) {
  const { t } = useTranslation();

  const update = (key: keyof FingerprintFlags, value: string) => {
    onChange({ ...flags, [key]: value || undefined });
  };

  // When GPU vendor changes, auto-clear renderer if it doesn't match
  const handleGpuVendorChange = (vendor: string) => {
    const group = GPU_OPTIONS.find(g => g.vendor === vendor);
    const currentRenderer = flags.gpuRenderer;
    const rendererValid = group?.renderers.includes(currentRenderer || '');
    onChange({
      ...flags,
      gpuVendor: vendor || undefined,
      gpuRenderer: rendererValid ? currentRenderer : undefined,
    });
  };

  // Screen resolution change: set both width and height
  const handleScreenChange = (val: string) => {
    if (!val) {
      onChange({ ...flags, screenWidth: undefined, screenHeight: undefined });
      return;
    }
    const [w, h] = val.split('x');
    onChange({ ...flags, screenWidth: w, screenHeight: h });
  };

  const currentGpuGroup = GPU_OPTIONS.find(g => g.vendor === flags.gpuVendor);
  const screenValue = flags.screenWidth && flags.screenHeight
    ? `${flags.screenWidth}x${flags.screenHeight}` : '';

  return (
    <div style={{
      marginTop: 12,
      padding: '14px',
      background: 'var(--bg-tertiary)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid rgba(13, 148, 136, 0.3)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
        fontSize: 12, fontWeight: 600, color: '#0d9488',
      }}>
        <ShieldIcon size={15} />
        {t('profileForm.fingerprintSettings')}
      </div>

      {/* Note */}
      <div style={{
        fontSize: 11, color: 'var(--text-secondary)', marginBottom: 14,
        padding: '8px 10px', background: 'rgba(13, 148, 136, 0.08)', borderRadius: 6,
        lineHeight: 1.5,
      }}>
        {t('profileForm.fingerprintNote')}
      </div>

      {/* Seed */}
      <div className="form-group" style={{ marginBottom: 10 }}>
        <label style={labelStyle}>{t('profileForm.fingerprintSeed')}</label>
        <input
          type="text"
          value={flags.seed || ''}
          onChange={(e) => update('seed', e.target.value)}
          placeholder={t('profileForm.fingerprintSeedPlaceholder')}
          style={{ fontSize: 12 }}
        />
      </div>

      {/* Platform + Brand */}
      <div className="form-row" style={{ gap: 8 }}>
        <div className="form-group" style={{ marginBottom: 10 }}>
          <label style={labelStyle}>{t('profileForm.fingerprintPlatform')}</label>
          <select
            value={flags.platform || ''}
            onChange={(e) => update('platform', e.target.value)}
            style={selectStyle}
          >
            <option value="">{t('profileForm.fingerprintPlatformAuto')}</option>
            <option value="windows">Windows</option>
            <option value="macos">macOS</option>
            <option value="linux">Linux</option>
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 10 }}>
          <label style={labelStyle}>{t('profileForm.fingerprintBrand')}</label>
          <select
            value={flags.brand || ''}
            onChange={(e) => update('brand', e.target.value)}
            style={selectStyle}
          >
            <option value="">{t('profileForm.fingerprintAuto')}</option>
            <option value="Chrome">Chrome</option>
            <option value="Edge">Edge</option>
            <option value="Opera">Opera</option>
            <option value="Vivaldi">Vivaldi</option>
          </select>
        </div>
      </div>

      {/* GPU Vendor + Renderer */}
      <div className="form-row" style={{ gap: 8 }}>
        <div className="form-group" style={{ marginBottom: 10 }}>
          <label style={labelStyle}>{t('profileForm.fingerprintGpuVendor')}</label>
          <select
            value={flags.gpuVendor || ''}
            onChange={(e) => handleGpuVendorChange(e.target.value)}
            style={selectStyle}
          >
            <option value="">{t('profileForm.fingerprintAuto')}</option>
            {GPU_OPTIONS.map(g => (
              <option key={g.vendor} value={g.vendor}>{g.vendor}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 10 }}>
          <label style={labelStyle}>{t('profileForm.fingerprintGpuRenderer')}</label>
          <select
            value={flags.gpuRenderer || ''}
            onChange={(e) => update('gpuRenderer', e.target.value)}
            style={selectStyle}
          >
            <option value="">{t('profileForm.fingerprintAuto')}</option>
            {(currentGpuGroup ? currentGpuGroup.renderers : GPU_OPTIONS.flatMap(g => g.renderers)).map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Screen Resolution + CPU Cores + Memory */}
      <div className="form-row" style={{ gap: 8 }}>
        <div className="form-group" style={{ marginBottom: 10 }}>
          <label style={labelStyle}>{t('profileForm.fingerprintScreenRes')}</label>
          <select
            value={screenValue}
            onChange={(e) => handleScreenChange(e.target.value)}
            style={selectStyle}
          >
            <option value="">{t('profileForm.fingerprintAuto')}</option>
            {SCREEN_RESOLUTIONS.map(r => (
              <option key={`${r.w}x${r.h}`} value={`${r.w}x${r.h}`}>{r.label}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 10 }}>
          <label style={labelStyle}>{t('profileForm.fingerprintHardwareConcurrency')}</label>
          <select
            value={flags.hardwareConcurrency || ''}
            onChange={(e) => update('hardwareConcurrency', e.target.value)}
            style={selectStyle}
          >
            <option value="">{t('profileForm.fingerprintAuto')}</option>
            {HARDWARE_CONCURRENCY.map(v => (
              <option key={v} value={v}>{v} cores</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 10 }}>
          <label style={labelStyle}>{t('profileForm.fingerprintDeviceMemory')}</label>
          <select
            value={flags.deviceMemory || ''}
            onChange={(e) => update('deviceMemory', e.target.value)}
            style={selectStyle}
          >
            <option value="">{t('profileForm.fingerprintAuto')}</option>
            {DEVICE_MEMORY.map(v => (
              <option key={v} value={v}>{v} GB</option>
            ))}
          </select>
        </div>
      </div>

      {/* Timezone + Locale */}
      <div className="form-row" style={{ gap: 8 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={labelStyle}>{t('profileForm.fingerprintTimezone')}</label>
          <select
            value={flags.timezone || ''}
            onChange={(e) => update('timezone', e.target.value)}
            style={selectStyle}
          >
            <option value="">{t('profileForm.fingerprintAuto')}</option>
            {TIMEZONES.map(tz => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={labelStyle}>{t('profileForm.fingerprintLocale')}</label>
          <select
            value={flags.locale || ''}
            onChange={(e) => update('locale', e.target.value)}
            style={selectStyle}
          >
            <option value="">{t('profileForm.fingerprintAuto')}</option>
            {LOCALES.map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

export type { FingerprintFlags };
