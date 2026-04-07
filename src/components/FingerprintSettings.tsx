import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldIcon, Monitor, LaptopIcon, AppleIcon, TerminalIcon, ChevronDownIcon, ChevronRightIcon } from './Icons';
import { HARDWARE_PRESETS, PRESET_CATEGORIES, GPU_BY_PLATFORM, SCREENS_BY_PLATFORM } from '../data/hardware-presets';

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
  webrtcIp?: string;
  storageQuota?: string;
}

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

interface FingerprintSettingsProps {
  flags: FingerprintFlags;
  onChange: (flags: FingerprintFlags) => void;
}

const selectStyle: React.CSSProperties = { fontSize: 12, width: '100%' };
const labelStyle: React.CSSProperties = { fontSize: 11 };

// Hardware fields that are set by presets
const HW_KEYS: (keyof FingerprintFlags)[] = [
  'platform', 'gpuVendor', 'gpuRenderer', 'screenWidth', 'screenHeight',
  'hardwareConcurrency', 'deviceMemory',
];

function findMatchingPreset(flags: FingerprintFlags) {
  return HARDWARE_PRESETS.find(p =>
    p.platform === flags.platform &&
    p.gpuVendor === flags.gpuVendor &&
    p.gpuRenderer === flags.gpuRenderer &&
    p.screenWidth === flags.screenWidth &&
    p.screenHeight === flags.screenHeight &&
    p.hardwareConcurrency === flags.hardwareConcurrency &&
    p.deviceMemory === flags.deviceMemory
  );
}

function isAutoMode(flags: FingerprintFlags) {
  return HW_KEYS.every(k => !flags[k]);
}

function getCategoryIcon(cat: string) {
  if (cat === 'Windows Desktop') return <Monitor size={14} />;
  if (cat === 'Windows Laptop') return <LaptopIcon size={14} />;
  if (cat === 'macOS') return <AppleIcon size={14} />;
  if (cat === 'Linux') return <TerminalIcon size={14} />;
  return null;
}

function PresetDropdown({ value, onChange, t }: { value: string, onChange: (val: string) => void, t: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getLabel = () => {
    if (!value) return t('profileForm.fingerprintPresetAuto');
    if (value === 'custom') return t('profileForm.fingerprintPresetCustom');
    const preset = HARDWARE_PRESETS.find(p => p.id === value);
    if (preset) return `${preset.name} · ${preset.hardwareConcurrency}c/${preset.deviceMemory}GB`;
    return '';
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', fontSize: 12 }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 10px', background: 'var(--bg-primary)', 
          border: '1px solid var(--border-color)', borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getLabel()}</span>
        <ChevronDownIcon size={14} style={{ flexShrink: 0, marginLeft: 8 }} />
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          background: '#232529', border: '1px solid var(--border-color)',
          borderRadius: 4, zIndex: 10, maxHeight: 300, overflowY: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }}>
          <div 
            onClick={() => { onChange(''); setIsOpen(false); }}
            style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)'}}
            onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(13, 148, 136, 0.15)')}
            onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {t('profileForm.fingerprintPresetAuto')}
          </div>
          
          {PRESET_CATEGORIES.map(cat => (
            <div key={cat}>
              <div style={{ 
                display: 'flex', alignItems: 'center', gap: 6, 
                padding: '6px 10px', background: 'rgba(0,0,0,0.2)', 
                fontWeight: 600, color: 'var(--text-secondary)' 
              }}>
                {getCategoryIcon(cat)}
                {cat}
              </div>
              {HARDWARE_PRESETS.filter(p => p.category === cat).map(p => (
                <div 
                  key={p.id}
                  onClick={() => { onChange(p.id); setIsOpen(false); }}
                  style={{ 
                    padding: '6px 10px', paddingLeft: 28, cursor: 'pointer',
                    background: value === p.id ? 'rgba(13, 148, 136, 0.2)' : 'transparent',
                  }}
                  onMouseOver={(e) => {
                    if (value !== p.id) e.currentTarget.style.background = 'rgba(13, 148, 136, 0.1)';
                  }}
                  onMouseOut={(e) => {
                    if (value !== p.id) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {p.name} <span style={{ opacity: 0.6 }}>· {p.hardwareConcurrency}c/{p.deviceMemory}GB</span>
                </div>
              ))}
            </div>
          ))}

          {value === 'custom' && (
            <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border-color)'}}>
              {t('profileForm.fingerprintPresetCustom')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FingerprintSettings({ flags, onChange }: FingerprintSettingsProps) {
  const { t } = useTranslation();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const update = (key: keyof FingerprintFlags, value: string) => {
    onChange({ ...flags, [key]: value || undefined });
  };

  // Determine current preset state
  const isAuto = isAutoMode(flags);
  const matchedPreset = !isAuto ? findMatchingPreset(flags) : null;
  const presetValue = isAuto ? '' : (matchedPreset?.id || 'custom');

  // Handle preset selection
  const handlePresetChange = (presetId: string) => {
    if (!presetId) {
      // Auto — clear all hardware fields
      const next: FingerprintFlags = { seed: flags.seed, timezone: flags.timezone, locale: flags.locale, brand: flags.brand, webrtcIp: flags.webrtcIp, storageQuota: flags.storageQuota };
      onChange(next);
    } else if (presetId === 'custom') {
      // keep current values, just open advanced
      setShowAdvanced(true);
    } else {
      const preset = HARDWARE_PRESETS.find(p => p.id === presetId);
      if (preset) {
        onChange({
          ...flags,
          platform: preset.platform,
          gpuVendor: preset.gpuVendor,
          gpuRenderer: preset.gpuRenderer,
          screenWidth: preset.screenWidth,
          screenHeight: preset.screenHeight,
          hardwareConcurrency: preset.hardwareConcurrency,
          deviceMemory: preset.deviceMemory,
        });
      }
    }
  };

  // GPU filtering by platform for advanced mode
  const currentPlatform = flags.platform || '';
  
  const rawGpuOptions = currentPlatform && GPU_BY_PLATFORM[currentPlatform]
    ? GPU_BY_PLATFORM[currentPlatform]
    : [...(GPU_BY_PLATFORM.windows || []), ...(GPU_BY_PLATFORM.macos || []), ...(GPU_BY_PLATFORM.linux || [])];
    
  const gpuOptions = Object.values(rawGpuOptions.reduce((acc, curr) => {
    if (!acc[curr.vendor]) acc[curr.vendor] = { vendor: curr.vendor, renderers: [] };
    acc[curr.vendor].renderers.push(...curr.renderers);
    return acc;
  }, {} as Record<string, { vendor: string, renderers: string[] }>));

  gpuOptions.forEach(opt => { opt.renderers = Array.from(new Set(opt.renderers)); });

  const rawScreenOptions = currentPlatform && SCREENS_BY_PLATFORM[currentPlatform]
    ? SCREENS_BY_PLATFORM[currentPlatform]
    : [...(SCREENS_BY_PLATFORM.windows || []), ...(SCREENS_BY_PLATFORM.macos || []), ...(SCREENS_BY_PLATFORM.linux || [])];

  const screenOptions = Object.values(rawScreenOptions.reduce((acc, curr) => {
    const key = `${curr.w}x${curr.h}`;
    if (!acc[key]) acc[key] = curr;
    return acc;
  }, {} as Record<string, typeof rawScreenOptions[0]>));

  // When GPU vendor changes in advanced, clear renderer if it doesn't match
  const handleGpuVendorChange = (vendor: string) => {
    const group = gpuOptions.find(g => g.vendor === vendor);
    const rendererValid = group?.renderers.includes(flags.gpuRenderer || '');
    onChange({
      ...flags,
      gpuVendor: vendor || undefined,
      gpuRenderer: rendererValid ? flags.gpuRenderer : undefined,
    });
  };

  // When platform changes in advanced, clear GPU if incompatible
  const handlePlatformChange = (platform: string) => {
    const newGpuOpts = platform && GPU_BY_PLATFORM[platform] ? GPU_BY_PLATFORM[platform] : [];
    const vendorValid = newGpuOpts.some(g => g.vendor === flags.gpuVendor);
    onChange({
      ...flags,
      platform: platform || undefined,
      gpuVendor: vendorValid ? flags.gpuVendor : undefined,
      gpuRenderer: vendorValid ? flags.gpuRenderer : undefined,
    });
  };

  const handleScreenChange = (val: string) => {
    if (!val) {
      onChange({ ...flags, screenWidth: undefined, screenHeight: undefined });
    } else {
      const [w, h] = val.split('x');
      onChange({ ...flags, screenWidth: w, screenHeight: h });
    }
  };

  const currentGpuGroup = gpuOptions.find(g => g.vendor === flags.gpuVendor);
  const availableRenderers = currentGpuGroup 
    ? currentGpuGroup.renderers 
    : Array.from(new Set(gpuOptions.flatMap(g => g.renderers)));
  const screenValue = flags.screenWidth && flags.screenHeight ? `${flags.screenWidth}x${flags.screenHeight}` : '';

  // CPU/RAM ranges by platform
  const cpuOptions = currentPlatform === 'macos'
    ? ['4', '8', '10', '12', '16', '24']
    : ['2', '4', '6', '8', '10', '12', '16', '24', '32'];
  const memOptions = ['2', '4', '8'];

  return (
    <div style={{
      marginTop: 12, padding: '14px',
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
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
          {t('profileForm.fingerprintSeedHint')}
        </div>
      </div>

      {/* Hardware Preset Dropdown */}
      <div className="form-group" style={{ marginBottom: 10 }}>
        <label style={labelStyle}>{t('profileForm.fingerprintPreset')}</label>
        <PresetDropdown value={presetValue} onChange={handlePresetChange} t={t} />
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
          {t('profileForm.fingerprintPresetHint')}
        </div>
      </div>

      {/* Advanced Toggle */}
      <div
        onClick={() => setShowAdvanced(!showAdvanced)}
        style={{
          fontSize: 11, color: '#0d9488', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4,
          marginBottom: showAdvanced ? 10 : 0,
          userSelect: 'none',
        }}
      >
        <ChevronRightIcon size={12} style={{ transform: showAdvanced ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
        {showAdvanced ? t('profileForm.fingerprintHideAdvanced') : t('profileForm.fingerprintShowAdvanced')}
      </div>

      {showAdvanced && (
        <div style={{
          padding: '10px', background: 'rgba(13, 148, 136, 0.04)',
          borderRadius: 6, border: '1px solid rgba(13, 148, 136, 0.15)',
        }}>
          {/* Platform + Brand */}
          <div className="form-row" style={{ gap: 8 }}>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label style={labelStyle}>{t('profileForm.fingerprintPlatform')}</label>
              <select value={flags.platform || ''} onChange={(e) => handlePlatformChange(e.target.value)} style={selectStyle}>
                <option value="">{t('profileForm.fingerprintAuto')}</option>
                <option value="windows">Windows</option>
                <option value="macos">macOS</option>
                <option value="linux">Linux</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label style={labelStyle}>{t('profileForm.fingerprintBrand')}</label>
              <select value={flags.brand || ''} onChange={(e) => update('brand', e.target.value)} style={selectStyle}>
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
              <select value={flags.gpuVendor || ''} onChange={(e) => handleGpuVendorChange(e.target.value)} style={selectStyle}>
                <option value="">{t('profileForm.fingerprintAuto')}</option>
                {gpuOptions.map((g, i) => (
                  <option key={`${g.vendor}-${i}`} value={g.vendor}>{g.vendor}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label style={labelStyle}>{t('profileForm.fingerprintGpuRenderer')}</label>
              <select value={flags.gpuRenderer || ''} onChange={(e) => update('gpuRenderer', e.target.value)} style={selectStyle}>
                <option value="">{t('profileForm.fingerprintAuto')}</option>
                {availableRenderers.map((r, i) => (
                  <option key={`${r}-${i}`} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Screen + CPU + Memory */}
          <div className="form-row" style={{ gap: 8 }}>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label style={labelStyle}>{t('profileForm.fingerprintScreenRes')}</label>
              <select value={screenValue} onChange={(e) => handleScreenChange(e.target.value)} style={selectStyle}>
                <option value="">{t('profileForm.fingerprintAuto')}</option>
                {screenOptions.map((r, i) => (
                  <option key={`${r.w}x${r.h}-${i}`} value={`${r.w}x${r.h}`}>{r.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label style={labelStyle}>{t('profileForm.fingerprintHardwareConcurrency')}</label>
              <select value={flags.hardwareConcurrency || ''} onChange={(e) => update('hardwareConcurrency', e.target.value)} style={selectStyle}>
                <option value="">{t('profileForm.fingerprintAuto')}</option>
                {cpuOptions.map((v, i) => (
                  <option key={`${v}-${i}`} value={v}>{v} cores</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label style={labelStyle}>{t('profileForm.fingerprintDeviceMemory')}</label>
              <select value={flags.deviceMemory || ''} onChange={(e) => update('deviceMemory', e.target.value)} style={selectStyle}>
                <option value="">{t('profileForm.fingerprintAuto')}</option>
                {memOptions.map((v, i) => (
                  <option key={`${v}-${i}`} value={v}>{v} GB</option>
                ))}
              </select>
            </div>
          </div>

          {/* Timezone + Locale */}
          <div className="form-row" style={{ gap: 8 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={labelStyle}>{t('profileForm.fingerprintTimezone')}</label>
              <select value={flags.timezone || ''} onChange={(e) => update('timezone', e.target.value)} style={selectStyle}>
                <option value="">{t('profileForm.fingerprintAuto')}</option>
                {TIMEZONES.map(tz => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={labelStyle}>{t('profileForm.fingerprintLocale')}</label>
              <select value={flags.locale || ''} onChange={(e) => update('locale', e.target.value)} style={selectStyle}>
                <option value="">{t('profileForm.fingerprintAuto')}</option>
                {LOCALES.map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* WebRTC IP — always visible */}
      <div className="form-group" style={{ marginBottom: 0, marginTop: 10 }}>
        <label style={labelStyle}>{t('profileForm.fingerprintWebrtcIp')}</label>
        <div className="form-row" style={{ gap: 8 }}>
          <select
            value={flags.webrtcIp === 'auto' ? 'auto' : flags.webrtcIp ? 'custom' : ''}
            onChange={(e) => {
              if (e.target.value === '') update('webrtcIp', '');
              else if (e.target.value === 'auto') update('webrtcIp', 'auto');
              else update('webrtcIp', '');
            }}
            style={{ ...selectStyle, maxWidth: 160 }}
          >
            <option value="">{t('profileForm.fingerprintWebrtcIpAuto')}</option>
            <option value="auto">{t('profileForm.fingerprintWebrtcIpProxy')}</option>
            <option value="custom">{t('profileForm.fingerprintWebrtcIpCustom')}</option>
          </select>
          {flags.webrtcIp && flags.webrtcIp !== 'auto' && (
            <input
              type="text"
              value={flags.webrtcIp}
              onChange={(e) => update('webrtcIp', e.target.value)}
              placeholder="1.2.3.4"
              style={{ fontSize: 12, flex: 1 }}
            />
          )}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
          {t('profileForm.fingerprintWebrtcIpHint')}
        </div>
      </div>
    </div>
  );
}

export type { FingerprintFlags };
