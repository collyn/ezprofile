import { useState, useMemo, useCallback, useRef, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ProfileData, CreateProfileInput, GroupData } from '../types';
import CreateProfileModal from '../components/CreateProfileModal';
import EditProfileModal from '../components/EditProfileModal';
import ContextMenu from '../components/ContextMenu';
import GroupManagerModal from '../components/GroupManagerModal';
import BatchAssignGroupModal from '../components/BatchAssignGroupModal';
import BatchAssignProxyModal from '../components/BatchAssignProxyModal';
import BrowserVersionModal from '../components/BrowserVersionModal';

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
  onExportCookies: (id: string) => Promise<void>;
  onImportCookies: (id: string) => Promise<void>;
  onDeleteProfile: (id: string) => Promise<void>;
  onDeleteProfiles: (ids: string[]) => Promise<void>;
  onLaunchProfile: (id: string) => Promise<void>;
  onStopProfile: (id: string) => Promise<void>;
  onBackupProfile: (id: string) => Promise<void>;
  onRestoreProfile: (id: string) => Promise<void>;
  onCloneProfile: (id: string) => Promise<void>;
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr + 'Z');
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return 'Vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return date.toLocaleDateString('vi-VN');
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
  const [editingProfile, setEditingProfile] = useState<ProfileData | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    profileId: string;
  } | null>(null);
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {t('profiles.addNew')}
            </button>
            <button className="btn" onClick={() => setShowGroupManager(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              {t('profiles.manageGroups')}
            </button>
            <button className="btn" onClick={() => setShowBrowserVersionModal(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="4" />
                <line x1="21.17" y1="8" x2="12" y2="8" />
                <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
                <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
              </svg>
              {t('profiles.manageChrome')}
            </button>
            <div className="toolbar-separator" />
            <button className="btn btn-outline btn-sm" onClick={() => onImportProfiles()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {t('profiles.importExcelJson')}
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => onExportProfiles()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {t('profiles.exportAll')}
            </button>
          </div>

          <div className="toolbar-separator" />

          <div className="search-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder={t('profiles.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>

          {selectedIds.size > 0 && (
            <>
              <div className="toolbar-separator" />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {t('profiles.selectedCount', { count: selectedIds.size })}
              </span>
              <button className="btn btn-outline btn-sm" onClick={() => setShowBatchGroupModal(true)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                {t('profiles.assignGroup')}
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => setShowBatchProxyModal(true)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                {t('profiles.assignProxy')}
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => onExportProfiles(Array.from(selectedIds))}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                {t('profiles.export')}
              </button>
              <button className="btn btn-danger btn-sm" onClick={handleBatchDelete}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3,6 5,6 21,6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                {t('profiles.delete')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        {loading ? (
          <div className="empty-state">
            <p>{t('profiles.loading')}</p>
          </div>
        ) : filteredProfiles.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <h3>{t('profiles.emptyStateTitle')}</h3>
            <p>{t('profiles.emptyStateDesc')}</p>
            <button className="btn btn-success" onClick={() => setShowCreateModal(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
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
                  onSelect={handleSelectOne}
                  onContextMenu={handleContextMenu}
                  onLaunch={onLaunchProfile}
                  onStop={onStopProfile}
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

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          profileId={contextMenu.profileId}
          profile={profiles.find((p) => p.id === contextMenu.profileId)!}
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
        />
      )}

      {showBrowserVersionModal && (
        <BrowserVersionModal onClose={() => setShowBrowserVersionModal(false)} />
      )}
    </>
  );
}

// Memoized table row — only re-renders when this profile's data or selection changes
const ProfileRow = memo(function ProfileRow({
  profile,
  isSelected,
  groupColor,
  onSelect,
  onContextMenu,
  onLaunch,
  onStop,
}: {
  profile: ProfileData;
  isSelected: boolean;
  groupColor?: string;
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onLaunch: (id: string) => void;
  onStop: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <tr
      className={`${isSelected ? 'selected' : ''} ${profile.status === 'running' ? 'running' : ''}`}
      onContextMenu={(e) => onContextMenu(e, profile.id)}
    >
      <td>
        <div className="checkbox">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onSelect(profile.id)}
          />
        </div>
      </td>
      <td>
        <span style={{ fontWeight: 500 }}>{profile.name}</span>
      </td>
      <td>
        <div className="status-badge">
          <span className={`status-dot ${profile.status}`} />
          {profile.status === 'running' ? t('profiles.statusRunning') : t('profiles.statusReady')}
        </div>
      </td>
      <td>
        <div className="proxy-badge">
          <span className={`proxy-dot ${profile.proxy_host ? 'has-proxy' : 'no-proxy'}`} />
          {profile.proxy_host
            ? `${profile.proxy_host}:${profile.proxy_port}`
            : t('profiles.proxyLocal')}
        </div>
      </td>
      <td>
        <span className="time-ago">{formatTimeAgo(profile.last_run_at)}</span>
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
        <span className="notes-cell">{profile.notes || '-'}</span>
      </td>
      <td style={{ textAlign: 'center' }}>
        {profile.status === 'running' ? (
          <button className="launch-btn stop" onClick={() => onStop(profile.id)}>
            {t('profiles.actionClose')}
          </button>
        ) : (
          <button className="launch-btn start" onClick={() => onLaunch(profile.id)}>
            {t('profiles.actionOpen')}
          </button>
        )}
      </td>
      <td>
        <div className="row-actions">
          <button
            className="action-btn"
            onClick={(e) => onContextMenu(e, profile.id)}
            title={t('profiles.moreOptions')}
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="19" r="1.5" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
});
