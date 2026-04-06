import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ProfileData } from '../types';
import { getAPI } from '../api';
import { PauseIcon, PlayIcon, EditIcon, CopyIcon, DownloadIcon, FileUpIcon, UploadIcon, CloudDownloadIcon, DatabaseIcon, LockIcon, TrashIcon } from './Icons';

const api = getAPI();

interface ContextMenuProps {
  x: number;
  y: number;
  profileId: string;
  profile: ProfileData;
  cloudSyncEnabled?: boolean;
  onClose: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onLaunch: (id: string) => void;
  onStop: (id: string) => void;
  onExportCookies: (id: string) => void;
  onImportCookies: (id: string) => void;
  onBackupProfile: (id: string) => void;
  onRestoreProfile: (id: string) => void;
  onCloneProfile: (id: string) => void;
  onSetPassword: (id: string) => void;
  onRemovePassword: (id: string) => void;
  onSyncUpload?: (profile: ProfileData) => void;
  onSyncRestore?: (profile: ProfileData) => void;
  onDirectSyncToCloud?: (id: string) => void;
  onDirectSyncFromCloud?: (id: string) => void;
}

export default function ContextMenu({
  x,
  y,
  profileId,
  profile,
  cloudSyncEnabled,
  onClose,
  onEdit,
  onDelete,
  onLaunch,
  onStop,
  onExportCookies,
  onImportCookies,
  onBackupProfile,
  onRestoreProfile,
  onCloneProfile,
  onSetPassword,
  onRemovePassword,
  onSyncUpload,
  onSyncRestore,
  onDirectSyncToCloud,
  onDirectSyncFromCloud,
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
          <PauseIcon />
          {t('profiles.contextMenu.closeBrowser')}
        </button>
      ) : (
        <button className="context-menu-item" onClick={() => onLaunch(profileId)}>
          <PlayIcon />
          {t('profiles.contextMenu.openBrowser')}
        </button>
      )}

      <div className="context-menu-divider" />

      <button className="context-menu-item" onClick={() => onEdit(profileId)}>
        <EditIcon />
        {t('profiles.contextMenu.edit')}
      </button>

      <button className="context-menu-item" onClick={() => copyToClipboard(profileId)}>
        <CopyIcon />
        {t('profiles.contextMenu.copyId')}
      </button>

      <button className="context-menu-item" onClick={() => copyToClipboard(profile.name)}>
        <CopyIcon />
        {t('profiles.contextMenu.copyName')}
      </button>

      <button className="context-menu-item" onClick={() => onCloneProfile(profileId)}>
        <CopyIcon />
        {t('profiles.contextMenu.cloneProfile')}
      </button>

      <div className="context-menu-divider" />

      <button className="context-menu-item" onClick={() => onImportCookies(profileId)}>
        <DownloadIcon />
        {t('profiles.contextMenu.importCookies')}
      </button>

      <button className="context-menu-item" onClick={() => onExportCookies(profileId)}>
        <FileUpIcon />
        {t('profiles.contextMenu.exportCookies')}
      </button>

      <div className="context-menu-divider" />

      <button className="context-menu-item" onClick={() => onBackupProfile(profileId)}>
        <FileUpIcon />
        {t('profiles.contextMenu.backupData')}
      </button>

      <button className="context-menu-item" onClick={() => onRestoreProfile(profileId)}>
        <DownloadIcon />
        {t('profiles.contextMenu.restoreData')}
      </button>

      <div className="context-menu-divider" />

      {/* Cloud Sync — only shown when a provider is configured */}
      {cloudSyncEnabled && (
        <>
          <button className="context-menu-item" onClick={() => onDirectSyncToCloud?.(profileId)}>
            <UploadIcon />
            {t('profiles.contextMenu.syncToCloud')}
          </button>

          <button className="context-menu-item" onClick={() => onDirectSyncFromCloud?.(profileId)}>
            <CloudDownloadIcon />
            {t('profiles.contextMenu.syncFromCloud')}
          </button>

          <button className="context-menu-item" onClick={() => { onSyncUpload?.(profile); onClose(); }}>
            <DatabaseIcon style={{ opacity: 0.6 }} />
            {t('profiles.contextMenu.manageCloudBackups')}
          </button>

          <div className="context-menu-divider" />
        </>
      )}

      {profile.has_password ? (
        <button className="context-menu-item" onClick={() => onRemovePassword(profileId)}>
          <LockIcon />
          {t('profiles.contextMenu.removePassword')}
        </button>
      ) : (
        <button className="context-menu-item" onClick={() => onSetPassword(profileId)}>
          <LockIcon />
          {t('profiles.contextMenu.setPassword')}
        </button>
      )}

      <div className="context-menu-divider" />

      <button className="context-menu-item danger" onClick={() => onDelete(profileId)}>
        <TrashIcon />
        {t('profiles.contextMenu.deleteProfile')}
      </button>
    </div>
  );
}
