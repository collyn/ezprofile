import { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ProfileData, CreateProfileInput, GroupData } from '../types';
import CreateProfileModal from '../components/CreateProfileModal';
import EditProfileModal from '../components/EditProfileModal';
import ContextMenu from '../components/ContextMenu';
import GroupManagerModal from '../components/GroupManagerModal';
import BatchAssignGroupModal from '../components/BatchAssignGroupModal';
import BatchAssignProxyModal from '../components/BatchAssignProxyModal';
import BrowserVersionModal from '../components/BrowserVersionModal';
import ProxyManagerModal from '../components/ProxyManagerModal';
import SyncProfileModal from '../components/SyncProfileModal';
import { PassphrasePromptModal } from '../components/PassphrasePromptModal';
import GridLaunchModal from '../components/GridLaunchModal';
import { getAPI } from '../api';
import { useDialog } from '../contexts/DialogContext';
import { useToast } from '../contexts/ToastContext';
import { PlusIcon, GridIcon, ChromeIcon, ShieldIcon, DownloadIcon, FileUpIcon, SpinnerIcon, SearchIcon, UsersIcon, UploadIcon, CloudDownloadIcon, TrashIcon, EmptyStateIcon, MoreVerticalIcon, LockIcon, LayoutGridIcon, StopCircleIcon, ToggleRightIcon, ToggleLeftIcon } from '../components/Icons';
import CountryFlag, { countryCodeToFlag } from '../components/CountryFlag';

interface ProfileListProps {
  profiles: ProfileData[];
  groups: GroupData[];
  loading: boolean;
  onRefreshGroups: () => Promise<void>;
  onCreateProfile: (input: CreateProfileInput) => Promise<void>;
  onUpdateProfile: (id: string, input: Partial<CreateProfileInput>) => Promise<void>;
  onUpdateProfiles: (ids: string[], input: Partial<CreateProfileInput>) => Promise<void>;
  onExportProfiles: (ids?: string[]) => Promise<void>;
  onImportProfiles: () => Promise<void>;
  onExportCookies: (id: string) => void | Promise<void>;
  onImportCookies: (id: string) => void | Promise<void>;
  onDeleteProfile: (id: string) => Promise<void>;
  onDeleteProfiles: (ids: string[]) => Promise<void>;
  onLaunchProfile: (id: string, bounds?: any) => void | Promise<void>;
  onStopProfile: (id: string) => void | Promise<void>;
  onBackupProfile: (id: string) => void | Promise<void>;
  onRestoreProfile: (id: string) => void | Promise<void>;
  onCloneProfile: (id: string) => void | Promise<void>;
  onSetPassword: (id: string) => void;
  onRemovePassword: (id: string) => void;
}

function formatTimeAgo(dateStr: string | null, t: any, lang: string): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr + 'Z');
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return t('profiles.timeJustNow');
  if (diff < 3600) return t('profiles.timeMinutes', { count: Math.floor(diff / 60) });
  if (diff < 86400) return t('profiles.timeHours', { count: Math.floor(diff / 3600) });
  if (diff < 604800) return t('profiles.timeDays', { count: Math.floor(diff / 86400) });
  return date.toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US');
}

export default function ProfileList({
  profiles,
  groups,
  loading,
  onRefreshGroups,
  onCreateProfile,
  onUpdateProfile,
  onUpdateProfiles,
  onExportProfiles,
  onImportProfiles,
  onExportCookies,
  onImportCookies,
  onDeleteProfile,
  onDeleteProfiles,
  onLaunchProfile,
  onStopProfile,
  onBackupProfile,
  onRestoreProfile,
  onCloneProfile,
  onSetPassword,
  onRemovePassword,
}: ProfileListProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [showBatchGroupModal, setShowBatchGroupModal] = useState(false);
  const [showBatchProxyModal, setShowBatchProxyModal] = useState(false);
  const [showBrowserVersionModal, setShowBrowserVersionModal] = useState(false);
  const [showGridLaunchModal, setShowGridLaunchModal] = useState(false);
  const [showProxyManager, setShowProxyManager] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ProfileData | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    profileId: string;
  } | null>(null);
  const [syncModal, setSyncModal] = useState<{
    profile: ProfileData;
    tab: 'upload' | 'restore';
  } | null>(null);
  const dialog = useDialog();
  const { addToast } = useToast();
  const [pendingPassphraseAction, setPendingPassphraseAction] = useState<(() => Promise<void>) | null>(null);
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [isSyncing, setIsSyncing] = useState(false);
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(false);
  const [savedProxies, setSavedProxies] = useState<any[]>([]);

  const fetchProxies = async () => {
    try {
      const data = await getAPI().getProxies();
      setSavedProxies(data);
    } catch (err) {
      console.error('Failed to fetch proxies:', err);
    }
  };

  useEffect(() => {
    fetchProxies();
    if (getAPI().onProxyUpdated) {
      getAPI().onProxyUpdated(() => {
        fetchProxies();
      });
    }
  }, []);

  // Check if cloud sync provider is configured
  useEffect(() => {
    (async () => {
      try {
        const settings = await getAPI().syncGetSettings();
        setCloudSyncEnabled(!!settings.provider);
      } catch {}
    })();
  }, []);

  // Debounced search handler
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(value), 150);
  }, []);

  // Precompute group color map to avoid .find() per row
  const groupColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const g of groups) {
      map[g.name] = g.color;
    }
    return map;
  }, [groups]);

  // Filter & sort profiles
  const filteredProfiles = useMemo(() => {
    let result = profiles;

    // Search filter (uses debounced value)
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.notes && p.notes.toLowerCase().includes(q)) ||
          (p.group_name && p.group_name.toLowerCase().includes(q))
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      let aVal: any = (a as any)[sortField];
      let bVal: any = (b as any)[sortField];
      if (aVal === null || aVal === undefined) aVal = '';
      if (bVal === null || bVal === undefined) bVal = '';
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [profiles, debouncedSearch, sortField, sortDir]);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredProfiles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProfiles.map((p) => p.id)));
    }
  }, [filteredProfiles, selectedIds.size]);

  // Keyboard shortcuts: Ctrl/Cmd+A = select all, Esc = deselect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in an input/textarea/select
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        handleSelectAll();
      }
      if (e.key === 'Escape') {
        setSelectedIds(new Set());
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleSelectAll]);

  const handleSelectOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSort = useCallback((field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }, [sortField]);

  const handleContextMenu = useCallback((e: React.MouseEvent, profileId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, profileId });
  }, []);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    await onDeleteProfiles(Array.from(selectedIds));
    setSelectedIds(new Set());
  }, [selectedIds, onDeleteProfiles]);

  const handleBatchStop = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const idsToStop = profiles.filter(p => selectedIds.has(p.id) && p.status === 'running').map(p => p.id);
    if (idsToStop.length === 0) return;
    for (const id of idsToStop) {
      await onStopProfile(id);
    }
  }, [selectedIds, profiles, onStopProfile]);

  const handleStopAll = useCallback(async () => {
    const idsToStop = profiles.filter(p => p.status === 'running').map(p => p.id);
    if (idsToStop.length === 0) return;
    for (const id of idsToStop) {
      await onStopProfile(id);
    }
  }, [profiles, onStopProfile]);

  const handleBatchSyncToCloud = useCallback(async (ids?: string[]) => {
    const targetIds = ids || Array.from(selectedIds);
    if (targetIds.length === 0) return;
    
    // Validate passphrase first
    const hasPassphrase = await getAPI().syncHasPassphrase();
    if (!hasPassphrase) {
      setPendingPassphraseAction(() => () => handleBatchSyncToCloud(targetIds));
      return;
    }

    setIsSyncing(true);
    addToast('info', t('cloudSync.toastSyncingToCloud', { count: targetIds.length }));
    let success = 0;
    for (let i = 0; i < targetIds.length; i++) {
        const res = await getAPI().syncUploadProfile(targetIds[i]);
        if (res.success) {
           success++;
        } else {
           addToast('error', t('cloudSync.toastSyncFailed', { error: res.error }));
        }
    }
    if (success > 0) addToast('success', t('cloudSync.toastSyncedToCloud', { success, total: targetIds.length }));
    setIsSyncing(false);
    setSelectedIds(new Set());
  }, [selectedIds, addToast]);

  const handleBatchSyncFromCloud = useCallback(async (ids?: string[]) => {
    const targetIds = ids || Array.from(selectedIds);
    if (targetIds.length === 0) return;
    
    // Validate passphrase first
    const hasPassphrase = await getAPI().syncHasPassphrase();
    if (!hasPassphrase) {
      setPendingPassphraseAction(() => () => handleBatchSyncFromCloud(targetIds));
      return;
    }

    const isConfirmed = await dialog.confirm(t('cloudSync.syncFromCloudConfirm'));
    if (!isConfirmed) return;

    setIsSyncing(true);
    addToast('info', t('cloudSync.toastSyncingFromCloud', { count: targetIds.length }));
    try {
      const allBackups = await getAPI().syncListBackups();
      let success = 0;
      for (let i = 0; i < targetIds.length; i++) {
        const id = targetIds[i];
        const profileBackups = allBackups
          .filter((b: any) => b.profileId === id)
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        if (profileBackups.length > 0) {
          const res = await getAPI().syncDownloadProfile(id, profileBackups[0].id);
          if (res.success) {
            success++;
          } else {
            addToast('error', t('cloudSync.toastSyncFailed', { error: res.error }));
          }
        } else {
           addToast('error', t('cloudSync.toastNoBackup', { id }));
        }
      }
      if (success > 0) addToast('success', t('cloudSync.toastSyncedFromCloud', { success, total: targetIds.length }));
    } catch (e: any) {
      addToast('error', t('cloudSync.toastSyncError', { error: e.message }));
    }
    setIsSyncing(false);
    setSelectedIds(new Set());
  }, [selectedIds, addToast]);

  const handleGridLaunch = useCallback(async (cols: number, rows: number, padding: number = 0) => {
    const idsToLaunch = Array.from(selectedIds);
    if (idsToLaunch.length === 0) return;

    setShowGridLaunchModal(false);
    
    const dpr = window.devicePixelRatio || 1;
    
    // Use availLeft and availTop for multi-monitor setups
    const screenX = ('availLeft' in window.screen ? (window.screen as any).availLeft : 0) * dpr;
    const screenY = ('availTop' in window.screen ? (window.screen as any).availTop : 0) * dpr;
    
    const screenWidth = window.screen.availWidth * dpr;
    const screenHeight = window.screen.availHeight * dpr;

    const windowWidth = Math.floor(screenWidth / cols);
    const windowHeight = Math.floor(screenHeight / rows);

    for (let i = 0; i < idsToLaunch.length; i++) {
      const id = idsToLaunch[i];
      const col = i % cols;
      const row = Math.floor(i / cols);

      const bounds = {
        x: (screenX + (col * windowWidth)) - padding,
        y: (screenY + (row * windowHeight)) - padding,
        width: windowWidth + (padding * 2),
        height: windowHeight + (padding * 2),
      };

      onLaunchProfile(id, bounds);
    }
    
    setSelectedIds(new Set());
  }, [selectedIds, onLaunchProfile]);

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return (
      <span style={{ marginLeft: 4, fontSize: 10 }}>
        {sortDir === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div className="page-title">
          <h1>{t('profiles.title')}</h1>
          <span className="count">({profiles.length})</span>
        </div>

        <div className="toolbar">
          <div className="toolbar-group">
            <button className="btn btn-success" onClick={() => setShowCreateModal(true)}>
              <PlusIcon />
              {t('profiles.addNew')}
            </button>
            <button className="btn" onClick={() => setShowGroupManager(true)}>
              <GridIcon />
              {t('profiles.manageGroups')}
            </button>
            <button className="btn" onClick={() => setShowBrowserVersionModal(true)}>
              <ChromeIcon />
              {t('profiles.manageChrome')}
            </button>
            <button className="btn" onClick={() => setShowProxyManager(true)}>
              <ShieldIcon />
              {t('profiles.manageProxies')}
            </button>
            <div className="toolbar-separator" />
            <button className="btn" onClick={() => onImportProfiles()}>
              <DownloadIcon />
              {t('profiles.importExcelJson')}
            </button>
            <button className="btn" onClick={() => onExportProfiles()}>
              <FileUpIcon />
              {t('profiles.exportAll')}
            </button>
            {profiles.some(p => p.status === 'running') && (
              <button className="btn" onClick={handleStopAll}>
                <StopCircleIcon />
                {t('profiles.closeAll', 'Close All')}
              </button>
            )}
          </div>

          {isSyncing && (
            <div style={{
              marginLeft: 10, padding: '4px 10px', fontSize: 12, fontWeight: 500,
              background: 'rgba(66,133,244,0.1)', color: '#4285f4', borderRadius: 4,
              border: '1px solid rgba(66,133,244,0.2)', display: 'flex', alignItems: 'center', gap: 6
            }}>
              <SpinnerIcon size={12} />
              {t('profiles.syncing')}
            </div>
          )}

          <div className="toolbar-separator" />

          <div className="search-box">
            <SearchIcon />
            <input
              type="text"
              placeholder={t('profiles.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
        </div>

        {/* Batch Actions Row 1 */}
        {selectedIds.size > 0 && (
          <div className="toolbar" style={{ marginTop: '4px' }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {t('profiles.selectedCount', { count: selectedIds.size })}
            </span>
            <div className="toolbar-separator" />
            <button className="btn btn-outline btn-sm" onClick={() => setShowBatchGroupModal(true)}>
              <UsersIcon />
              {t('profiles.assignGroup')}
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => setShowBatchProxyModal(true)}>
              <ShieldIcon />
              {t('profiles.assignProxy')}
            </button>
            <button className="btn btn-outline btn-sm" onClick={async () => {
              await onUpdateProfiles(Array.from(selectedIds), { proxy_enabled: 1 });
            }}>
              <ToggleRightIcon />
              {t('profiles.enableProxy', 'Enable Proxy')}
            </button>
            <button className="btn btn-outline btn-sm" onClick={async () => {
              await onUpdateProfiles(Array.from(selectedIds), { proxy_enabled: 0 });
            }}>
              <ToggleLeftIcon />
              {t('profiles.disableProxy', 'Disable Proxy')}
            </button>
            {Array.from(selectedIds).some(id => profiles.find(p => p.id === id)?.status === 'running') && (
              <button className="btn btn-outline btn-sm" onClick={handleBatchStop}>
                <StopCircleIcon />
                {t('profiles.closeSelected', 'Close Selected')}
              </button>
            )}
            <button className="btn btn-outline btn-sm" onClick={() => onExportProfiles(Array.from(selectedIds))}>
              <FileUpIcon />
              {t('profiles.export')}
            </button>
            {cloudSyncEnabled && (
              <>
                <div className="toolbar-separator" />
                <button className="btn btn-outline btn-sm" disabled={isSyncing} onClick={() => handleBatchSyncToCloud()}>
                    <UploadIcon />
                  {t('profiles.syncToCloud')}
                </button>
                <button className="btn btn-outline btn-sm" disabled={isSyncing} onClick={() => handleBatchSyncFromCloud()}>
                    <CloudDownloadIcon />
                  {t('profiles.syncFromCloud')}
                </button>
              </>
            )}
          </div>
        )}

        {/* Batch Actions Row 2 */}
        {selectedIds.size > 0 && (
          <div className="toolbar" style={{ marginTop: '4px' }}>
            <button className="btn btn-success btn-sm" onClick={() => setShowGridLaunchModal(true)}>
              <LayoutGridIcon />
              {t('profiles.gridLaunch.button', 'Grid Launch')}
            </button>
            <button className="btn btn-danger btn-sm" onClick={handleBatchDelete}>
              <TrashIcon />
              {t('profiles.delete')}
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="table-container">
        {loading ? (
          <div className="empty-state">
            <p>{t('profiles.loading')}</p>
          </div>
        ) : filteredProfiles.length === 0 ? (
          <div className="empty-state">
            <EmptyStateIcon size={24} />
            <h3>{t('profiles.emptyStateTitle')}</h3>
            <p>{t('profiles.emptyStateDesc')}</p>
            <button className="btn btn-success" onClick={() => setShowCreateModal(true)}>
              <PlusIcon />
              {t('profiles.createProfile')}
            </button>
          </div>
        ) : (
          <table className="profile-table">
            <thead>
              <tr>
                <th>
                  <div className="checkbox">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredProfiles.length && filteredProfiles.length > 0}
                      onChange={handleSelectAll}
                    />
                  </div>
                </th>
                <th onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>
                  {t('profiles.table.name')} <SortIcon field="name" />
                </th>
                <th onClick={() => handleSort('status')} style={{ cursor: 'pointer' }}>
                  {t('profiles.table.status')} <SortIcon field="status" />
                </th>
                <th>{t('profiles.table.proxy')}</th>
                <th onClick={() => handleSort('last_run_at')} style={{ cursor: 'pointer' }}>
                  {t('profiles.table.lastRun')} <SortIcon field="last_run_at" />
                </th>
                <th onClick={() => handleSort('group_name')} style={{ cursor: 'pointer' }}>
                  {t('profiles.table.group')} <SortIcon field="group_name" />
                </th>
                <th onClick={() => handleSort('browser_version')} style={{ cursor: 'pointer' }}>
                  {t('profiles.table.version')} <SortIcon field="browser_version" />
                </th>
                <th>{t('profiles.table.notes')}</th>
                <th style={{ width: 120, textAlign: 'center' }}></th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
               {filteredProfiles.map((profile) => (
                <ProfileRow
                  key={profile.id}
                  profile={profile}
                  isSelected={selectedIds.has(profile.id)}
                  groupColor={profile.group_name ? groupColorMap[profile.group_name] : undefined}
                  savedProxies={savedProxies}
                  onSelect={handleSelectOne}
                  onContextMenu={handleContextMenu}
                  onLaunch={onLaunchProfile}
                  onStop={onStopProfile}
                  onToggleProxy={(id, enabled) => onUpdateProfile(id, { proxy_enabled: enabled ? 1 : 0 })}
                  onChangeProxy={(id, p) => onUpdateProfile(id, p)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateProfileModal
          groups={groups}
          onClose={() => setShowCreateModal(false)}
          onCreate={onCreateProfile}
        />
      )}

      {/* Edit Modal */}
      {editingProfile && (
        <EditProfileModal
          groups={groups}
          profile={editingProfile}
          onClose={() => setEditingProfile(null)}
          onSave={onUpdateProfile}
        />
      )}

      {/* Group Manager Modal */}
      {showGroupManager && (
        <GroupManagerModal
          groups={groups}
          onClose={() => setShowGroupManager(false)}
          onRefresh={onRefreshGroups}
        />
      )}

      {/* Batch Assign Group Modal */}
      {showBatchGroupModal && (
        <BatchAssignGroupModal
          groups={groups}
          selectedCount={selectedIds.size}
          onClose={() => setShowBatchGroupModal(false)}
          onSave={async (groupName) => {
            await onUpdateProfiles(Array.from(selectedIds), { group_name: groupName || undefined });
            setShowBatchGroupModal(false);
          }}
        />
      )}

      {/* Batch Assign Proxy Modal */}
      {showBatchProxyModal && (
        <BatchAssignProxyModal
          selectedCount={selectedIds.size}
          onClose={() => setShowBatchProxyModal(false)}
          onSave={async (proxyData) => {
            const data: Partial<CreateProfileInput> = {
              proxy_type: proxyData.proxy_type || undefined,
              proxy_host: proxyData.proxy_host || undefined,
              proxy_port: proxyData.proxy_port || undefined,
              proxy_user: proxyData.proxy_user || undefined,
              proxy_pass: proxyData.proxy_pass || undefined,
            };
            // If the user explicitly sets to null, the backend or update wrapper needs to handle it.
            // CreateProfileInput has proxy fields as optional strings/numbers so undefined is omitted.
            await onUpdateProfiles(Array.from(selectedIds), proxyData as any);
            setShowBatchProxyModal(false);
          }}
        />
      )}

      {/* Grid Launch Modal */}
      {showGridLaunchModal && (
        <GridLaunchModal
          selectedCount={selectedIds.size}
          onClose={() => setShowGridLaunchModal(false)}
          onLaunch={handleGridLaunch}
        />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          profileId={contextMenu.profileId}
          profile={profiles.find((p) => p.id === contextMenu.profileId)!}
          cloudSyncEnabled={cloudSyncEnabled}
          onClose={() => setContextMenu(null)}
          onEdit={(id: string) => {
            const profile = profiles.find((p) => p.id === id);
            if (profile) setEditingProfile(profile);
            setContextMenu(null);
          }}
          onDelete={(id: string) => {
            onDeleteProfile(id);
            setContextMenu(null);
          }}
          onLaunch={(id: string) => {
            onLaunchProfile(id);
            setContextMenu(null);
          }}
          onStop={(id: string) => {
            onStopProfile(id);
            setContextMenu(null);
          }}
          onExportCookies={(id: string) => {
            onExportCookies(id);
            setContextMenu(null);
          }}
          onImportCookies={(id: string) => {
            onImportCookies(id);
            setContextMenu(null);
          }}
          onBackupProfile={(id: string) => {
            onBackupProfile(id);
            setContextMenu(null);
          }}
          onRestoreProfile={(id: string) => {
            onRestoreProfile(id);
            setContextMenu(null);
          }}
          onCloneProfile={(id: string) => {
            onCloneProfile(id);
            setContextMenu(null);
          }}
          onSetPassword={(id: string) => {
            onSetPassword(id);
            setContextMenu(null);
          }}
          onRemovePassword={(id: string) => {
            onRemovePassword(id);
            setContextMenu(null);
          }}
          onSyncUpload={(profile: ProfileData) => {
            setSyncModal({ profile, tab: 'upload' });
            setContextMenu(null);
          }}
          onSyncRestore={(profile: ProfileData) => {
            setSyncModal({ profile, tab: 'restore' });
            setContextMenu(null);
          }}
          onDirectSyncToCloud={(id: string) => {
            handleBatchSyncToCloud([id]);
            setContextMenu(null);
          }}
          onDirectSyncFromCloud={(id: string) => {
            handleBatchSyncFromCloud([id]);
            setContextMenu(null);
          }}
        />
      )}

      {showBrowserVersionModal && (
        <BrowserVersionModal onClose={() => setShowBrowserVersionModal(false)} />
      )}

      {showProxyManager && (
        <ProxyManagerModal onClose={() => setShowProxyManager(false)} />
      )}

      {/* Cloud Sync Modal */}
      {syncModal && (
        <SyncProfileModal
          profile={syncModal.profile}
          initialTab={syncModal.tab}
          onClose={() => setSyncModal(null)}
        />
      )}

      {/* Passphrase Prompt Modal */}
      {pendingPassphraseAction && (
        <PassphrasePromptModal
          onCancel={() => setPendingPassphraseAction(null)}
          onComplete={() => {
            const action = pendingPassphraseAction;
            setPendingPassphraseAction(null);
            action();
          }}
        />
      )}
    </>
  );
}

// Memoized table row — only re-renders when this profile's data or selection changes
const ProfileRow = memo(function ProfileRow({
  profile,
  isSelected,
  groupColor,
  savedProxies,
  onSelect,
  onContextMenu,
  onLaunch,
  onStop,
  onToggleProxy,
  onChangeProxy,
}: {
  profile: ProfileData;
  isSelected: boolean;
  groupColor?: string;
  savedProxies: any[];
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onLaunch: (id: string) => void;
  onStop: (id: string) => void;
  onToggleProxy: (id: string, enabled: boolean) => void;
  onChangeProxy: (id: string, p: Partial<CreateProfileInput>) => void;
}) {
  const { t, i18n } = useTranslation();

  // Deduce selected proxy ID if it perfectly matches a saved proxy
  const currentProxyId = profile.proxy_host 
    ? savedProxies.find(p => p.host === profile.proxy_host && p.port === profile.proxy_port)?.id || ""
    : "";

  return (
    <tr
      className={`${isSelected ? 'selected' : ''} ${profile.status === 'running' ? 'running' : ''}`}
      onContextMenu={(e) => onContextMenu(e, profile.id)}
      onClick={() => {
        if (profile.status === 'running') {
          window.electronAPI.focusProfile(profile.id);
        }
      }}
    >
      <td>
        <div className="checkbox" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onSelect(profile.id)}
          />
        </div>
      </td>
      <td>
        <span style={{ fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {profile.has_password && (
            <LockIcon size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          )}
          {profile.name}
        </span>
      </td>
      <td>
        <div className="status-badge">
          <span className={`status-dot ${profile.status}`} />
          {profile.status === 'running' ? t('profiles.statusRunning') : t('profiles.statusReady')}
        </div>
      </td>
      <td>
        <div className="proxy-badge" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            onClick={(e) => { 
              e.stopPropagation(); 
              if (profile.status === 'running') return;
              onToggleProxy(profile.id, !profile.proxy_enabled); 
            }}
            style={{
              width: 26, height: 14, borderRadius: 7, position: 'relative', 
              cursor: profile.status === 'running' ? 'not-allowed' : 'pointer', 
              opacity: profile.status === 'running' ? 0.6 : 1,
              flexShrink: 0,
              background: profile.proxy_enabled ? '#34a853' : 'var(--border-color)', transition: 'background 0.2s',
            }}
            title={profile.status === 'running' ? t('profileForm.proxyRunningNote', 'Cannot change while running') : (profile.proxy_enabled ? t('profiles.proxyOn') : t('profiles.proxyOff'))}
          >
            <div style={{
              width: 10, height: 10, borderRadius: '50%', background: '#fff', position: 'absolute',
              top: 2, left: profile.proxy_enabled ? 14 : 2, transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
            }} />
          </div>
          {profile.proxy_enabled ? (
            <>
              <select
              value={currentProxyId}
              onChange={(e) => {
                const val = e.target.value;
                const p = savedProxies.find(x => x.id === val);
                if (p) {
                   onChangeProxy(profile.id, {
                     proxy_type: p.type,
                     proxy_host: p.host,
                     proxy_port: p.port,
                     proxy_user: p.username || undefined,
                     proxy_pass: p.password || undefined
                   });
                }
              }}
              disabled={profile.status === 'running'}
              style={{ 
                fontSize: 11, 
                background: 'var(--bg-secondary)', 
                color: 'var(--text-primary)', 
                border: '1px solid var(--border-color)', 
                borderRadius: 4, 
                padding: '3px 6px', 
                maxWidth: '180px',
                outline: 'none',
                cursor: profile.status === 'running' ? 'not-allowed' : 'pointer'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <option value="" disabled style={{ color: 'var(--text-muted)' }}>{t('profileForm.selectProxy', 'Select Proxy...')}</option>
              {savedProxies.map((p) => {
                const flag = p.country_code ? countryCodeToFlag(p.country_code) + ' ' : '';
                return (
                  <option key={p.id} value={p.id} style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
                    {flag}{p.host}:{p.port}
                  </option>
                );
              })}
            </select>
            </>
          ) : (
            <span style={{ opacity: 0.4 }}>
              <span className="proxy-dot no-proxy" />
              {t('profiles.proxyLocal')}
            </span>
          )}
        </div>
      </td>
      <td>
        <span className="time-ago">{formatTimeAgo(profile.last_run_at, t, i18n.language)}</span>
      </td>
      <td>
        {profile.group_name ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {groupColor && <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: groupColor }} />}
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
              {profile.group_name}
            </span>
          </div>
        ) : (
          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>-</span>
        )}
      </td>
      <td>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          {profile.browser_version || t('profiles.systemVersion')}
        </span>
      </td>
      <td>
        <span className="notes-cell">{profile.notes || '-'}</span>
      </td>
      <td style={{ textAlign: 'center' }}>
        {profile.status === 'running' ? (
          <button className="launch-btn stop" onClick={(e) => { e.stopPropagation(); onStop(profile.id); }}>
            {t('profiles.actionClose')}
          </button>
        ) : (
          <button className="launch-btn start" onClick={(e) => { e.stopPropagation(); onLaunch(profile.id); }}>
            {t('profiles.actionOpen')}
          </button>
        )}
      </td>
      <td>
        <div className="row-actions">
          <button
            className="action-btn"
            onClick={(e) => { e.stopPropagation(); onContextMenu(e, profile.id); }}
            title={t('profiles.moreOptions')}
          >
            <MoreVerticalIcon />
          </button>
        </div>
      </td>
    </tr>
  );
});
