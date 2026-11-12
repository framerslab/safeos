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
  cacheProfile,
  getCachedProfile,
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
  login: (user: { id: string; displayName: string; preferences: UserPreferences }) => void;
  startGuestSession: (user: { id: string; displayName: string; preferences: UserPreferences }) => void;
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

            if (localSession && new Date(localSession.expiresAt) > new Date()) {
              // Validate with server if online
              const apiUrl = getApiUrl();
              try {
                if (!apiUrl) {
                  throw new Error('No monitoring server configured');
                }

                const response = await fetch(`${apiUrl}/api/auth/session`, {
                  headers: {
                    'X-Session-Token': localSession.token,
                  },
                });

                if (response.ok) {
                  const { data } = await response.json();
                  set({
                    isAuthenticated: true,
                    isGuest: data.isGuest,
                    sessionToken: data.token,
                    sessionId: data.sessionId,
                    profile: data.profile,
                    expiresAt: data.expiresAt,
                    mode: 'full',
                    isOffline: false,
                    isInitialized: true,
                    isLoading: false,
                  });
                  return;
                }
              } catch (error) {
                // Offline - use cached data
                console.log('[Auth] Offline, using cached session');
                set({
                  isAuthenticated: true,
                  isGuest: true,
                  sessionToken: localSession.token,
                  sessionId: localSession.id,
                  profile: localSession.profile,
                  expiresAt: localSession.expiresAt,
                  mode: 'local-only',
                  isOffline: true,
                  isInitialized: true,
                  isLoading: false,
                });
                return;
              }
            }

            // No valid session - create guest session
            await get().createSession();
          } catch (error) {
            console.error('[Auth] Initialization failed:', error);
            set({ isInitialized: true, isLoading: false });
          }
        })().finally(() => { initialization = null; });
        return initialization;
      },

      // Create new session
      createSession: async (displayName?: string) => {
        set({ isLoading: true });

        try {
          const deviceId = get().deviceId || generateDeviceId();
          const apiUrl = getApiUrl();

          if (!apiUrl) {
            throw new Error('No monitoring server configured');
          }

          const response = await fetch(`${apiUrl}/api/auth/session`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              deviceId,
              displayName,
            }),
          });

          if (!response.ok) {
            throw new Error('Failed to create session');
          }

          const { data } = await response.json();

          // Save to IndexedDB
          await saveLocalSession({
            id: data.sessionId,
            token: data.token,
            deviceId,
            profile: data.profile,
            createdAt: new Date().toISOString(),
            expiresAt: data.expiresAt,
            syncedAt: new Date().toISOString(),
          });

          // Cache profile
          if (data.profile) {
            await cacheProfile(data.profile);
          }

          set({
            isAuthenticated: true,
            isGuest: data.isGuest,
            sessionToken: data.token,
            sessionId: data.sessionId,
            deviceId,
            profile: data.profile,
            expiresAt: data.expiresAt,
            mode: 'full',
            isOffline: false,
            isInitialized: true,
            isLoading: false,
          });
        } catch (error) {
          console.error('[Auth] Failed to create session:', error);
          
          // Create offline guest session
          const guestId = `guest-${Date.now()}`;
          const guestProfile: UserProfile = {
            id: guestId,
            displayName: displayName || `Guest-${guestId.slice(0, 6)}`,
            avatarUrl: null,
            preferences: {
              defaultScenario: 'pet',
              motionSensitivity: 0.5,
              audioSensitivity: 0.5,
              alertVolume: 0.7,
              theme: 'dark',
            },
            notificationSettings: {
              browserPush: true,
              sms: false,
              telegram: false,
              emailDigest: false,
              quietHoursStart: null,
              quietHoursEnd: null,
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          // Cache profile
          await cacheProfile(guestProfile);

          // Save local session to IndexedDB for persistence
          const localToken = `local-${guestId}`;
          const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year
          await saveLocalSession({
            id: guestId,
            token: localToken,
            deviceId: get().deviceId || generateDeviceId(),
            profile: guestProfile,
            createdAt: new Date().toISOString(),
            expiresAt,
            syncedAt: new Date().toISOString(),
          });

          set({
            isAuthenticated: true,
            isGuest: true,
            sessionToken: localToken,
            sessionId: guestId,
            profile: guestProfile,
            expiresAt,
            mode: 'local-only',
            isOffline: true,
            isInitialized: true,
            isLoading: false,
          });
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
            set({
              profile: data.profile,
              expiresAt: data.expiresAt,
            });
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

        // Optimistic update
        set({ profile: updatedProfile });

        try {
          const apiUrl = getApiUrl();
          if (token && !token.startsWith('local-') && !token.startsWith('offline-')) {
            if (apiUrl) {
              await fetch(`${apiUrl}/api/auth/profile`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': token,
              },
              body: JSON.stringify(updates),
              });
            }
          }

          // Cache locally
          await cacheProfile(updatedProfile);
        } catch (error) {
          console.error('[Auth] Failed to update profile:', error);
          // Keep optimistic update, will sync later
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

      // Convenience: Login with user data
      login: (user) => {
        set({
          isAuthenticated: true,
          isLoggedIn: true,
          isGuest: false,
          user,
          profile: {
            id: user.id,
            displayName: user.displayName,
            avatarUrl: null,
            preferences: user.preferences,
            notificationSettings: {
              browserPush: true,
              sms: false,
              telegram: false,
              emailDigest: false,
              quietHoursStart: null,
              quietHoursEnd: null,
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });
      },

      // Convenience: Start guest session
      startGuestSession: (user) => {
        set({
          isAuthenticated: true,
          isLoggedIn: true,
          isGuest: true,
          user,
          profile: {
            id: user.id,
            displayName: user.displayName,
            avatarUrl: null,
            preferences: user.preferences,
            notificationSettings: {
              browserPush: true,
              sms: false,
              telegram: false,
              emailDigest: false,
              quietHoursStart: null,
              quietHoursEnd: null,
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });
      },
    }),
    {
      name: 'safeos-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sessionToken: state.sessionToken,
        sessionId: state.sessionId,
        deviceId: state.deviceId,
        profile: state.profile,
        isGuest: state.isGuest,
      }),
    }
  )
);
