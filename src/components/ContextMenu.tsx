import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ProfileData } from '../types';
import { getAPI } from '../api';

const api = getAPI();

interface ContextMenuProps {
  x: number;
  y: number;
  profileId: string;
  profile: ProfileData;
  onClose: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onLaunch: (id: string) => void;
  onStop: (id: string) => void;
  onExportCookies: (id: string) => void;
  onImportCookies: (id: string) => void;
  onBackupProfile: (id: string) => void;
  onRestoreProfile: (id: string) => void;
}

export default function ContextMenu({
  x,
  y,
  profileId,
  profile,
  onClose,
  onEdit,
  onDelete,
  onLaunch,
  onStop,
  onExportCookies,
  onImportCookies,
  onBackupProfile,
  onRestoreProfile,
}: ContextMenuProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  // Adjust menu position if it goes off screen
  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - 300);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    onClose();
  };

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {profile.status === 'running' ? (
        <button className="context-menu-item" onClick={() => onStop(profileId)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
          {t('profiles.contextMenu.closeBrowser')}
        </button>
      ) : (
        <button className="context-menu-item" onClick={() => onLaunch(profileId)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5,3 19,12 5,21" />
          </svg>
          {t('profiles.contextMenu.openBrowser')}
        </button>
      )}

      <div className="context-menu-divider" />

      <button className="context-menu-item" onClick={() => onEdit(profileId)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        {t('profiles.contextMenu.edit')}
      </button>

      <button className="context-menu-item" onClick={() => copyToClipboard(profileId)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        {t('profiles.contextMenu.copyId')}
      </button>

      <button className="context-menu-item" onClick={() => copyToClipboard(profile.name)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        {t('profiles.contextMenu.copyName')}
      </button>

      <div className="context-menu-divider" />

      <button className="context-menu-item" onClick={() => onImportCookies(profileId)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7,10 12,15 17,10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {t('profiles.contextMenu.importCookies')}
      </button>

      <button className="context-menu-item" onClick={() => onExportCookies(profileId)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17,8 12,3 7,8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        {t('profiles.contextMenu.exportCookies')}
      </button>

      <div className="context-menu-divider" />

      <button className="context-menu-item" onClick={() => onBackupProfile(profileId)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        {t('profiles.contextMenu.backupData')}
      </button>

      <button className="context-menu-item" onClick={() => onRestoreProfile(profileId)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {t('profiles.contextMenu.restoreData')}
      </button>

      <div className="context-menu-divider" />

      <button className="context-menu-item danger" onClick={() => onDelete(profileId)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="3,6 5,6 21,6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
        {t('profiles.contextMenu.deleteProfile')}
      </button>
    </div>
  );
}
