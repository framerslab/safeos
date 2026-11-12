/**
 * Providers Wrapper
 *
 * Client-side provider wrapper for all React contexts.
 * Used in the root layout to provide global state management.
 *
 * @module components/Providers
 */

'use client';

import React, { useEffect, useState } from 'react';
import { BackendStatusProvider } from '@/contexts/BackendStatusContext';
import { BackendSettings } from '@/components/BackendSettings';
import { ToastProvider } from '@/components/Toast';
import { useSettingsStore } from '@/stores/settings-store';
import { hydrateSavedSettings } from '@/lib/settings-hydration';
import { useAuthStore, suspendUnavailableSession } from '@/stores/auth-store';
import { useMonitoringStore } from '@/stores/monitoring-store';
import { getDatabaseNotice } from '@/lib/client-db';
import { getSoundManager } from '@/lib/sound-manager';

// =============================================================================
// Types
// =============================================================================

interface ProvidersProps {
  children: React.ReactNode;
}

// =============================================================================
// Component
// =============================================================================

export function Providers({ children }: ProvidersProps) {
  const [showBackendSettings, setShowBackendSettings] = useState(false);

  useEffect(() => {
    const suspend = () => { if (getDatabaseNotice()) suspendUnavailableSession(); };
    suspend();
    window.addEventListener('safeos:database-status', suspend);
    return () => window.removeEventListener('safeos:database-status', suspend);
  }, []);

  const profile = useAuthStore((state) => state.profile);
  useEffect(() => { void useAuthStore.getState().initialize(); }, []);
  useEffect(() => { void useMonitoringStore.getState().hydrateAlerts(); }, [profile?.id]);
  useEffect(() => { hydrateSavedSettings(profile); }, [profile]);

  // Keep SoundManager synced with user settings globally (quiet hours + emergency/mute).
  useEffect(() => {
    const manager = getSoundManager();

    const apply = () => {
      const state = useSettingsStore.getState();
      manager.setUserVolume(state.getEffectiveVolume());
      manager.setGlobalMute(state.globalMute);
      manager.setEmergencyMode(state.emergencyModeActive);
    };

    apply();

    // React to settings changes immediately, and also re-apply periodically so
    // quiet-hours transitions take effect without requiring a settings change.
    const unsubscribe = useSettingsStore.subscribe(apply);
    const interval = window.setInterval(apply, 30_000);

    return () => {
      unsubscribe();
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const handleOpen = () => setShowBackendSettings(true);

    window.addEventListener('safeos:open-backend-settings', handleOpen);
    return () => window.removeEventListener('safeos:open-backend-settings', handleOpen);
  }, []);

  useEffect(() => {
    if (!showBackendSettings) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowBackendSettings(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [showBackendSettings]);

  return (
    <ToastProvider>
      <BackendStatusProvider>
        {showBackendSettings && (
          <BackendSettings isModal onClose={() => setShowBackendSettings(false)} />
        )}

        {/* StatusBanner is rendered by the root layout inside .app-content so it
           sits *below* the fixed nav rather than behind it. The configure button
           on the banner dispatches `safeos:open-backend-settings` (handled above). */}
        {children}
      </BackendStatusProvider>
    </ToastProvider>
  );
}

export default Providers;
