/**
 * Authentication Store
 *
 * Zustand store for managing authentication state with local persistence.
 *
 * @module stores/auth-store
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  getLocalSession,
  saveLocalSession,
  type LocalSession,
} from '../lib/client-db';
import { clearLocalData } from '../lib/local-data';
import { getApiUrl } from '../lib/env';

// =============================================================================
// Types
// =============================================================================

export interface UserProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  preferences: UserPreferences;
  notificationSettings: NotificationSettings;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  defaultScenario: 'pet' | 'baby' | 'elderly' | 'security';
  motionSensitivity: number;
  audioSensitivity: number;
  alertVolume: number;
  theme: 'dark' | 'light' | 'system';
}

export interface NotificationSettings {
  browserPush: boolean;
  sms: boolean;
  telegram: boolean;
  emailDigest: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  quietHoursTimeZone?: string | null;
  quietHoursDays?: number[];
}

/** Session mode - 'full' when connected to backend, 'local-only' otherwise */
export type SessionMode = 'full' | 'local-only';

interface AuthState {
  // State
  isInitialized: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  isLoggedIn: boolean; // Alias for isAuthenticated
  isGuest: boolean;
  sessionToken: string | null;
  sessionId: string | null;
  deviceId: string | null;
  profile: UserProfile | null;
  user: { id: string; displayName: string; preferences: UserPreferences } | null; // Simple user object
  expiresAt: string | null;
  /** Current session mode - 'full' or 'local-only' */
  mode: SessionMode;
  /** Whether we're operating offline (no network) */
  isOffline: boolean;

  // Actions
  initialize: () => Promise<void>;
  createSession: (displayName?: string) => Promise<void>;
  refreshSession: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
  updateNotificationSettings: (settings: Partial<NotificationSettings>) => Promise<void>;
  logout: () => Promise<void>;
  setDeviceId: (deviceId: string) => void;
  
  // Convenience aliases
  login: (user: { id: string; displayName: string; preferences: UserPreferences }) => Promise<void>;
  startGuestSession: (user: { id: string; displayName: string; preferences: UserPreferences }) => Promise<void>;
}

// =============================================================================
// API Configuration
// =============================================================================

// =============================================================================
// Device ID Generation
// =============================================================================

function generateDeviceId(): string {
  const stored = typeof localStorage !== 'undefined' 
    ? localStorage.getItem('safeos_device_id') 
    : null;
  
  if (stored) return stored;
  
  const newId = `device-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('safeos_device_id', newId);
  }
  
  return newId;
}

// =============================================================================
// Store
// =============================================================================

let initialization: Promise<void> | null = null;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      isInitialized: false,
      isLoading: false,
      isAuthenticated: false,
      isLoggedIn: false,
      isGuest: true,
      sessionToken: null,
      sessionId: null,
      deviceId: null,
      profile: null,
      user: null,
      expiresAt: null,
      mode: 'local-only',
      isOffline: false,

      // Initialize from local storage
      initialize: () => {
        if (get().isInitialized) return Promise.resolve();
        if (initialization) return initialization;
        initialization = (async () => {
          set({ isLoading: true });

          try {
            // Get device ID
            const deviceId = generateDeviceId();
            set({ deviceId });

            // Try to restore from IndexedDB
            const localSession = await getLocalSession();

            if (localSession) {
              const apiUrl = getApiUrl();
              let response: Response | undefined;
              if (apiUrl) {
                try {
                  response = await fetch(`${apiUrl}/api/auth/session`, {
                    headers: { 'X-Session-Token': localSession.token },
                  });
                } catch {
                  console.log('[Auth] Offline, using cached session');
                }
              }
              if (response?.ok) {
                const { data } = await response.json();
                await adoptSession({ ...localSession, id: data.sessionId, token: data.token,
                  profile: data.profile, expiresAt: data.expiresAt }, data.isGuest, 'full');
                return;
              }
              if (!response) {
                await adoptSession(localSession, true, 'local-only');
                return;
              }
            }

            // No valid session - create guest session
            await get().createSession();
          } catch (error) {
            console.error('[Auth] Initialization failed:', error);
            set(unavailableSession);
          }
        })().finally(() => { initialization = null; });
        return initialization;
      },

      // Do not create a profile until this browser can read its saved session.
      createSession: async (displayName?: string) => {
        set({ isLoading: true });
        try {
          await getLocalSession();
          const deviceId = get().deviceId || generateDeviceId();
          const apiUrl = getApiUrl();
          let data: { sessionId: string; token: string; profile: UserProfile; expiresAt: string; isGuest: boolean };
          let mode: SessionMode = 'full';
          try {
            if (!apiUrl) throw new Error('No monitoring server configured');
            const response = await fetch(`${apiUrl}/api/auth/session`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ deviceId, displayName }),
            });
            if (!response.ok) throw new Error('Failed to create session');
            ({ data } = await response.json());
          } catch {
            const guestId = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            data = {
              sessionId: guestId, token: `local-${guestId}`, isGuest: true,
              expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
              profile: {
                id: guestId, displayName: displayName || `Guest-${guestId.slice(6, 12)}`, avatarUrl: null,
                preferences: { defaultScenario: 'pet', motionSensitivity: 0.5, audioSensitivity: 0.5,
                  alertVolume: 0.7, theme: 'dark' },
                notificationSettings: { browserPush: true, sms: false, telegram: false,
                  emailDigest: false, quietHoursStart: null, quietHoursEnd: null },
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
              },
            };
            mode = 'local-only';
          }
          // Storage failures never fall back to adopting an unsaved guest.
          await adoptSession({ id: data.sessionId, token: data.token, deviceId, profile: data.profile,
            createdAt: new Date().toISOString(), expiresAt: data.expiresAt,
            syncedAt: new Date().toISOString() }, data.isGuest, mode);
        } catch (error) {
          console.error('[Auth] Could not save session:', error);
          set(unavailableSession);
        }
      },

      // Refresh session
      refreshSession: async () => {
        const token = get().sessionToken;
        if (!token) return;

        try {
          const apiUrl = getApiUrl();
          if (!apiUrl) return;

          const response = await fetch(`${apiUrl}/api/auth/session`, {
            headers: {
              'X-Session-Token': token,
            },
          });

          if (response.ok) {
            const { data } = await response.json();
            const saved = await getLocalSession();
            if (!saved) return;
            await adoptSession({ ...saved, profile: data.profile, expiresAt: data.expiresAt },
              data.isGuest, 'full');
          }
        } catch (error) {
          console.error('[Auth] Failed to refresh session:', error);
        }
      },

      // Update profile
      updateProfile: async (updates) => {
        const token = get().sessionToken;
        const currentProfile = get().profile;
        
        if (!currentProfile) return;

        const updatedProfile = { ...currentProfile, ...updates, updatedAt: new Date().toISOString() };

        try {
          const saved = await getLocalSession();
          if (!saved) return;
          await adoptSession({ ...saved, profile: updatedProfile }, get().isGuest, get().mode);
        } catch (error) {
          console.error('[Auth] Failed to save profile:', error);
          set(unavailableSession);
          return;
        }

        try {
          const apiUrl = getApiUrl();
          if (apiUrl && token && !token.startsWith('local-') && !token.startsWith('offline-')) {
            await fetch(`${apiUrl}/api/auth/profile`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Session-Token': token },
              body: JSON.stringify(updates),
            });
          }
        } catch (error) {
          console.error('[Auth] Failed to sync profile:', error);
          // The locally saved profile remains available offline.
        }
      },

      // Update preferences
      updatePreferences: async (prefs) => {
        const currentProfile = get().profile;
        if (!currentProfile) return;

        await get().updateProfile({
          preferences: { ...currentProfile.preferences, ...prefs },
        });
      },

      // Update notification settings
      updateNotificationSettings: async (settings) => {
        const currentProfile = get().profile;
        if (!currentProfile) return;

        await get().updateProfile({
          notificationSettings: { ...currentProfile.notificationSettings, ...settings },
        });
      },

      // Logout
      logout: async () => {
        const token = get().sessionToken;

        try {
          const apiUrl = getApiUrl();
          if (token && !token.startsWith('local-') && !token.startsWith('offline-')) {
            if (apiUrl) {
              await fetch(`${apiUrl}/api/auth/session`, {
                method: 'DELETE',
                headers: {
                  'X-Session-Token': token,
                },
              });
            }
          }
        } catch (error) {
          console.error('[Auth] Logout error:', error);
        }

        // Finish deleting this browser's account data before allowing another session.
        // Keep the device connection so the next account can use the same server.
        await clearLocalData({ preserveBackendConfig: true });

        set({
          isAuthenticated: false,
          isLoggedIn: false,
          user: null,
          deviceId: null,
          isGuest: true,
          sessionToken: null,
          sessionId: null,
          profile: null,
          expiresAt: null,
        });
      },

      // Set device ID
      setDeviceId: (deviceId) => {
        set({ deviceId });
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('safeos_device_id', deviceId);
        }
      },

      login: async (user) => adoptUser(user, false),
      startGuestSession: async (user) => adoptUser(user, true),
    }),
    {
      name: 'safeos-auth',
      storage: createJSONStorage(() => localStorage),
      // Older localStorage snapshots are hints, never an established profile.
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<AuthState>),
        profile: null, user: null, isInitialized: false, isAuthenticated: false, isLoggedIn: false }),
      partialize: (state) => ({
        sessionToken: state.sessionToken,
        sessionId: state.sessionId,
        deviceId: state.deviceId,
        profile: null,
        isGuest: state.isGuest,
      }),
    }
  )
);

const unavailableSession = {
  profile: null, user: null, sessionToken: null, sessionId: null, expiresAt: null,
  isAuthenticated: false, isLoggedIn: false, isInitialized: false, isLoading: false,
};

async function adoptSession(session: LocalSession, isGuest: boolean, mode: SessionMode): Promise<void> {
  await saveLocalSession(session);
  useAuthStore.setState({
    isAuthenticated: true, isLoggedIn: true, isGuest, sessionToken: session.token,
    sessionId: session.id, deviceId: session.deviceId, profile: session.profile,
    user: session.profile, expiresAt: session.expiresAt, mode, isOffline: mode === 'local-only',
    isInitialized: true, isLoading: false,
  });
}

async function adoptUser(user: { id: string; displayName: string; preferences: UserPreferences }, isGuest: boolean): Promise<void> {
  try {
    const saved = await getLocalSession();
    const now = new Date().toISOString();
    const profile: UserProfile = { ...user, avatarUrl: null,
      notificationSettings: { browserPush: true, sms: false, telegram: false, emailDigest: false,
        quietHoursStart: null, quietHoursEnd: null }, createdAt: now, updatedAt: now };
    const token = useAuthStore.getState().sessionToken || localStorage.getItem('safeos_session_token') || `local-${user.id}`;
    await adoptSession({ id: saved?.id || user.id, token, deviceId: generateDeviceId(), profile,
      createdAt: now, expiresAt: saved?.expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      syncedAt: now }, isGuest, token.startsWith('local-') ? 'local-only' : 'full');
  } catch (error) {
    useAuthStore.setState(unavailableSession);
    throw error;
  }
}

/** A database reload notice suspends this tab without signing out or clearing data. */
export function suspendUnavailableSession(): void {
  useAuthStore.setState(unavailableSession);
}
