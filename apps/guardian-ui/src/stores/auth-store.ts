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
import {
  ACCOUNT_CLEAR_MARKER_KEY, getLocalDataGeneration, isCurrentLocalData, readAccountClearMarker,
} from '../lib/local-data-generation';
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
 * put back to what it was before the change. A change dropped in this browser, because all local
 * data was cleared or the tab holds another session since the change was made, carries 'browser'
 * too: nothing was sent for it, or nothing more was written.
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
// Session work and the guarded writer
// =============================================================================

type Change = Partial<AuthState>;

/**
 * What a piece of session work (set-up, a session request, a refresh, a profile save, a sign-out)
 * carries from the moment it starts.
 */
type SessionWork = {
  /** This tab's clear counter: it moves when this tab clears all local data. */
  counter: number;
  /** How many clears of all local data in another tab this tab had been told of. */
  told: number;
  /** The account marker every tab shares in local storage. Only a clear of all local data writes it; clearing the alert history does not. */
  marker: string;
  /** The session the work expects the tab to hold: the token at its start, then the token the work last set. */
  token: string | null;
  /** What the work leaves once a clear of all local data has landed under it; null for nothing. */
  afterClear: Change | null;
};

/**
 * All that work which waits is given of the store: the state to read, and the guarded writer. It has
 * no other way to change state.
 */
interface SessionState {
  get: () => AuthState;
  /**
   * Writes `change` and answers true while the work is current. Void work changes nothing, with one
   * exception: once a clear of all local data has landed under it, the tab is left with the work's
   * `afterClear`, unless the tab holds another session by then.
   */
  write: (work: SessionWork, change: Change) => boolean;
  /** All local data was cleared since the work began, or the tab holds another session than the work expects. */
  isVoid: (work: SessionWork) => boolean;
}

/** Clears of all local data in another tab that this tab was told of, by the account marker's storage event. */
let clearsToldOf = 0;

const beginWork = (token: string | null, afterClear: Change | null): SessionWork =>
  ({ counter: getLocalDataGeneration(), told: clearsToldOf, marker: readAccountClearMarker(), token, afterClear });

/** A clear of all local data, in this tab or another, has landed since the work began. */
const clearedSince = (work: SessionWork): boolean =>
  !isCurrentLocalData(work.counter) || work.told !== clearsToldOf || readAccountClearMarker() !== work.marker;

/**
 * What set-up or session creation leaves when a clear of all local data landed under it: the tab
 * signed out and done loading, so the persist step writes nothing of the old session back to local
 * storage.
 */
const LEFT_SIGNED_OUT: Change = {
  isLoading: false, isInitialized: true, isAuthenticated: false, sessionToken: null, sessionId: null, profile: null,
};

/** What a sign-out leaves, and a clear of all local data in another tab: no session, no profile, no device id. */
const SIGNED_OUT: Change = {
  isAuthenticated: false,
  isLoggedIn: false,
  user: null,
  deviceId: null,
  isGuest: true,
  sessionToken: null,
  sessionId: null,
  profile: null,
  expiresAt: null,
};

/**
 * Ends void set-up or session creation. The writer decides what that leaves: the tab signed out after
 * a clear of all local data, unless it holds another session by then, and nothing changed otherwise.
 */
function endVoid(session: SessionState, work: SessionWork): void {
  session.write(work, {});
}

/** After a wait in set-up or session creation: 'void' when the work is void, 'held' when the held session ends it, otherwise null. */
async function afterWait(session: SessionState, work: SessionWork): Promise<'void' | 'held' | null> {
  if (session.isVoid(work)) return 'void';
  const held = await keepsHeldSession(session);
  if (session.isVoid(work)) return 'void';
  return held ? 'held' : null;
}

/** How long a profile request or a sign-out request may go without an answer before it counts as failed. */
const REQUEST_LIMIT_MS = 15_000;

/**
 * Sends a request under the time limit. One that has no answer within the limit is aborted and
 * rejects, as a request that failed does; the limit holds whether or not the request heeds the abort.
 */
async function limitedRequest(url: string, init: RequestInit): Promise<Response> {
  const limit = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ranOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      limit.abort();
      reject(new Error(`The request had no answer within ${REQUEST_LIMIT_MS / 1000} seconds`));
    }, REQUEST_LIMIT_MS);
  });
  try {
    return await Promise.race([fetch(url, { ...init, signal: limit.signal }), ranOut]);
  } finally {
    clearTimeout(timer);
  }
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

function holdsServerToken(session: SessionState): boolean {
  return heldToken(session.get().sessionToken) || storedSession() !== null;
}

/** The database cannot be used and this tab already holds a server token. */
async function keepsHeldSession(session: SessionState): Promise<boolean> {
  if (!holdsServerToken(session)) return false;
  if (getDatabaseNotice()) return true;
  const available = await isDatabaseAvailable();
  return !available || getDatabaseNotice() !== null;
}

/** The server's OK answer to the check of the held token, with the token it was asked about. */
let heldAnswer: { token: string; data: { isGuest: boolean; profile: any; expiresAt: string | null } } | null = null;

/** Ends set-up on the held token, taking it from local storage when memory has none. When the server
 *  answered OK for that same token in this page load, the tab is signed in with that answer, in memory. */
function keepHeldSession(session: SessionState, work: SessionWork): void {
  const inMemory = session.get().sessionToken;
  const stored = heldToken(inMemory) ? null : storedSession();
  const token = stored ? stored.sessionToken : inMemory;
  const answer = heldAnswer !== null && heldAnswer.token === token ? heldAnswer.data : null;
  session.write(work, {
    ...(stored ? { sessionToken: stored.sessionToken, sessionId: stored.sessionId,
      deviceId: stored.deviceId, isGuest: stored.isGuest } : {}),
    ...(answer ? { isAuthenticated: true, isGuest: answer.isGuest, profile: answer.profile,
      expiresAt: answer.expiresAt, mode: 'full' as const } : {}),
    isInitialized: true, isLoading: false });
}

/**
 * Asks the server about the token this tab holds. Only a 401 marks it refused. An OK answer is kept.
 * Nothing is recorded from an answer that comes once set-up is void.
 */
async function checkHeldToken(session: SessionState, work: SessionWork): Promise<void> {
  const inMemory = session.get().sessionToken;
  const token = heldToken(inMemory) ? inMemory : storedSession()?.sessionToken;
  const apiUrl = getApiUrl();
  if (!token || !apiUrl) return;
  try {
    const response = await fetch(`${apiUrl}/api/auth/session`, { headers: { 'X-Session-Token': token } });
    if (session.isVoid(work)) return;
    if (response.status === 401) refusedTokens.add(token);
    else if (response.ok) {
      const { data } = await response.json();
      if (!session.isVoid(work)) heldAnswer = { token, data };
    }
  } catch {
    // A network failure, a timeout or an unreadable body says nothing about the token: it stays held.
  }
}

/** Set when set-up could not read the session store; a session made in this page load is then never written to the database. */
let sessionStoreUnread = false;

// =============================================================================
// Set-up and session creation
// =============================================================================

/**
 * Restores a saved session without the server's answer. A profile change is saved to the profile
 * cache: that copy is used when it holds this profile, otherwise the row's.
 */
async function restoreSaved(session: SessionState, localSession: LocalSession, work: SessionWork): Promise<void> {
  const cachedProfile = localSession.profile?.id ? await getCachedProfile(localSession.profile.id) : null;
  const next = await afterWait(session, work);
  if (next === 'void') return endVoid(session, work);
  if (next === 'held') return keepHeldSession(session, work);
  session.write(work, {
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
}

/**
 * Makes a session: on the server when one answers, otherwise a guest session in this browser.
 * `work` was begun where the work started (set-up's entry, or the call). Once it is void, nothing
 * more is written to this browser and no state is changed. When the cause is a clear of all local
 * data, a session row written meanwhile is deleted again and the tab is left signed out, unless it
 * holds another session by then. With `saved`, a browser-only session the server refused, a request
 * that fails goes on with that session and makes no guest.
 */
async function makeSession(session: SessionState, displayName: string | undefined, work: SessionWork, saved?: LocalSession): Promise<void> {
  /** The id of the session row this call wrote. */
  let written: string | null = null;
  /** Read inside each write's own transaction: the work is not void. */
  const current = () => !session.isVoid(work);
  /** A session row this call wrote is deleted again once a clear of all local data has landed. */
  const discard = async () => {
    if (written === null || !clearedSince(work)) return;
    try {
      await deleteLocalSession(written);
    } catch (error) {
      console.warn('[Auth] Could not delete a session saved across a clear:', error);
    }
  };
  const stop = async () => {
    await discard();
    endVoid(session, work);
  };
  if (!session.write(work, { isLoading: true })) return;
  const start = await afterWait(session, work);
  if (start === 'void') return stop();
  if (start === 'held') return keepHeldSession(session, work);

  try {
    const deviceId = session.get().deviceId || generateDeviceId();
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
    const answered = await afterWait(session, work);
    if (answered === 'void') return stop();
    if (answered === 'held') return keepHeldSession(session, work);

    // A session made after the store could not be read stays in memory and local storage.
    if (!sessionStoreUnread && await isDatabaseAvailable() && current()) {
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
      if (data.profile && current()) {
        await cacheProfile(data.profile, current);
      }
    }

    const stored = await afterWait(session, work);
    if (stored === 'void') return stop();
    if (stored === 'held') return keepHeldSession(session, work);
    const signedIn = session.write(work, {
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
    if (!signedIn) return discard();
  } catch (error) {
    const failed = await afterWait(session, work);
    if (failed === 'void') return stop();
    if (failed === 'held') return keepHeldSession(session, work);
    console.error('[Auth] Failed to create session:', error);
    if (saved) return restoreSaved(session, saved, work);

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

    const persistable = () => !sessionStoreUnread && current();
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
        deviceId: session.get().deviceId || generateDeviceId(),
        profile: guestProfile,
        createdAt: new Date().toISOString(),
        expiresAt,
        syncedAt: new Date().toISOString(),
      }, current);
    }

    const stored = await afterWait(session, work);
    if (stored === 'void') return stop();
    if (stored === 'held') return keepHeldSession(session, work);
    const signedIn = session.write(work, {
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
    if (!signedIn) return discard();
  }
}

/**
 * Set-up: restores the saved session, or makes one. A clear of all local data from its start on (a
 * sign-out or Clear All Local Data, in this tab or another) discards what it finds: the tab is left
 * signed out and nothing is written. Once the tab holds a session that set-up did not set, set-up
 * changes nothing.
 */
async function setUp(session: SessionState): Promise<void> {
  if (session.get().isInitialized) return;

  const work = beginWork(session.get().sessionToken, LEFT_SIGNED_OUT);
  const lastUsed = lastUsedSessionId();
  session.write(work, { isLoading: true });

  try {
    // Get device ID
    const deviceId = generateDeviceId();
    session.write(work, { deviceId });

    // Try to restore from IndexedDB
    let localSession: LocalSession | null;
    try {
      localSession = await readLocalSession(lastUsed);
    } catch {
      // Void set-up keeps nothing of a store that could not be read.
      if (session.isVoid(work)) return endVoid(session, work);
      // The session store could not be read, which is not a browser without a session.
      sessionStoreUnread = true;
      if (holdsServerToken(session)) await checkHeldToken(session, work);
      if (session.isVoid(work)) return endVoid(session, work);
      if (holdsServerToken(session)) return keepHeldSession(session, work);
      return makeSession(session, undefined, work);
    }
    if (session.isVoid(work)) return endVoid(session, work);

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
          const next = await afterWait(session, work);
          if (next === 'void') return endVoid(session, work);
          if (next === 'held') {
            // The OK answer counts for the token it was asked about, as checkHeldToken keeps it,
            // so a tab that holds that same token is signed in with it.
            heldAnswer = { token: localSession.token, data };
            return keepHeldSession(session, work);
          }
          session.write(work, {
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
        // An answer that comes once set-up is void is not recorded.
        if (session.isVoid(work)) return endVoid(session, work);
        // The server has ended the saved session: its token no longer counts as held.
        refusedTokens.add(localSession.token);
        const next = await afterWait(session, work);
        if (next === 'void') return endVoid(session, work);
        if (next === 'held') return keepHeldSession(session, work);
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
        await restoreSaved(session, localSession, work);
        return;
      }
    }

    // No valid session - create guest session
    await makeSession(session, undefined, work, refusedBrowserOnly);
  } catch (error) {
    console.error('[Auth] Initialization failed:', error);
    session.write(work, { isInitialized: true, isLoading: false });
  }
}

/** Asks the server for the session's profile and expiry. The answer counts for the session it was asked about. */
async function refresh(session: SessionState): Promise<void> {
  const token = session.get().sessionToken;
  if (!token) return;
  const work = beginWork(token, null);

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
      session.write(work, {
        profile: data.profile,
        expiresAt: data.expiresAt,
      });
    }
  } catch (error) {
    console.error('[Auth] Failed to refresh session:', error);
  }
}

// =============================================================================
// Profile saves
// =============================================================================

/**
 * This tab's profile saves under one session, one after another. A clear of all local data, in this
 * tab or in another tab this one is told of, or another session starts a new queue, so a save never
 * waits behind another session's.
 */
let profileSaves: { counter: number; token: string | null; last: Promise<unknown> } | null = null;

/** The error of a change dropped because all local data was cleared or the session changed since it was made. */
const dropped = () => new ProfileSaveError('browser',
  'Local data was cleared or the session changed after the profile change was made; it was not saved.');

/**
 * One profile save, run when the saves before it have settled. `work` was begun when the save was
 * made: once all local data was cleared since, or the tab holds another session, the save changes
 * nothing, sends nothing, writes nothing and is not saved, and a change it had made is not put back.
 * A reload notice set while the save waited its turn refuses it before anything is changed or sent.
 * Its change is built on the profile the saves before it settled (a change that was taken stays, one
 * that was not was put back), and a change that is not taken is put back to that profile. A session
 * on a server is decided by the server, within the request's time limit; with no server address set,
 * the save fails as a server failure. A browser-only session is decided by this browser's write.
 */
async function saveProfile(session: SessionState, change: (settled: UserProfile) => Partial<UserProfile>, work: SessionWork): Promise<void> {
  if (session.isVoid(work)) throw dropped();
  const notice = getDatabaseNotice();
  if (notice) throw new ProfileSaveRefused(notice);
  const token = work.token;
  const settled = session.get().profile;
  if (!settled) return;

  const updates = change(settled);
  const updatedProfile = { ...settled, ...updates, updatedAt: new Date().toISOString() };

  // Optimistic update
  if (!session.write(work, { profile: updatedProfile })) throw dropped();
  // A change that was not taken is put back, unless something else has replaced it since.
  const putBack = () => {
    if (session.get().profile === updatedProfile) session.write(work, { profile: settled });
  };
  // Read inside the write's own transaction: nothing is written to this browser once the save is void.
  const current = () => !session.isVoid(work);

  if (serverToken(token)) {
    // The profile lives on the server: its answer decides, whatever this browser can store.
    const apiUrl = getApiUrl();
    if (!apiUrl) {
      putBack();
      throw new ProfileSaveError('server', 'No server address is set; the profile change was not saved.');
    }
    let response: Response;
    try {
      response = await limitedRequest(`${apiUrl}/api/auth/profile`, {
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

  // A browser-only session: this browser's copy is the profile. A write that was not made is not a save.
  const written = await cacheProfile(updatedProfile, current);
  if (written === 'saved') return;
  putBack();
  throw written === 'cancelled' ? dropped() : new ProfileSaveError('browser', 'The profile change was not saved in this browser.');
}

/**
 * Queues a profile save, with the work of this moment: the clears so far and the session the tab
 * holds. Under a reload notice nothing is changed or sent, and the caller must be able to say so;
 * the save reads the notice again when its turn comes.
 */
function queueProfileSave(session: SessionState, change: (settled: UserProfile) => Partial<UserProfile>): Promise<void> {
  const notice = getDatabaseNotice();
  if (notice) return Promise.reject(new ProfileSaveRefused(notice));
  const work = beginWork(session.get().sessionToken, null);
  if (!profileSaves || profileSaves.counter !== work.counter || profileSaves.token !== work.token) {
    profileSaves = { counter: work.counter, token: work.token, last: Promise.resolve() };
  }
  const queue = profileSaves;
  const turn = queue.last.then(() => saveProfile(session, change, work));
  queue.last = turn.catch(() => undefined);
  return turn;
}

// =============================================================================
// Sign-out
// =============================================================================

/**
 * Signs out: ends the session on its server, within the request's time limit, then clears this
 * browser. A server that fails or does not answer does not keep the browser from being cleared.
 */
async function signOut(session: SessionState): Promise<void> {
  // Under a reload notice the browser cannot be cleared: refuse before the server session ends.
  const notice = getDatabaseNotice();
  if (notice) throw new Error(notice);

  const token = session.get().sessionToken;

  try {
    const apiUrl = getApiUrl();
    if (apiUrl && serverToken(token)) {
      await limitedRequest(`${apiUrl}/api/auth/session`, {
        method: 'DELETE',
        headers: {
          'X-Session-Token': token,
        },
      });
    }
  } catch (error) {
    console.error('[Auth] Logout error:', error);
  }

  // Finish deleting this browser's account data before allowing another session.
  // Keep the device connection so the next account can use the same server.
  // The clear lands under this work, so the writer leaves the tab signed out, unless the tab holds
  // a session made since the clear began.
  const work = beginWork(session.get().sessionToken, SIGNED_OUT);
  await clearLocalData({ preserveBackendConfig: true });
  session.write(work, SIGNED_OUT);
}

// =============================================================================
// Store
// =============================================================================

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => {
    /**
     * The one way session work changes state after a wait. While the work is current (no clear of all
     * local data since it began, and the tab holds the session the work expects) the change is
     * written, and a token it sets becomes the session the work expects. Void work changes nothing,
     * with one exception: once a clear of all local data has landed under it, the tab is left with
     * the work's `afterClear` while it holds the work's session or none; a session made since is
     * left alone.
     */
    const write = (work: SessionWork, change: Change): boolean => {
      const held = get().sessionToken;
      if (clearedSince(work)) {
        if (work.afterClear && (held === null || held === work.token)) set(work.afterClear);
        return false;
      }
      if (held !== work.token) return false;
      set(change);
      if (change.sessionToken !== undefined) work.token = change.sessionToken;
      return true;
    };
    const session: SessionState = {
      get,
      write,
      isVoid: (work) => clearedSince(work) || get().sessionToken !== work.token,
    };

    // A clear of all local data in another tab reaches this open tab as the storage event of the
    // account marker: the tab drops its session, its work in flight is void and its next profile
    // save starts a new queue. A browser sends the event to the other tabs only.
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('storage', (event) => {
        if (event.key !== ACCOUNT_CLEAR_MARKER_KEY) return;
        clearsToldOf += 1;
        profileSaves = null;
        set(SIGNED_OUT);
      });
    }

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
      initialize: () => setUp(session),

      // Create new session
      createSession: (displayName?: string) => makeSession(session, displayName, beginWork(get().sessionToken, LEFT_SIGNED_OUT)),

      // Refresh session
      refreshSession: () => refresh(session),

      // Update profile
      updateProfile: (updates) => queueProfileSave(session, () => updates),

      // Update preferences
      updatePreferences: async (prefs) => {
        if (!get().profile) return;
        await queueProfileSave(session, (settled) => ({ preferences: { ...settled.preferences, ...prefs } }));
      },

      // Update notification settings
      updateNotificationSettings: async (settings) => {
        if (!get().profile) return;
        await queueProfileSave(session, (settled) => ({ notificationSettings: { ...settled.notificationSettings, ...settings } }));
      },

      // Logout
      logout: () => signOut(session),

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
