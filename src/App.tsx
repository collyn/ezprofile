import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ProfileData, CreateProfileInput } from './types';
import { getAPI } from './api';
import TitleBar from './components/TitleBar';
import ProfileList from './pages/ProfileList';
import SettingsPage from './pages/SettingsPage';

const api = getAPI();

function App() {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<ProfileData[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string; color: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<{ id: number; type: string; message: string }[]>([]);
  const [currentView, setCurrentView] = useState<'profiles' | 'settings'>('profiles');

  const addToast = useCallback((type: string, message: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const loadGroups = useCallback(async () => {
    try {
      const data = await api.getGroups();
      setGroups(data);
    } catch (err: any) {
      console.error(t('app.toasts.loadGroupError', { err: err.message || err }));
    }
  }, [t]);

  const loadProfiles = useCallback(async () => {
    try {
      const data = await api.getProfiles();
      setProfiles(data);
    } catch (err: any) {
      addToast('error', t('app.toasts.loadProfilesError'));
    } finally {
      setLoading(false);
    }
  }, [addToast, t]);

  useEffect(() => {
    loadProfiles();
    loadGroups();
    api.onProfileStatusChanged((profileId: string, status: string) => {
      setProfiles((prev) =>
        prev.map((p) => (p.id === profileId ? { ...p, status: status as 'ready' | 'running' } : p))
      );
    });
    api.onBackupProgress((profileId: string, progress: string) => {
      addToast('info', t('app.toasts.backupRestore', { progress }));
    });
    api.onUpdaterStatus((status: string) => {
      addToast('info', t('app.toasts.update', { status }));
    });
    api.onUpdaterProgress((percent: number) => {
      console.log(`Downloading update: ${Math.round(percent)}%`);
    });
  }, [loadProfiles, loadGroups, addToast]);

  const handleCreateProfile = async (input: CreateProfileInput) => {
    try {
      const newProfile = await api.createProfile(input);
      setProfiles((prev) => [newProfile, ...prev]);
      addToast('success', t('app.toasts.profileCreated', { name: input.name }));
    } catch (err: any) {
      addToast('error', t('app.toasts.profileCreateError', { err: err.message }));
    }
  };

  const handleUpdateProfile = async (id: string, input: Partial<CreateProfileInput>) => {
    try {
      const updated = await api.updateProfile(id, input);
      setProfiles((prev) => prev.map((p) => (p.id === id ? updated : p)));
      addToast('success', t('app.toasts.profileUpdated'));
    } catch (err: any) {
      addToast('error', t('app.toasts.profileUpdateError', { err: err.message }));
    }
  };

  const handleUpdateProfiles = async (ids: string[], input: Partial<CreateProfileInput>) => {
    try {
      await api.updateProfiles(ids, input);
      setProfiles((prev) => prev.map(p => ids.includes(p.id) ? { ...p, ...input } : p));
      addToast('success', t('app.toasts.profilesUpdated', { count: ids.length }));
    } catch (err: any) {
      addToast('error', t('app.toasts.profilesUpdateError', { err: err.message }));
    }
  };

  const handleExportProfiles = async (ids?: string[]) => {
    try {
      const res = await api.exportProfiles(ids);
      if (res.success && !res.canceled) {
        addToast('success', t('app.toasts.exportSuccess'));
      } else if (res.error) {
        addToast('error', t('app.toasts.exportError', { err: res.error }));
      }
    } catch (err: any) {
      addToast('error', t('app.toasts.exportError', { err: err.message }));
    }
  };

  const handleImportProfiles = async () => {
    try {
      const res = await api.importProfiles();
      if (res.success && !res.canceled && res.count) {
        addToast('success', t('app.toasts.importSuccess', { count: res.count }));
        loadProfiles();
      } else if (res.error) {
        addToast('error', t('app.toasts.importError', { err: res.error }));
      }
    } catch (err: any) {
      addToast('error', t('app.toasts.importError', { err: err.message }));
    }
  };

  const handleExportCookies = async (id: string) => {
    try {
      const res = await api.exportCookies(id);
      if (res.success && !res.canceled) {
        addToast('success', t('app.toasts.exportCookiesSuccess'));
      } else if (res.error) {
        addToast('error', t('app.toasts.exportCookiesError', { err: res.error }));
      }
    } catch (err: any) {
      addToast('error', t('app.toasts.exportCookiesError', { err: err.message }));
    }
  };

  const handleImportCookies = async (id: string) => {
    try {
      const res = await api.importCookies(id);
      if (res.success && !res.canceled) {
        addToast('success', t('app.toasts.importCookiesSuccess'));
      } else if (res.error) {
        addToast('error', t('app.toasts.importCookiesError', { err: res.error }));
      }
    } catch (err: any) {
      addToast('error', t('app.toasts.importCookiesError', { err: err.message }));
    }
  };

  const handleBackupProfile = async (id: string) => {
    try {
      const res = await api.backupProfile(id);
      if (res.success && !res.canceled) {
        addToast('success', t('app.toasts.backupSuccess'));
      } else if (res.error) {
        addToast('error', t('app.toasts.backupError', { err: res.error }));
      }
    } catch (err: any) {
      addToast('error', t('app.toasts.systemError', { err: err.message }));
    }
  };

  const handleRestoreProfile = async (id: string) => {
    try {
      const res = await api.restoreProfile(id);
      if (res.success && !res.canceled) {
        addToast('success', t('app.toasts.restoreSuccess'));
      } else if (res.error) {
        addToast('error', t('app.toasts.restoreError', { err: res.error }));
      }
    } catch (err: any) {
      addToast('error', t('app.toasts.systemError', { err: err.message }));
    }
  };

  const handleDeleteProfile = async (id: string) => {
    try {
      await api.deleteProfile(id);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
      addToast('success', t('app.toasts.deleteSuccess'));
    } catch (err: any) {
      addToast('error', t('app.toasts.deleteError', { err: err.message }));
    }
  };

  const handleDeleteProfiles = async (ids: string[]) => {
    try {
      await api.deleteProfiles(ids);
      setProfiles((prev) => prev.filter((p) => !ids.includes(p.id)));
      addToast('success', t('app.toasts.deleteBatchSuccess', { count: ids.length }));
    } catch (err: any) {
      addToast('error', t('app.toasts.deleteError', { err: err.message }));
    }
  };

  const handleLaunchProfile = async (id: string) => {
    try {
      await api.launchProfile(id);
      setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'running' as const } : p)));
      addToast('success', t('app.toasts.launchSuccess'));
    } catch (err: any) {
      addToast('error', t('app.toasts.launchError', { err: err.message }));
    }
  };

  const handleStopProfile = async (id: string) => {
    try {
      await api.stopProfile(id);
      setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'ready' as const } : p)));
      addToast('info', t('app.toasts.stopSuccess'));
    } catch (err: any) {
      addToast('error', t('app.toasts.stopError', { err: err.message }));
    }
  };

  return (
    <>
      <TitleBar onOpenSettings={() => setCurrentView('settings')} />
      <div className="app-container">
        <div className="main-content">
          {currentView === 'settings' ? (
            <SettingsPage onBack={() => setCurrentView('profiles')} />
          ) : (
            <ProfileList
            profiles={profiles}
            groups={groups}
            loading={loading}
            onRefreshGroups={loadGroups}
            onCreateProfile={handleCreateProfile}
            onUpdateProfile={handleUpdateProfile}
            onUpdateProfiles={handleUpdateProfiles}
            onExportProfiles={handleExportProfiles}
            onImportProfiles={handleImportProfiles}
            onExportCookies={handleExportCookies}
            onImportCookies={handleImportCookies}
            onDeleteProfile={handleDeleteProfile}
            onDeleteProfiles={handleDeleteProfiles}
            onLaunchProfile={handleLaunchProfile}
            onStopProfile={handleStopProfile}
            onBackupProfile={handleBackupProfile}
            onRestoreProfile={handleRestoreProfile}
          />
          )}
        </div>
      </div>

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast ${toast.type}`}>
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default App;
