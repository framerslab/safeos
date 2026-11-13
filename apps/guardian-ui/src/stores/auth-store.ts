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
  getDatabaseNotice,
  isDatabaseAvailable,
  readLocalSession,
  saveLocalSession,
  deleteLocalSession,
  cacheProfile,
  getCachedProfile,
  type LocalSession,
} from '../lib/client-db';
import { clearLocalData } from '../lib/local-data';
import { getLocalDataGeneration, isCurrentLocalData, readAccountClearMarker } from '../lib/local-data-generation';
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

/**
 * A profile change that was not taken. `place` is where the profile lives and what refused it: the
 * server for a session on a server, this browser for a browser-only session. The tab's profile is
 * put back to what it was before the change.
 */
export class ProfileSaveError extends Error {
  readonly place: 'server' | 'browser';

  constructor(place: 'server' | 'browser', message: string) {
    super(message);
    this.name = 'ProfileSaveError';
    this.place = place;
  }
}

/** A profile change refused under a reload notice, before anything was changed or sent. */
export class ProfileSaveRefused extends Error {
  constructor(notice: string) {
    super(notice);
    this.name = 'ProfileSaveRefused';
  }
}

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

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => {
    /**
     * A stale path of set-up or session creation: the tab is left signed out, so the persist step
     * writes nothing of the old session back to local storage.
     */
    const leaveSignedOut = () => set({
      isLoading: false, isInitialized: true, isAuthenticated: false, sessionToken: null, sessionId: null, profile: null,
    });

    /**
     * Restores a saved session without the server's answer. A profile change is saved to the profile
     * cache: that copy is used when it holds this profile, otherwise the row's.
     */
    const restoreSaved = async (localSession: LocalSession, stamp: SessionStamp): Promise<void> => {
      const cachedProfile = localSession.profile?.id ? await getCachedProfile(localSession.profile.id) : null;
      const next = await afterWait(stamp);
      if (next === 'cleared') return leaveSignedOut();
      if (next === 'held') return keepHeldSession();
      set({
        isAuthenticated: true,
        isGuest: true,
        sessionToken: localSession.token,
        sessionId: localSession.id,
        profile: cachedProfile ? { ...localSession.profile, ...cachedProfile } : localSession.profile,
        expiresAt: localSession.expiresAt,
        mode: 'local-only',
        isOffline: true,
        isInitialized: true,
        isLoading: false,
      });
    };

    /**
     * Makes a session: on the server when one answers, otherwise a guest session in this browser.
     * `stamp` is taken where the work started (set-up's entry, or the call): once a clear of all local
     * data has landed since, nothing more is written, a session row written meanwhile is deleted
     * again, and the tab is left signed out. With `saved`, a browser-only session the server refused,
     * a request that fails goes on with that session and makes no guest.
     */
    const makeSession = async (displayName: string | undefined, stamp: SessionStamp, saved?: LocalSession): Promise<void> => {
      /** The id of the session row this call wrote. */
      let written: string | null = null;
      /** Read inside each write's own transaction: no clear of all local data since the stamp. */
      const current = () => !cleared(stamp);
      const leaveCleared = async () => {
        if (written !== null) {
          try {
            await deleteLocalSession(written);
          } catch (error) {
            console.warn('[Auth] Could not delete a session saved across a clear:', error);
          }
        }
        leaveSignedOut();
      };
      if (cleared(stamp)) return leaveCleared();
      set({ isLoading: true });
      const start = await afterWait(stamp);
      if (start === 'cleared') return leaveCleared();
      if (start === 'held') return keepHeldSession();

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
        const answered = await afterWait(stamp);
        if (answered === 'cleared') return leaveCleared();
        if (answered === 'held') return keepHeldSession();

        // A session made after the store could not be read stays in memory and local storage.
        if (!sessionStoreUnread && await isDatabaseAvailable() && !cleared(stamp)) {
          // Save to IndexedDB
          written = data.sessionId;
          await saveLocalSession({
            id: data.sessionId,
            token: data.token,
            deviceId,
            profile: data.profile,
            createdAt: new Date().toISOString(),
            expiresAt: data.expiresAt,
            syncedAt: new Date().toISOString(),
          }, current);

          // Cache profile
          if (data.profile && !cleared(stamp)) {
            await cacheProfile(data.profile, current);
          }
        }

        const stored = await afterWait(stamp);
        if (stored === 'cleared') return leaveCleared();
        if (stored === 'held') return keepHeldSession();
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
        const failed = await afterWait(stamp);
        if (failed === 'cleared') return leaveCleared();
        if (failed === 'held') return keepHeldSession();
        console.error('[Auth] Failed to create session:', error);
        if (saved) return restoreSaved(saved, stamp);

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

        const persistable = () => !sessionStoreUnread && !cleared(stamp);
        const available = persistable() && await isDatabaseAvailable();

        // Cache profile
        if (available && persistable()) await cacheProfile(guestProfile, current);

        // Save local session to IndexedDB for persistence
        const localToken = `local-${guestId}`;
        const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year
        if (available && persistable()) {
          written = guestId;
          await saveLocalSession({
            id: guestId,
            token: localToken,
            deviceId: get().deviceId || generateDeviceId(),
            profile: guestProfile,
            createdAt: new Date().toISOString(),
            expiresAt,
            syncedAt: new Date().toISOString(),
          }, current);
        }

        const stored = await afterWait(stamp);
        if (stored === 'cleared') return leaveCleared();
        if (stored === 'held') return keepHeldSession();
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
    };

    /** This tab's profile saves, one after another. */
    let profileSaves: Promise<unknown> = Promise.resolve();

    /**
     * One profile save, run when the saves before it have settled. Its change is built on the profile
     * they settled (a change that was taken stays, one that was not was put back), and a change that is
     * not taken is put back to that profile. A session on a server is decided by the server; with no
     * server address set, the save fails as a server failure. A browser-only session is decided by
     * this browser's write.
     */
    const saveProfile = async (change: (settled: UserProfile) => Partial<UserProfile>): Promise<void> => {
      const token = get().sessionToken;
      const settled = get().profile;
      if (!settled) return;

      const updates = change(settled);
      const updatedProfile = { ...settled, ...updates, updatedAt: new Date().toISOString() };

      // Optimistic update
      set({ profile: updatedProfile });
      // A change that was not taken is put back, unless something else has replaced it since.
      const putBack = () => {
        if (get().profile === updatedProfile) set({ profile: settled });
      };
      // Nothing is written to this browser once all local data was cleared, in this tab or another.
      const stamp = takeStamp();
      const current = () => !cleared(stamp);

      if (serverToken(token)) {
        // The profile lives on the server: its answer decides, whatever this browser can store.
        const apiUrl = getApiUrl();
        if (!apiUrl) {
          putBack();
          throw new ProfileSaveError('server', 'No server address is set; the profile change was not saved.');
        }
        let response: Response;
        try {
          response = await fetch(`${apiUrl}/api/auth/profile`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'X-Session-Token': token,
            },
            body: JSON.stringify(updates),
          });
        } catch (error) {
          console.error('[Auth] Failed to update profile:', error);
          putBack();
          throw new ProfileSaveError('server', 'The server could not be reached; the profile change was not saved.');
        }
        if (!response.ok) {
          putBack();
          throw new ProfileSaveError('server', `The server answered ${response.status}; the profile change was not saved.`);
        }
        // This browser's copy is what a reload reads when the server does not answer. A failed write is logged.
        if ((await cacheProfile(updatedProfile, current)) === 'failed') {
          console.warn('[Auth] The profile change was saved on the server but not copied to this browser.');
        }
        return;
      }

      // A browser-only session: this browser's copy is the profile.
      if ((await cacheProfile(updatedProfile, current)) === 'failed') {
        putBack();
        throw new ProfileSaveError('browser', 'The profile change was not saved in this browser.');
      }
    };

    /** Queues a profile save. Under a reload notice nothing is changed or sent, and the caller must be able to say so. */
    const queueProfileSave = (change: (settled: UserProfile) => Partial<UserProfile>): Promise<void> => {
      const notice = getDatabaseNotice();
      if (notice) return Promise.reject(new ProfileSaveRefused(notice));
      const turn = profileSaves.then(() => saveProfile(change));
      profileSaves = turn.catch(() => undefined);
      return turn;
    };

    return ({
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
      initialize: async () => {
        if (get().isInitialized) return;

        // A clear of all local data from here on (a sign-out or Clear All Local Data, in this tab or
        // another) discards what set-up finds: the tab is left signed out and nothing is written.
        const stamp = takeStamp();
        const lastUsed = lastUsedSessionId();
        const leaveCleared = leaveSignedOut;
        set({ isLoading: true });

        try {
          // Get device ID
          const deviceId = generateDeviceId();
          set({ deviceId });

          // Try to restore from IndexedDB
          let localSession: LocalSession | null;
          try {
            localSession = await readLocalSession(lastUsed);
          } catch {
            // The session store could not be read, which is not a browser without a session.
            sessionStoreUnread = true;
            if (cleared(stamp)) return leaveCleared();
            if (holdsServerToken()) await checkHeldToken();
            if (cleared(stamp)) return leaveCleared();
            if (holdsServerToken()) return keepHeldSession();
            return makeSession(undefined, stamp);
          }
          if (cleared(stamp)) return leaveCleared();

          /** A browser-only session the server refused: set-up goes on with it when no new session is made. */
          let refusedBrowserOnly: LocalSession | undefined;
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
                const next = await afterWait(stamp);
                if (next === 'cleared') return leaveCleared();
                if (next === 'held') {
                  // The OK answer counts for the token it was asked about, as checkHeldToken keeps it,
                  // so a tab that holds that same token is signed in with it.
                  heldAnswer = { token: localSession.token, data };
                  return keepHeldSession();
                }
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
              if (response.status !== 401) {
                // Any other answer (a 503, a 429) says nothing about the token: as when the server is unreachable.
                throw new Error(`The session check answered ${response.status}`);
              }
              // The server has ended the saved session: its token no longer counts as held.
              refusedTokens.add(localSession.token);
              const next = await afterWait(stamp);
              if (next === 'cleared') return leaveCleared();
              if (next === 'held') return keepHeldSession();
              // Drop a server session's row, so the next load does not choose it again. A failed delete
              // does not stop set-up. A browser-only session cannot be refused by a server: its row stays,
              // and when no new session is made set-up goes on with it.
              if (serverToken(localSession.token)) {
                try {
                  await deleteLocalSession(localSession.id);
                } catch (error) {
                  console.warn('[Auth] Could not delete the refused saved session:', error);
                }
              } else {
                refusedBrowserOnly = localSession;
              }
            } catch (error) {
              // Offline - use cached data
              console.log('[Auth] Offline, using cached session');
              await restoreSaved(localSession, stamp);
              return;
            }
          }

          // No valid session - create guest session
          await makeSession(undefined, stamp, refusedBrowserOnly);
        } catch (error) {
          console.error('[Auth] Initialization failed:', error);
          set({ isInitialized: true, isLoading: false });
        }
      },

      // Create new session
      createSession: (displayName?: string) => makeSession(displayName, takeStamp()),

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
      updateProfile: (updates) => queueProfileSave(() => updates),

      // Update preferences
      updatePreferences: async (prefs) => {
        if (!get().profile) return;
        await queueProfileSave((settled) => ({ preferences: { ...settled.preferences, ...prefs } }));
      },

      // Update notification settings
      updateNotificationSettings: async (settings) => {
        if (!get().profile) return;
        await queueProfileSave((settled) => ({ notificationSettings: { ...settled.notificationSettings, ...settings } }));
      },

      // Logout
      logout: async () => {
        // Under a reload notice the browser cannot be cleared: refuse before the server session ends.
        const notice = getDatabaseNotice();
        if (notice) throw new Error(notice);

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
    });
    },
    {
      name: 'safeos-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sessionToken: state.sessionToken,
        sessionId: state.sessionId,
        deviceId: state.deviceId,
        isGuest: state.isGuest,
      }),
    }
  )
);

// =============================================================================
// Clears of local data
// =============================================================================

/**
 * What session work and profile saves carry: this tab's clear counter, and the account marker every tab
 * shares in local storage. Only a clear of all local data writes that marker; clearing the alert
 * history does not.
 */
type SessionStamp = { counter: number; marker: string };

const takeStamp = (): SessionStamp => ({ counter: getLocalDataGeneration(), marker: readAccountClearMarker() });

/** A clear of all local data, in this tab or another, has landed since the stamp was taken. */
const cleared = (stamp: SessionStamp): boolean =>
  !isCurrentLocalData(stamp.counter) || readAccountClearMarker() !== stamp.marker;

/** After a wait: 'cleared' when a clear has landed, 'held' when the held session ends set-up, otherwise null. */
async function afterWait(stamp: SessionStamp): Promise<'cleared' | 'held' | null> {
  if (cleared(stamp)) return 'cleared';
  const held = await keepsHeldSession();
  if (cleared(stamp)) return 'cleared';
  return held ? 'held' : null;
}

/** The session id the store keeps in local storage: the session this browser last used. */
function lastUsedSessionId(): string | null {
  try {
    const id = JSON.parse(localStorage.getItem('safeos-auth') || 'null')?.state?.sessionId;
    return typeof id === 'string' && id !== '' ? id : null;
  } catch {
    return null;
  }
}

// =============================================================================
// A session held while the database cannot be used
// =============================================================================

const serverToken = (token: unknown): token is string =>
  typeof token === 'string' && token !== '' && !/^(local-|offline-)/.test(token);

/** Server tokens that set-up's session check saw answered with 401 in this page load. */
const refusedTokens = new Set<string>();

/** A held token: a server token that the server has not refused in this page load. */
const heldToken = (token: unknown): token is string => serverToken(token) && !refusedTokens.has(token);

/** The four fields the persist step keeps in local storage, when they hold a held token. Read afresh on every call. */
function storedSession(): { sessionToken: string; sessionId: string | null; deviceId: string | null; isGuest: boolean } | null {
  try {
    const state = JSON.parse(localStorage.getItem('safeos-auth') || 'null')?.state;
    return state && heldToken(state.sessionToken) ? state : null;
  } catch {
    return null;
  }
}

function holdsServerToken(): boolean {
  return heldToken(useAuthStore.getState().sessionToken) || storedSession() !== null;
}

/** The database cannot be used and this tab already holds a server token. */
async function keepsHeldSession(): Promise<boolean> {
  if (!holdsServerToken()) return false;
  if (getDatabaseNotice()) return true;
  const available = await isDatabaseAvailable();
  return !available || getDatabaseNotice() !== null;
}

/** The server's OK answer to the check of the held token, with the token it was asked about. */
let heldAnswer: { token: string; data: { isGuest: boolean; profile: any; expiresAt: string | null } } | null = null;

/** Ends set-up on the held token, taking it from local storage when memory has none. When the server
 *  answered OK for that same token in this page load, the tab is signed in with that answer, in memory. */
function keepHeldSession(): void {
  const inMemory = useAuthStore.getState().sessionToken;
  const stored = heldToken(inMemory) ? null : storedSession();
  const token = stored ? stored.sessionToken : inMemory;
  const answer = heldAnswer !== null && heldAnswer.token === token ? heldAnswer.data : null;
  useAuthStore.setState({
    ...(stored ? { sessionToken: stored.sessionToken, sessionId: stored.sessionId,
      deviceId: stored.deviceId, isGuest: stored.isGuest } : {}),
    ...(answer ? { isAuthenticated: true, isGuest: answer.isGuest, profile: answer.profile,
      expiresAt: answer.expiresAt, mode: 'full' as const } : {}),
    isInitialized: true, isLoading: false });
}

/** Asks the server about the token this tab holds. Only a 401 marks it refused. An OK answer is kept. */
async function checkHeldToken(): Promise<void> {
  const inMemory = useAuthStore.getState().sessionToken;
  const token = heldToken(inMemory) ? inMemory : storedSession()?.sessionToken;
  const apiUrl = getApiUrl();
  if (!token || !apiUrl) return;
  try {
    const response = await fetch(`${apiUrl}/api/auth/session`, { headers: { 'X-Session-Token': token } });
    if (response.status === 401) refusedTokens.add(token);
    else if (response.ok) heldAnswer = { token, data: (await response.json()).data };
  } catch {
    // A network failure, a timeout or an unreadable body says nothing about the token: it stays held.
  }
}

/** Set when set-up could not read the session store; a session made in this page load is then never written to the database. */
let sessionStoreUnread = false;
