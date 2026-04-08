import { useState, useEffect, useRef, useCallback } from 'react';
import { getAPI } from '../api';
import { useTranslation } from 'react-i18next';
import { LogoIcon, GlobeIcon, SettingsIcon, MinusIcon, SquareIcon, XIcon, CheckIcon } from './Icons';

const api = getAPI();

const LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'vi', label: 'Tiếng Việt', short: 'VI' },
  { code: 'fr', label: 'Français', short: 'FR' },
  { code: 'zh', label: '中文', short: 'ZH' },
];

interface TitleBarProps {
  onOpenSettings?: () => void;
}

export default function TitleBar({ onOpenSettings }: TitleBarProps) {
  const { t, i18n } = useTranslation();
  const [isMac, setIsMac] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getPlatform().then((p: string) => setIsMac(p === 'darwin'));
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!langOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [langOpen]);

  const selectLanguage = useCallback((code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem('language', code);
    setLangOpen(false);
  }, [i18n]);

  const currentLang = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0];

  return (
    <div className={`titlebar${isMac ? ' darwin' : ''}`}>
      {isMac && <div className="titlebar-traffic-spacer" />}

      <div className="titlebar-title">
        <LogoIcon size={16} />
        <span>EzProfile</span>
      </div>

      <div className="titlebar-controls">
        {/* Language picker */}
        <div className="lang-picker" ref={langRef}>
          <button
            className="titlebar-btn lang-trigger"
            onClick={() => setLangOpen(v => !v)}
          >
            <GlobeIcon size={14} />
            <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 2 }}>{currentLang.short}</span>
          </button>

          {langOpen && (
            <div className="lang-dropdown">
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  className={`lang-option${lang.code === i18n.language ? ' active' : ''}`}
                  onClick={() => selectLanguage(lang.code)}
                >
                  <span className="lang-option-code">{lang.short}</span>
                  <span className="lang-option-label">{lang.label}</span>
                  {lang.code === i18n.language && (
                    <CheckIcon className="lang-check" strokeWidth={2.5} size={16} />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {onOpenSettings && (
          <button className="titlebar-btn" onClick={onOpenSettings} title={t('app.settings')}>
            <SettingsIcon size={16} />
          </button>
        )}
        {!isMac && (
          <>
            <button className="titlebar-btn" onClick={() => api.minimizeWindow()} title={t('app.minimize')}>
              <MinusIcon size={16} />
            </button>
            <button className="titlebar-btn" onClick={() => api.maximizeWindow()} title={t('app.maximize')}>
              <SquareIcon size={16} />
            </button>
            <button className="titlebar-btn close" onClick={() => api.closeWindow()} title={t('app.close')}>
              <XIcon size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
