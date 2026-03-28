import { useState, useEffect } from 'react';
import { getAPI } from '../api';
import { useTranslation } from 'react-i18next';

const api = getAPI();

interface TitleBarProps {
  onOpenSettings?: () => void;
}

export default function TitleBar({ onOpenSettings }: TitleBarProps) {
  const { t, i18n } = useTranslation();
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    api.getPlatform().then((p: string) => setIsMac(p === 'darwin'));
  }, []);

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'en' ? 'vi' : 'en';
    i18n.changeLanguage(nextLang);
    localStorage.setItem('language', nextLang);
  };

  return (
    <div className={`titlebar${isMac ? ' darwin' : ''}`}>
      {/* On macOS: left spacer for native traffic lights */}
      {isMac && <div className="titlebar-traffic-spacer" />}

      {/* Title — always visible, centered on macOS */}
      <div className="titlebar-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 12h8M12 8v8" />
        </svg>
        <span>EzProfile</span>
      </div>

      <div className="titlebar-controls">
        <button className="titlebar-btn" onClick={toggleLanguage} title={i18n.language === 'vi' ? 'English' : 'Tiếng Việt'} style={{ fontSize: '11px', fontWeight: 'bold' }}>
          {i18n.language === 'vi' ? 'EN' : 'VI'}
        </button>
        {onOpenSettings && (
          <button className="titlebar-btn" onClick={onOpenSettings} title={t('app.settings')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
        )}
        {/* Window control buttons — only on non-macOS */}
        {!isMac && (
          <>
            <button className="titlebar-btn" onClick={() => api.minimizeWindow()} title={t('app.minimize')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14" />
              </svg>
            </button>
            <button className="titlebar-btn" onClick={() => api.maximizeWindow()} title={t('app.maximize')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
            </button>
            <button className="titlebar-btn close" onClick={() => api.closeWindow()} title={t('app.close')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
