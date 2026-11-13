/** @jest-environment jsdom */
import { waitFor } from '@testing-library/react';
import { openDB } from 'idb';
import { IDBFactory } from 'fake-indexeddb';
import { heldToken, holdToken, oldTab, profile, refused, server, session, sessionAnswer, stored, unreachable } from './helpers/saved-history';
require('fake-indexeddb/auto');
jest.setTimeout(60000);
Object.defineProperty(global, 'structuredClone', { configurable: true, value: (value: unknown) =>
  require('v8').deserialize(require('v8').serialize(value)),
});
const BLOCKED = 'Close other SafeOS tabs, then reload this page to finish updating your saved history. Until you reload, new alerts in this tab are shown but not saved, and acknowledging, dismissing or clearing alerts is not saved. Everything already saved comes back as it was after you reload.';
const UPDATED = 'SafeOS has been updated in another tab. Reload this page to keep saving history. Until you reload, new alerts in this tab are shown but not saved, and acknowledging, dismissing or clearing alerts is not saved. Everything already saved comes back as it was after you reload.';

/** One tab: a fresh set of modules over the shared database and local storage. */
async function tab() {
  jest.resetModules();
  const { useAuthStore: auth } = await import('@/stores/auth-store');
  const db = await import('@/lib/client-db');
  const { clearLocalData } = await import('@/lib/local-data');
  return { auth, db, clearLocalData };
}
const tookIt = () => ({ ok: true, status: 200, json: async () => ({ success: true }) });
/** The real clock, kept for the cases that fake the timers. */
const realSetTimeout = setTimeout;
const pause = (ms: number) => new Promise<void>((resolve) => { realSetTimeout(resolve, ms); });
/** How a piece of work ended: 'saved', or the error it rejected with. The handler is attached at once. */
const outcomeOf = (work: Promise<unknown>): Promise<unknown> => work.then(() => 'saved', (error: unknown) => error);
/** The outcome, or 'pending' when the work has not settled within `ms` of the real clock. */
const within = (outcome: Promise<unknown>, ms: number): Promise<unknown> => Promise.race([outcome, pause(ms).then(() => 'pending')]);
/** This browser cannot write its profile copy, as when storage is full. */
function profileCacheFull() {
  const put = IDBObjectStore.prototype.put;
  jest.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<typeof put>) {
    if (this.name === 'profile_cache') throw new DOMException('No space left', 'QuotaExceededError');
    return put.apply(this, args);
  });
}
function blockedStorage() {
  return new DOMException('blocked', 'SecurityError');
}
beforeEach(() => {
  jest.resetModules();
  global.indexedDB = new IDBFactory();
  localStorage.clear();
  global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

it('uses the first valid saved session in key order', async () => {
  (await oldTab({ alerts: [], sessions: [
    { ...session, id: '100-server', token: 'first-token', createdAt: '2026-10-01T00:00:00Z' },
    { ...session, id: 'guest-200', token: 'local-guest-200', createdAt: '2026-11-01T00:00:00Z' },
  ] })).close();
  const { auth } = await tab();
  await auth.getState().initialize();
  expect(auth.getState().sessionToken).toBe('first-token');
});

const renewed = { id: 'renewed-person', displayName: 'Renewed person' };

it('keeps only the new row after the server refused the saved session', async () => {
  (await oldTab({ alerts: [], sessions: [{ ...session, id: 'S1' }] })).close();
  server({ check: () => refused, create: () => sessionAnswer('renewed-token', renewed, 'S2') });
  const { auth } = await tab();
  await auth.getState().initialize();
  expect((await stored('local_session')).map((row) => row.id)).toEqual(['S2']);
});

it('uses the replacement session on the next load after the server refused the saved one', async () => {
  (await oldTab({ alerts: [], sessions: [{ ...session, id: 'S1' }] })).close();
  const calls = server({
    check: (token) => (token === 'saved-token' ? refused : sessionAnswer(token, renewed, 'S2')),
    create: () => sessionAnswer('renewed-token', renewed, 'S2'),
  });
  const first = await tab();
  await first.auth.getState().initialize();
  expect(first.auth.getState().sessionToken).toBe('renewed-token');
  expect(calls.posts()).toHaveLength(1);
  const second = await tab();
  await second.auth.getState().initialize();
  expect(calls.checks().map((call) => call.token)).toEqual(['saved-token', 'renewed-token']);
  expect(calls.posts()).toHaveLength(1);
  expect(second.auth.getState().sessionToken).toBe('renewed-token');
});

it('keeps a browser-only saved session when a configured server refuses its token', async () => {
  (await oldTab({ alerts: [], sessions: [{ ...session, id: 'guest-100', token: 'local-guest-100' }] })).close();
  server({ check: () => refused, create: () => sessionAnswer('renewed-token', renewed, 'S2') });
  const { auth } = await tab();
  await auth.getState().initialize();
  expect((await stored('local_session')).map((row) => row.id)).toContain('guest-100');
});

it('uses the replacement session on the next load when another saved row sorts before it', async () => {
  (await oldTab({ alerts: [], sessions: [
    { ...session, id: 'S1', token: 'refused-token' },
    { ...session, id: 'S2', token: 'other-token', profile: { ...profile, id: 'other-person' } },
  ] })).close();
  const calls = server({
    check: (token) => (token === 'refused-token' ? refused : sessionAnswer(token, renewed, token === 'S3-token' ? 'S3' : `${token}-session`)),
    create: () => sessionAnswer('S3-token', renewed, 'S3'),
  });
  const first = await tab();
  await first.auth.getState().initialize();
  expect(first.auth.getState().sessionToken).toBe('S3-token');
  expect((await stored('local_session')).map((row) => row.id)).toEqual(['S2', 'S3']);
  const second = await tab();
  await second.auth.getState().initialize();
  expect(calls.checks().map((call) => call.token)).toEqual(['refused-token', 'S3-token']);
  expect(second.auth.getState().sessionToken).toBe('S3-token');
  expect(calls.posts()).toHaveLength(1);
});

it('keeps the saved session and asks for no new one when its check answers 503', async () => {
  (await oldTab()).close();
  const calls = server({ check: () => ({ ok: false, status: 503 }), create: () => sessionAnswer('new-token') });
  const { auth } = await tab();
  await auth.getState().initialize();
  expect(auth.getState().sessionToken).toBe('saved-token');
  expect(calls.posts()).toHaveLength(0);
  expect(auth.getState().isAuthenticated).toBe(true);
  expect(auth.getState().profile?.id).toBe('returning-person');
  expect(await stored('local_session')).toEqual([session]);
});

it.each(['answers 500', 'fails'])('rejects a profile change of a server session that the server did not take, and puts the profile back: the request %s', async (outcome) => {
  (await oldTab()).close();
  const calls = server({ profile: outcome === 'answers 500' ? () => ({ ok: false, status: 500 }) : undefined });
  const { auth } = await tab();
  await auth.getState().initialize();
  expect(auth.getState().sessionToken).toBe('saved-token');
  const before = auth.getState().profile;
  await expect(auth.getState().updateProfile({ displayName: 'Changed name' }))
    .rejects.toMatchObject({ name: 'ProfileSaveError' });
  expect(calls.sent('PATCH', '/api/auth/profile')).toHaveLength(1);
  expect(auth.getState().profile).toBe(before);
  expect(await stored('profile_cache')).toEqual([]);
});

it('keeps a profile change the server took when this browser cannot write its copy', async () => {
  (await oldTab()).close();
  const calls = server({ profile: tookIt });
  const { auth } = await tab();
  await auth.getState().initialize();
  profileCacheFull();
  await expect(auth.getState().updateProfile({ displayName: 'Changed name' })).resolves.toBeUndefined();
  expect(calls.sent('PATCH', '/api/auth/profile')).toHaveLength(1);
  expect(auth.getState().profile?.displayName).toBe('Changed name');
});

it('rejects a profile change of a browser-only session that this browser cannot write, and puts the profile back', async () => {
  const { auth } = await tab();
  await auth.getState().initialize();
  expect(auth.getState().sessionToken).toMatch(/^local-/);
  const before = auth.getState().profile;
  profileCacheFull();
  await expect(auth.getState().updateProfile({ displayName: 'Changed name' }))
    .rejects.toMatchObject({ name: 'ProfileSaveError' });
  expect(auth.getState().profile).toBe(before);
});

it('sends a profile change of a server session when this browser’s database cannot be opened', async () => {
  jest.spyOn(indexedDB, 'open').mockImplementation(() => { throw blockedStorage(); });
  const calls = server({ create: () => sessionAnswer('server-token'), profile: tookIt });
  const { auth } = await tab();
  await auth.getState().initialize();
  expect(auth.getState().sessionToken).toBe('server-token');
  await expect(auth.getState().updateProfile({ displayName: 'Changed name' })).resolves.toBeUndefined();
  expect(calls.sent('PATCH', '/api/auth/profile')).toHaveLength(1);
  expect(auth.getState().profile?.displayName).toBe('Changed name');
});

it('restores a browser-only session with the profile change saved before the reload', async () => {
  const first = await tab();
  await first.auth.getState().initialize();
  const token = first.auth.getState().sessionToken;
  expect(token).toMatch(/^local-/);
  await first.auth.getState().updateProfile({ displayName: 'Changed name' });
  const second = await tab();
  await second.auth.getState().initialize();
  expect(second.auth.getState().sessionToken).toBe(token);
  expect(second.auth.getState().profile?.displayName).toBe('Changed name');
});

it.each(['answers OK', 'fails'])('saves nothing and signs nobody in when a session request %s after local data was cleared', async (outcome) => {
  let settle!: { answer: (value: unknown) => void; fail: (error: Error) => void };
  const pending = new Promise((answer, fail) => { settle = { answer, fail }; });
  const calls = server({ create: () => pending as never });
  const { auth } = await tab();
  const setUp = auth.getState().initialize();
  await waitFor(() => expect(calls.posts()).toHaveLength(1), { timeout: 5000 });
  await auth.getState().logout();
  if (outcome === 'answers OK') settle.answer(sessionAnswer('late-token'));
  else settle.fail(new TypeError('Failed to fetch'));
  await setUp;
  expect(await stored('local_session')).toEqual([]);
  expect(await stored('profile_cache')).toEqual([]);
  expect(auth.getState().isAuthenticated).toBe(false);
  expect(auth.getState().sessionToken).toBeNull();
  expect(auth.getState().profile).toBeNull();
  expect(auth.getState().isLoading).toBe(false);
  expect(auth.getState().isInitialized).toBe(true);
});

it.each(['answers OK', 'fails'])('saves nothing and signs nobody in when a session request %s after another tab cleared local data', async (outcome) => {
  let settle!: { answer: (value: unknown) => void; fail: (error: Error) => void };
  const pending = new Promise((answer, fail) => { settle = { answer, fail }; });
  const calls = server({ create: () => pending as never });
  const first = await tab();
  const setUp = first.auth.getState().initialize();
  await waitFor(() => expect(calls.posts()).toHaveLength(1), { timeout: 5000 });
  const other = await tab();
  await other.clearLocalData();
  if (outcome === 'answers OK') settle.answer(sessionAnswer('late-token'));
  else settle.fail(new TypeError('Failed to fetch'));
  await setUp;
  expect(await stored('local_session')).toEqual([]);
  expect(first.auth.getState().isAuthenticated).toBe(false);
  expect(first.auth.getState().sessionToken).toBeNull();
  expect(first.auth.getState().isLoading).toBe(false);
  expect(first.auth.getState().isInitialized).toBe(true);
});

it.each(['answers 503', 'answers 401', 'answers OK'])('stays signed out when the saved session check %s after this tab signed out', async (outcome) => {
  (await oldTab()).close();
  let answer!: (value: unknown) => void;
  const pending = new Promise((resolve) => { answer = resolve; });
  const calls = server({ check: () => pending as never, create: () => sessionAnswer('new-token') });
  const { auth } = await tab();
  const setUp = auth.getState().initialize();
  await waitFor(() => expect(calls.checks()).toHaveLength(1), { timeout: 5000 });
  await auth.getState().logout();
  answer(outcome === 'answers 503' ? { ok: false, status: 503 } : outcome === 'answers 401' ? refused : sessionAnswer('saved-token'));
  await setUp;
  expect(auth.getState().isAuthenticated).toBe(false);
  expect(auth.getState().sessionToken).toBeNull();
  expect(auth.getState().profile).toBeNull();
  expect(calls.posts()).toHaveLength(0);
  expect(heldToken()).toBeNull();
  expect(await stored('local_session')).toEqual([]);
  expect(await stored('profile_cache')).toEqual([]);
  expect(auth.getState().isLoading).toBe(false);
  expect(auth.getState().isInitialized).toBe(true);
});

it('deletes the session row written while a clear of local data landed', async () => {
  let reached!: () => void;
  const writing = new Promise<void>((resolve) => { reached = resolve; });
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  jest.resetModules();
  // The session row's write waits until the clear has finished.
  jest.doMock('@/lib/client-db', () => {
    const actual = jest.requireActual<typeof import('@/lib/client-db')>('@/lib/client-db');
    return { ...actual, saveLocalSession: async (row: Parameters<typeof actual.saveLocalSession>[0]) => {
      reached();
      await held;
      return actual.saveLocalSession(row);
    } };
  });
  try {
    server({ create: () => sessionAnswer('late-token') });
    const { useAuthStore: auth } = await import('@/stores/auth-store');
    const { clearLocalData } = await import('@/lib/local-data');
    const made = auth.getState().createSession();
    await writing;
    await clearLocalData();
    release();
    await made;
    expect(await stored('local_session')).toEqual([]);
    expect(auth.getState().isAuthenticated).toBe(false);
  } finally {
    jest.dontMock('@/lib/client-db');
  }
});

it('makes no session while a notice is set and the tab holds a token', async () => {
  holdToken('held-token');
  const calls = server({ create: () => sessionAnswer('new-token') });
  const old = await oldTab();
  try {
    const { auth, db } = await tab();
    await db.getCachedAlerts();
    expect(db.getDatabaseNotice()).not.toBeNull();
    await auth.getState().createSession();
    expect(calls.posts()).toHaveLength(0);
    expect((await old.getAll('local_session')).map((row) => row.id)).toEqual(['saved-session']);
    expect(auth.getState().sessionToken).toBe('held-token');
    expect(heldToken()).toBe('held-token');
    expect(auth.getState().profile).toBeNull();
    expect(auth.getState().isInitialized).toBe(true);
    await expect(auth.getState().updateProfile({})).rejects.toThrow(BLOCKED);
  } finally {
    old.close();
  }
});

it.each(['answered', 'failed'])('keeps the held token when a session request in flight is %s after the database closed for an update', async (outcome) => {
  holdToken('held-token');
  let settle!: { answer: (value: unknown) => void; fail: (error: Error) => void };
  const pending = new Promise((answer, fail) => { settle = { answer, fail }; });
  const calls = server({ create: () => pending as never });
  const { auth, db } = await tab();
  const setUp = auth.getState().initialize();
  await waitFor(() => expect(calls.posts()).toHaveLength(1), { timeout: 5000 });
  const newer = await openDB('safeos-guardian', 8);
  try {
    await waitFor(() => expect(db.getDatabaseNotice()).toMatch(/updated in another tab/), { timeout: 5000 });
    if (outcome === 'answered') settle.answer(sessionAnswer('new-token'));
    else settle.fail(new TypeError('Failed to fetch'));
    await setUp;
    expect(auth.getState().sessionToken).toBe('held-token');
    expect(heldToken()).toBe('held-token');
    expect(String(auth.getState().sessionToken)).not.toMatch(/^local-/);
    expect(await newer.getAll('local_session')).toEqual([]);
  } finally {
    newer.close();
  }
});

it.each(['held', 'none'])('goes on without the database when storage fails to open once: token %s', async (token) => {
  (await oldTab()).close();
  if (token === 'held') holdToken('held-token');
  const calls = server({ check: unreachable, create: () => sessionAnswer('server-token') });
  jest.spyOn(indexedDB, 'open').mockImplementationOnce(() => { throw blockedStorage(); });
  const first = await tab();
  await first.auth.getState().initialize();
  expect(first.db.getDatabaseNotice()).toBeNull();
  if (token === 'held') {
    expect(calls.posts()).toHaveLength(0);
    expect(first.auth.getState().sessionToken).toBe('held-token');
    expect(heldToken()).toBe('held-token');
    return;
  }
  expect(calls.posts()).toHaveLength(1);
  expect(first.auth.getState().sessionToken).toBe('server-token');
  expect(heldToken()).toBe('server-token');
  expect((await stored('local_session')).map((row) => row.id)).toEqual(['saved-session']);
  const reloaded = await tab();
  await reloaded.auth.getState().initialize();
  expect(reloaded.auth.getState().sessionToken).toBe('saved-token');
  expect(reloaded.auth.getState().profile?.id).toBe('returning-person');
});

it('shows the update notice and makes no session when the stored database is newer than the code', async () => {
  (await openDB('safeos-guardian', 8, { upgrade(database) {
    database.createObjectStore('local_session', { keyPath: 'id' });
  } })).close();
  holdToken('held-token');
  const calls = server();
  const { auth, db } = await tab();
  await auth.getState().initialize();
  expect(db.getDatabaseNotice()).toBe(UPDATED);
  expect(calls.posts()).toHaveLength(0);
  expect(auth.getState().sessionToken).toBe('held-token');
});

it.each([
  'refused with the same copy', 'refused after another tab renewed', 'answered 500', 'unreachable', 'answered OK',
])('asks the server about a held token while the database cannot be opened: %s', async (answer) => {
  jest.spyOn(indexedDB, 'open').mockImplementation(() => { throw blockedStorage(); });
  holdToken('held-token');
  let ended = true;
  const calls = server({
    create: () => sessionAnswer('new-token'),
    check: (token) => {
      if (answer === 'refused with the same copy') return ended ? refused : sessionAnswer(token);
      if (answer === 'refused after another tab renewed') {
        // Another tab's store writes its renewed session here before this answer is read.
        holdToken('other-token');
        return refused;
      }
      if (answer === 'answered 500') return { ok: false, status: 500 };
      if (answer === 'unreachable') return unreachable();
      return sessionAnswer(token, { id: 'held-person', displayName: 'Held person' });
    },
  });
  const { auth, db } = await tab();
  await auth.getState().initialize();
  expect(calls.checks().map((call) => call.token)).toEqual(['held-token']);
  expect(db.getDatabaseNotice()).toBeNull();
  expect(auth.getState().isInitialized).toBe(true);
  if (answer === 'refused with the same copy') {
    expect(calls.posts()).toHaveLength(1);
    expect(auth.getState().sessionToken).toBe('new-token');
    expect(heldToken()).toBe('new-token');
    ended = false;
    const reloaded = await tab();
    await reloaded.auth.getState().initialize();
    expect(calls.posts()).toHaveLength(1);
    expect(reloaded.auth.getState().sessionToken).toBe('new-token');
    expect(reloaded.auth.getState().isAuthenticated).toBe(true);
    return;
  }
  expect(calls.posts()).toHaveLength(0);
  if (answer === 'refused after another tab renewed') {
    expect(auth.getState().sessionToken).toBe('other-token');
    expect(heldToken()).toBe('other-token');
    return;
  }
  expect(auth.getState().sessionToken).toBe('held-token');
  expect(heldToken()).toBe('held-token');
  if (answer === 'answered OK') {
    expect(auth.getState().isAuthenticated).toBe(true);
    expect(auth.getState().mode).toBe('full');
    expect(auth.getState().profile?.id).toBe('held-person');
    return;
  }
  expect(auth.getState().isAuthenticated).toBe(false);
  expect(auth.getState().profile).toBeNull();
});

it('signs in with the server profile when the saved session check answers OK after the database closed for an update, and the tab holds that token', async () => {
  (await oldTab()).close();
  holdToken('saved-token');
  let answer!: (value: unknown) => void;
  const pending = new Promise((resolve) => { answer = resolve; });
  const calls = server({ check: () => pending as never, create: () => sessionAnswer('new-token') });
  const { auth, db } = await tab();
  const setUp = auth.getState().initialize();
  await waitFor(() => expect(calls.checks()).toHaveLength(1), { timeout: 5000 });
  const newer = await openDB('safeos-guardian', 8);
  try {
    await waitFor(() => expect(db.getDatabaseNotice()).toMatch(/updated in another tab/), { timeout: 5000 });
    answer(sessionAnswer('saved-token', { id: 'server-person', displayName: 'Server person' }));
    await setUp;
    expect(calls.checks().map((call) => call.token)).toEqual(['saved-token']);
    expect(auth.getState().isAuthenticated).toBe(true);
    expect(auth.getState().profile?.id).toBe('server-person');
    expect(auth.getState().sessionToken).toBe('saved-token');
    expect(heldToken()).toBe('saved-token');
    expect(calls.posts()).toHaveLength(0);
    expect(await newer.getAll('local_session')).toEqual([session]);
  } finally {
    newer.close();
  }
});

it('adopts a renewal in flight when the database closes for an update after the server refused the saved token', async () => {
  (await oldTab()).close();
  holdToken('saved-token');
  let answer!: (value: unknown) => void;
  const pending = new Promise((resolve) => { answer = resolve; });
  const calls = server({ check: () => refused, create: () => pending as never });
  const { auth, db } = await tab();
  const setUp = auth.getState().initialize();
  await waitFor(() => expect(calls.posts()).toHaveLength(1), { timeout: 5000 });
  const newer = await openDB('safeos-guardian', 8);
  try {
    await waitFor(() => expect(db.getDatabaseNotice()).toMatch(/updated in another tab/), { timeout: 5000 });
    answer(sessionAnswer('new-token'));
    await setUp;
    expect(auth.getState().sessionToken).toBe('new-token');
    expect(heldToken()).toBe('new-token');
    // The refused row was deleted before the renewal was asked for; nothing was written after the notice.
    expect(await newer.getAll('local_session')).toEqual([]);
  } finally {
    newer.close();
  }
});

it('signs in with the server profile when another tab runs Monitor’s Clear all while set-up waits on its session check', async () => {
  (await oldTab()).close();
  let answer!: (value: unknown) => void;
  const pending = new Promise((resolve) => { answer = resolve; });
  const calls = server({ check: () => pending as never });
  const first = await tab();
  const setUp = first.auth.getState().initialize();
  await waitFor(() => expect(calls.checks()).toHaveLength(1), { timeout: 5000 });
  const alertMarker = localStorage.getItem('safeos_local_data_cleared');
  await tab();
  const { useMonitoringStore: monitoring } = await import('@/stores/monitoring-store');
  monitoring.getState().clearAlerts();
  await monitoring.getState().hydrateAlerts();
  // The alert history was cleared, which names itself to every tab.
  expect(localStorage.getItem('safeos_local_data_cleared')).not.toBe(alertMarker);
  answer(sessionAnswer('saved-token', { id: 'server-person', displayName: 'Server person' }));
  await setUp;
  expect(first.auth.getState().isAuthenticated).toBe(true);
  expect(first.auth.getState().profile?.id).toBe('server-person');
  expect(first.auth.getState().sessionToken).toBe('saved-token');
});

it('stays signed out and leaves no session token in local storage when another tab clears local data while a held token is checked and the session store cannot be read', async () => {
  holdToken('held-token');
  let answer!: (value: unknown) => void;
  const pending = new Promise((resolve) => { answer = resolve; });
  const calls = server({ check: () => pending as never, create: () => sessionAnswer('new-token') });
  // The session store cannot be read. A clear, which writes every store in one transaction, still runs.
  const transaction = IDBDatabase.prototype.transaction;
  jest.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, ...args: Parameters<typeof transaction>) {
    if (args[0] === 'local_session') throw new DOMException('The session store cannot be read', 'UnknownError');
    return transaction.apply(this, args);
  });
  const first = await tab();
  const setUp = first.auth.getState().initialize();
  await waitFor(() => expect(calls.checks()).toHaveLength(1), { timeout: 5000 });
  const other = await tab();
  await other.clearLocalData();
  answer(sessionAnswer('held-token', { id: 'held-person', displayName: 'Held person' }));
  await setUp;
  expect(first.auth.getState().isAuthenticated).toBe(false);
  expect(first.auth.getState().sessionToken).toBeNull();
  expect(heldToken()).toBeNull();
  expect(calls.posts()).toHaveLength(0);
});

it('leaves no session token in local storage and stays signed out when another tab clears local data during set-up', async () => {
  (await oldTab()).close();
  holdToken('saved-token');
  let answer!: (value: unknown) => void;
  const pending = new Promise((resolve) => { answer = resolve; });
  const calls = server({ check: () => pending as never });
  const first = await tab();
  expect(first.auth.getState().sessionToken).toBe('saved-token');
  const setUp = first.auth.getState().initialize();
  await waitFor(() => expect(calls.checks()).toHaveLength(1), { timeout: 5000 });
  const other = await tab();
  await other.clearLocalData();
  answer(sessionAnswer('saved-token'));
  await setUp;
  expect(heldToken()).toBeNull();
  expect(first.auth.getState().isAuthenticated).toBe(false);
  expect(first.auth.getState().sessionToken).toBeNull();
  expect(first.auth.getState().sessionId).toBeNull();
  expect(first.auth.getState().profile).toBeNull();
});

/**
 * Holds the next clear of all local data open: its transaction starts and keeps running, and it has
 * neither emptied the profile cache nor named itself until `release` is called.
 */
function holdNextClear() {
  const clear = IDBObjectStore.prototype.clear;
  const count = IDBObjectStore.prototype.count;
  let reached!: () => void;
  const started = new Promise<void>((resolve) => { reached = resolve; });
  let armed = true;
  let released = false;
  const opened = jest.spyOn(IDBDatabase.prototype, 'transaction');
  jest.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(function (this: IDBObjectStore) {
    if (!armed || this.name !== 'profile_cache') return clear.call(this);
    armed = false;
    const store = this;
    // Reads keep the transaction running; the store is emptied once released. idb awaits the promise as a request.
    return new Promise((resolve, reject) => {
      const spin = () => {
        const read = count.call(store);
        read.onsuccess = () => {
          if (!released) return spin();
          const emptied = clear.call(store);
          emptied.onsuccess = () => resolve(undefined);
          emptied.onerror = () => reject(emptied.error);
        };
      };
      spin();
      reached();
    }) as unknown as IDBRequest<undefined>;
  });
  return {
    started,
    release: () => { released = true; },
    /** Resolves once a transaction over the profile cache has been asked for since `from` calls. */
    profileWriteQueued: (from: number) => waitFor(() => expect(opened.mock.calls.slice(from)
      .some(([scope]) => [scope].flat().includes('profile_cache'))).toBe(true), { timeout: 5000 }),
    calls: () => opened.mock.calls.length,
  };
}

it.each(['a server session whose server takes it', 'a browser-only session'])('keeps the profile cache empty when a profile save of %s is written behind a clear of local data in another tab', async (kind) => {
  if (kind.startsWith('a server')) {
    (await oldTab()).close();
    server({ profile: tookIt });
  }
  const first = await tab();
  await first.auth.getState().initialize();
  expect(String(first.auth.getState().sessionToken).startsWith('local-')).toBe(!kind.startsWith('a server'));
  const other = await tab();
  const hold = holdNextClear();
  const clearing = other.db.clearClientData();
  await hold.started;
  const from = hold.calls();
  const saving = outcomeOf(first.auth.getState().updateProfile({ displayName: 'Changed name' }));
  await hold.profileWriteQueued(from);
  hold.release();
  await clearing;
  // The server took a server session's change. A browser-only session's change was not written, so it was not saved.
  expect(await saving).toEqual(kind.startsWith('a server') ? 'saved' : expect.objectContaining({ name: 'ProfileSaveError', place: 'browser' }));
  expect(await stored('profile_cache')).toEqual([]);
});

it('keeps the profile cache and the session store empty when session creation writes its profile behind a clear of local data in another tab', async () => {
  let reached!: () => void;
  const written = new Promise<void>((resolve) => { reached = resolve; });
  let open!: () => void;
  const gate = new Promise<void>((resolve) => { open = resolve; });
  jest.resetModules();
  // The session row is written; session creation then waits before it writes the profile.
  jest.doMock('@/lib/client-db', () => {
    const actual = jest.requireActual<typeof import('@/lib/client-db')>('@/lib/client-db');
    return { ...actual, saveLocalSession: async (...args: Parameters<typeof actual.saveLocalSession>) => {
      const result = await actual.saveLocalSession(...args);
      reached();
      await gate;
      return result;
    } };
  });
  let first!: (typeof import('@/stores/auth-store'))['useAuthStore'];
  try {
    first = (await import('@/stores/auth-store')).useAuthStore;
  } finally {
    jest.dontMock('@/lib/client-db');
  }
  server({ create: () => sessionAnswer('new-token') });
  const setUp = first.getState().initialize();
  await written;
  expect((await stored('local_session')).map((row) => row.id)).toEqual(['new-token-session']);
  const other = await tab();
  const hold = holdNextClear();
  const clearing = other.db.clearClientData();
  await hold.started;
  const from = hold.calls();
  open();
  await hold.profileWriteQueued(from);
  hold.release();
  await clearing;
  await setUp;
  expect(await stored('profile_cache')).toEqual([]);
  expect(await stored('local_session')).toEqual([]);
});

/** Answers the test settles itself, handed out in the order the requests are sent. */
function answers(count: number) {
  const settle: Array<{ answer: (value: unknown) => void; fail: (error: Error) => void }> = [];
  const pending = Array.from({ length: count }, (_, index) => new Promise((answer, fail) => { settle[index] = { answer, fail }; }));
  let next = 0;
  return { route: () => pending[next++] as never, settle };
}

it('keeps the last accepted profile when two profile saves in flight both fail', async () => {
  (await oldTab()).close();
  const patches = answers(2);
  const calls = server({ profile: patches.route });
  const { auth } = await tab();
  await auth.getState().initialize();
  const before = auth.getState().profile;
  const first = auth.getState().updateProfile({ displayName: 'First' });
  const second = auth.getState().updateProfile({ displayName: 'Second' });
  await waitFor(() => expect(calls.sent('PATCH', '/api/auth/profile').length).toBeGreaterThan(0), { timeout: 5000 });
  patches.settle[0].fail(new TypeError('Failed to fetch'));
  await expect(first).rejects.toMatchObject({ name: 'ProfileSaveError' });
  await waitFor(() => expect(calls.sent('PATCH', '/api/auth/profile')).toHaveLength(2), { timeout: 5000 });
  patches.settle[1].fail(new TypeError('Failed to fetch'));
  await expect(second).rejects.toMatchObject({ name: 'ProfileSaveError' });
  expect(auth.getState().profile).toBe(before);
});

it('keeps the second save’s profile in the profile cache when two saves in flight are answered OK in the reverse order', async () => {
  (await oldTab()).close();
  const patches = answers(2);
  const calls = server({ profile: patches.route });
  const { auth } = await tab();
  await auth.getState().initialize();
  const first = auth.getState().updateProfile({ displayName: 'First' });
  const second = auth.getState().updateProfile({ displayName: 'Second' });
  await waitFor(() => expect(calls.sent('PATCH', '/api/auth/profile').length).toBeGreaterThan(0), { timeout: 5000 });
  // The second request's answer comes first.
  patches.settle[1].answer(tookIt());
  await Promise.race([second, new Promise((resolve) => setTimeout(resolve, 500))]);
  patches.settle[0].answer(tookIt());
  await Promise.all([first, second]);
  expect((await stored('profile_cache')).map((row) => row.displayName)).toEqual(['Second']);
  expect(auth.getState().profile?.displayName).toBe('Second');
});

it('rejects a profile change of a server session as a server failure when no server address is set, and puts the profile back', async () => {
  (await oldTab()).close();
  const calls = server({ profile: tookIt });
  const { auth } = await tab();
  await auth.getState().initialize();
  expect(auth.getState().sessionToken).toBe('saved-token');
  const before = auth.getState().profile;
  localStorage.removeItem('safeos_backend_config');
  await expect(auth.getState().updateProfile({ displayName: 'Changed name' }))
    .rejects.toMatchObject({ name: 'ProfileSaveError', place: 'server' });
  expect(calls.sent('PATCH', '/api/auth/profile')).toHaveLength(0);
  expect(auth.getState().profile).toBe(before);
});

it('keeps using a browser-only saved session and its cached profile across loads when the server refuses its token and cannot make a session', async () => {
  (await oldTab({ alerts: [], sessions: [{ ...session, id: 'guest-100', token: 'local-guest-100' }] })).close();
  const calls = server({ check: () => refused, create: () => ({ ok: false, status: 503 }) });
  const first = await tab();
  await first.auth.getState().initialize();
  await first.auth.getState().updateProfile({ displayName: 'Changed name' });
  const second = await tab();
  await second.auth.getState().initialize();
  expect((await stored('local_session')).map((row) => row.id)).toEqual(['guest-100']);
  expect(second.auth.getState().sessionToken).toBe('local-guest-100');
  expect(second.auth.getState().profile?.displayName).toBe('Changed name');
  expect(calls.posts()).toHaveLength(2);
});

it.each(['a browser-only session', 'a server session whose server takes what it is sent'])('writes nothing to this browser for two profile saves of %s made while another tab clears all local data', async (kind) => {
  const onServer = kind.startsWith('a server');
  if (onServer) (await oldTab()).close();
  const calls = onServer ? server({ profile: tookIt }) : null;
  const first = await tab();
  await first.auth.getState().initialize();
  expect(String(first.auth.getState().sessionToken).startsWith('local-')).toBe(!onServer);
  const marker = localStorage.getItem(ACCOUNT_MARKER);
  const other = await tab();
  const hold = holdNextClear();
  const clearing = other.db.clearClientData();
  await hold.started;
  const from = hold.calls();
  // Both saves are made while the clear is in progress; the second's turn comes once the clear has landed.
  const one = outcomeOf(first.auth.getState().updateProfile({ displayName: 'First' }));
  const two = outcomeOf(first.auth.getState().updateProfile({ displayName: 'Second' }));
  await hold.profileWriteQueued(from);
  hold.release();
  await clearing;
  const outcomes = [await one, await two];
  expect(await stored('profile_cache')).toEqual([]);
  if (calls) {
    // The first change was sent before the clear landed and the server took it. The second was not sent.
    expect(calls.sent('PATCH', '/api/auth/profile')).toHaveLength(1);
    expect(outcomes[0]).toBe('saved');
    expect(first.auth.getState().profile?.displayName).toBe('First');
  } else {
    expect(outcomes[0]).toEqual(expect.objectContaining({ name: 'ProfileSaveError', place: 'browser' }));
    // A save the clear made void changes nothing more, so nothing is put back. The tab holds no profile once it is told of the clear.
    tellOpenTabs(ACCOUNT_MARKER, marker);
    expect(first.auth.getState().profile).toBeNull();
  }
  expect(outcomes[1]).toEqual(expect.objectContaining({ name: 'ProfileSaveError', place: 'browser' }));
});

it('does not apply a profile change queued under one session to the session this tab holds when its turn comes', async () => {
  (await oldTab()).close();
  const patches = answers(2);
  const calls = server({ profile: patches.route, create: () => sessionAnswer('new-token', renewed) });
  const { auth } = await tab();
  await auth.getState().initialize();
  expect(auth.getState().sessionToken).toBe('saved-token');
  const first = outcomeOf(auth.getState().updateProfile({ displayName: 'First' }));
  const queued = outcomeOf(auth.getState().updateProfile({ displayName: 'Queued' }));
  await waitFor(() => expect(calls.sent('PATCH', '/api/auth/profile')).toHaveLength(1), { timeout: 5000 });
  // No sign-out and no clear: only the session changes.
  await auth.getState().createSession();
  expect(auth.getState().sessionToken).toBe('new-token');
  const held = auth.getState().profile;
  patches.settle[0].fail(new TypeError('Failed to fetch'));
  // Answers the queued change, should it be sent.
  patches.settle[1].answer(tookIt());
  expect(await first).toEqual(expect.objectContaining({ name: 'ProfileSaveError', place: 'server' }));
  const outcome = await queued;
  expect(calls.sent('PATCH', '/api/auth/profile').map((call) => call.token)).toEqual(['saved-token']);
  expect(outcome).toEqual(expect.objectContaining({ name: 'ProfileSaveError', place: 'browser' }));
  expect(auth.getState().profile).toBe(held);
  expect((await stored('profile_cache')).map((row) => [row.id, row.displayName])).toEqual([['renewed-person', 'Renewed person']]);
});

it('writes no browser copy of a profile change the server takes once this tab holds another session', async () => {
  (await oldTab()).close();
  const patches = answers(1);
  const calls = server({ profile: patches.route, create: () => sessionAnswer('new-token', renewed) });
  const { auth } = await tab();
  await auth.getState().initialize();
  expect(auth.getState().profile?.id).toBe('checked-person');
  const saving = outcomeOf(auth.getState().updateProfile({ displayName: 'Changed name' }));
  await waitFor(() => expect(calls.sent('PATCH', '/api/auth/profile')).toHaveLength(1), { timeout: 5000 });
  // No sign-out and no clear: only the session changes.
  await auth.getState().createSession();
  const held = auth.getState().profile;
  patches.settle[0].answer(tookIt());
  expect(await saving).toBe('saved');
  expect((await stored('profile_cache')).map((row) => row.id)).toEqual(['renewed-person']);
  expect(auth.getState().profile).toBe(held);
});

it('fails a profile save as a server failure once its request has gone 15 seconds without an answer, and settles the save made after it', async () => {
  (await oldTab()).close();
  let asked = 0;
  // The first request is accepted and never answered.
  const calls = server({ profile: () => (asked++ === 0 ? new Promise<never>(() => {}) : tookIt()) });
  const { auth } = await tab();
  await auth.getState().initialize();
  const before = auth.getState().profile;
  jest.useFakeTimers();
  const first = outcomeOf(auth.getState().updateProfile({ displayName: 'First' }));
  await pause(50);
  expect(calls.sent('PATCH', '/api/auth/profile')).toHaveLength(1);
  jest.advanceTimersByTime(14_999);
  expect(await within(first, 100)).toBe('pending');
  jest.advanceTimersByTime(1);
  expect(await within(first, 1000)).toEqual(expect.objectContaining({ name: 'ProfileSaveError', place: 'server' }));
  jest.useRealTimers();
  expect(auth.getState().profile).toBe(before);
  const second = outcomeOf(auth.getState().updateProfile({ displayName: 'Second' }));
  expect(await within(second, 5000)).toBe('saved');
  expect(auth.getState().profile?.displayName).toBe('Second');
  expect((await stored('profile_cache')).map((row) => row.displayName)).toEqual(['Second']);
});

it.each(['signs out and makes a new session', 'makes a new session without signing out'])('settles a profile save under the new session without waiting for the old session’s unanswered request when this tab %s', async (how) => {
  (await oldTab()).close();
  let asked = 0;
  const calls = server({
    profile: () => (asked++ === 0 ? new Promise<never>(() => {}) : tookIt()),
    create: () => sessionAnswer('new-token', renewed),
  });
  const { auth } = await tab();
  await auth.getState().initialize();
  expect(auth.getState().sessionToken).toBe('saved-token');
  // The old request's time limit is set on the faked clock, which is never advanced: it does not run out here.
  jest.useFakeTimers();
  const old = outcomeOf(auth.getState().updateProfile({ displayName: 'Old session' }));
  await pause(50);
  expect(calls.sent('PATCH', '/api/auth/profile')).toHaveLength(1);
  jest.useRealTimers();
  if (how.startsWith('signs out')) await auth.getState().logout();
  await auth.getState().createSession();
  expect(auth.getState().sessionToken).toBe('new-token');
  const saving = outcomeOf(auth.getState().updateProfile({ displayName: 'New session' }));
  expect(await within(saving, 5000)).toBe('saved');
  expect(calls.sent('PATCH', '/api/auth/profile').map((call) => call.token)).toEqual(['saved-token', 'new-token']);
  expect((await stored('profile_cache')).map((row) => [row.id, row.displayName])).toEqual([['renewed-person', 'New session']]);
  expect(await within(old, 50)).toBe('pending');
});

it.each(['answers OK', 'answers 401', 'answers 503'])('keeps the session made after a sign-out when the saved session check that set-up waited on %s', async (outcome) => {
  (await oldTab()).close();
  let answer!: (value: unknown) => void;
  const pending = new Promise((resolve) => { answer = resolve; });
  const calls = server({ check: () => pending as never, create: () => sessionAnswer('new-token', renewed) });
  const { auth } = await tab();
  const setUp = auth.getState().initialize();
  await waitFor(() => expect(calls.checks()).toHaveLength(1), { timeout: 5000 });
  await auth.getState().logout();
  await auth.getState().createSession();
  expect(auth.getState().sessionToken).toBe('new-token');
  answer(outcome === 'answers OK' ? sessionAnswer('saved-token') : outcome === 'answers 401' ? refused : { ok: false, status: 503 });
  await setUp;
  expect(auth.getState()).toMatchObject({
    sessionToken: 'new-token', sessionId: 'new-token-session', profile: renewed, isAuthenticated: true, isLoading: false, isInitialized: true,
  });
  expect(JSON.parse(localStorage.getItem('safeos-auth') || 'null')?.state).toMatchObject({ sessionToken: 'new-token', sessionId: 'new-token-session' });
  expect(calls.posts()).toHaveLength(1);
  expect((await stored('local_session')).map((row) => row.id)).toEqual(['new-token-session']);
});

it('saves the session made after a sign-out when set-up’s read of the session store fails only after that sign-out', async () => {
  let reached!: () => void;
  const reading = new Promise<void>((resolve) => { reached = resolve; });
  let fail!: () => void;
  const gate = new Promise<void>((resolve) => { fail = resolve; });
  jest.resetModules();
  // Set-up's read of the session store waits, then fails.
  jest.doMock('@/lib/client-db', () => {
    const actual = jest.requireActual<typeof import('@/lib/client-db')>('@/lib/client-db');
    return { ...actual, readLocalSession: async () => {
      reached();
      await gate;
      throw new DOMException('The session store cannot be read', 'UnknownError');
    } };
  });
  let auth!: (typeof import('@/stores/auth-store'))['useAuthStore'];
  try {
    auth = (await import('@/stores/auth-store')).useAuthStore;
  } finally {
    jest.dontMock('@/lib/client-db');
  }
  server({ create: () => sessionAnswer('new-token') });
  const setUp = auth.getState().initialize();
  await reading;
  await auth.getState().logout();
  fail();
  await setUp;
  expect(auth.getState().sessionToken).toBeNull();
  await auth.getState().createSession();
  expect(auth.getState().sessionToken).toBe('new-token');
  expect((await stored('local_session')).map((row) => row.id)).toEqual(['new-token-session']);
});

it.each(['another tab clears all local data', 'this tab makes a new session'])('drops the answer to a session refresh that arrives after %s', async (how) => {
  (await oldTab()).close();
  let answer!: (value: unknown) => void;
  const pending = new Promise((resolve) => { answer = resolve; });
  let asked = 0;
  // Set-up's check answers; the refresh's check waits.
  const calls = server({
    check: (token) => (asked++ === 0 ? sessionAnswer(token) : pending as never),
    create: () => sessionAnswer('new-token', renewed),
  });
  const { auth } = await tab();
  await auth.getState().initialize();
  expect(auth.getState().sessionToken).toBe('saved-token');
  const refreshing = auth.getState().refreshSession();
  await waitFor(() => expect(calls.checks()).toHaveLength(2), { timeout: 5000 });
  if (how.startsWith('another tab')) await (await tab()).clearLocalData();
  else await auth.getState().createSession();
  const held = auth.getState().profile;
  answer(sessionAnswer('saved-token', { id: 'late-person', displayName: 'Late person' }));
  await refreshing;
  expect(auth.getState().profile?.id).toBe(held?.id);
  expect(auth.getState().profile).toBe(held);
});

it.each(['answers OK', 'answers 401', 'answers 503'])('keeps the session this tab made with no clear when the saved session check that set-up waited on %s afterwards', async (outcome) => {
  (await oldTab()).close();
  let answer!: (value: unknown) => void;
  const pending = new Promise((resolve) => { answer = resolve; });
  let made = 0;
  // The first session request is the tab's own. A second one would be set-up's, after a refusal.
  const calls = server({
    check: () => pending as never,
    create: () => (made++ === 0 ? sessionAnswer('made-token', renewed) : sessionAnswer('second-token')),
  });
  const { auth } = await tab();
  const setUp = auth.getState().initialize();
  await waitFor(() => expect(calls.checks()).toHaveLength(1), { timeout: 5000 });
  // No sign-out and no clear: the tab makes a session while set-up waits.
  await auth.getState().createSession();
  expect(auth.getState().sessionToken).toBe('made-token');
  answer(outcome === 'answers OK' ? sessionAnswer('saved-token') : outcome === 'answers 401' ? refused : { ok: false, status: 503 });
  await setUp;
  expect(auth.getState()).toMatchObject({
    sessionToken: 'made-token', sessionId: 'made-token-session', profile: renewed, isAuthenticated: true, isLoading: false, isInitialized: true,
  });
  expect(JSON.parse(localStorage.getItem('safeos-auth') || 'null')?.state).toMatchObject({ sessionToken: 'made-token', sessionId: 'made-token-session' });
  expect(calls.posts()).toHaveLength(1);
});

it('keeps the later session when two session requests are in flight and the earlier one is answered last', async () => {
  const requests = answers(2);
  const calls = server({ create: requests.route });
  const { auth } = await tab();
  const earlier = auth.getState().createSession();
  await waitFor(() => expect(calls.posts()).toHaveLength(1), { timeout: 5000 });
  const later = auth.getState().createSession();
  await waitFor(() => expect(calls.posts()).toHaveLength(2), { timeout: 5000 });
  requests.settle[1].answer(sessionAnswer('later-token', renewed));
  await later;
  expect(auth.getState().sessionToken).toBe('later-token');
  requests.settle[0].answer(sessionAnswer('earlier-token'));
  await earlier;
  expect(auth.getState()).toMatchObject({
    sessionToken: 'later-token', sessionId: 'later-token-session', profile: renewed, isAuthenticated: true, isLoading: false, isInitialized: true,
  });
  expect(JSON.parse(localStorage.getItem('safeos-auth') || 'null')?.state).toMatchObject({ sessionToken: 'later-token', sessionId: 'later-token-session' });
  expect((await stored('local_session')).map((row) => row.id)).toEqual(['later-token-session']);
  expect((await stored('profile_cache')).map((row) => row.id)).toEqual(['renewed-person']);
});

it('writes no session token back to local storage when a browser-only profile save resumes after another tab cleared all local data', async () => {
  let reached!: () => void;
  const writing = new Promise<void>((resolve) => { reached = resolve; });
  let resume!: () => void;
  const gate = new Promise<void>((resolve) => { resume = resolve; });
  let hold = false;
  jest.resetModules();
  // Once `hold` is set, this tab's profile cache write waits until the other tab's clear has finished.
  jest.doMock('@/lib/client-db', () => {
    const actual = jest.requireActual<typeof import('@/lib/client-db')>('@/lib/client-db');
    return { ...actual, cacheProfile: async (...args: Parameters<typeof actual.cacheProfile>) => {
      if (hold) {
        reached();
        await gate;
      }
      return actual.cacheProfile(...args);
    } };
  });
  let first!: (typeof import('@/stores/auth-store'))['useAuthStore'];
  try {
    first = (await import('@/stores/auth-store')).useAuthStore;
  } finally {
    jest.dontMock('@/lib/client-db');
  }
  await first.getState().initialize();
  expect(first.getState().sessionToken).toMatch(/^local-/);
  expect(heldToken()).toMatch(/^local-/);
  hold = true;
  const saving = outcomeOf(first.getState().updateProfile({ displayName: 'Changed name' }));
  await writing;
  const other = await tab();
  await other.clearLocalData();
  // The clear has finished: the saved auth state is gone from local storage.
  expect(localStorage.getItem('safeos-auth')).toBeNull();
  resume();
  expect(await saving).toEqual(expect.objectContaining({ name: 'ProfileSaveError', place: 'browser' }));
  expect(heldToken()).toBeNull();
  expect(await stored('profile_cache')).toEqual([]);
  expect(await stored('local_session')).toEqual([]);
});

/**
 * Keeps a request's 15 second limit from running out until `runOut` is called; every other timer
 * runs on the real clock, which a clear of local data needs. `waitFor` is not used while this holds.
 */
function holdTimeLimit() {
  let limit: (() => void) | null = null;
  const held = (handler: () => void, ms?: number) => {
    if (ms !== 15_000) return realSetTimeout(handler, ms);
    limit = handler;
    return 0;
  };
  jest.spyOn(global, 'setTimeout').mockImplementation(held as never);
  return { runOut: () => {
    if (!limit) throw new Error('No 15 second limit was set');
    limit();
  } };
}

it('writes no session token back to local storage when a profile request runs out of time after another tab cleared all local data', async () => {
  (await oldTab()).close();
  // The request is accepted and never answered.
  const calls = server({ profile: () => new Promise<never>(() => {}) });
  const first = await tab();
  await first.auth.getState().initialize();
  expect(first.auth.getState().sessionToken).toBe('saved-token');
  expect(heldToken()).toBe('saved-token');
  const other = await tab();
  const limit = holdTimeLimit();
  const saving = outcomeOf(first.auth.getState().updateProfile({ displayName: 'Changed name' }));
  await pause(50);
  expect(calls.sent('PATCH', '/api/auth/profile')).toHaveLength(1);
  await other.clearLocalData();
  // The clear has finished: the saved auth state is gone from local storage.
  expect(localStorage.getItem('safeos-auth')).toBeNull();
  limit.runOut();
  expect(await within(saving, 5000)).toEqual(expect.objectContaining({ name: 'ProfileSaveError' }));
  expect(heldToken()).toBeNull();
  expect(await stored('profile_cache')).toEqual([]);
});

const ACCOUNT_MARKER = 'safeos_account_data_cleared';
const ALERT_MARKER = 'safeos_local_data_cleared';
/** Delivers the storage event a browser sends an open tab when another tab has changed `key`. */
function tellOpenTabs(key: string, oldValue: string | null) {
  window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue: localStorage.getItem(key) }));
}

it.each([
  ['Clear All Local Data in another tab', 'a browser-only session'],
  ['a sign-out in another tab', 'a session on a server'],
])('signs an open tab out after %s, so a profile save made there under %s writes nothing', async (how, kind) => {
  const onServer = kind.endsWith('server');
  if (onServer) (await oldTab()).close();
  const calls = onServer ? server({ profile: tookIt }) : null;
  const first = await tab();
  await first.auth.getState().initialize();
  expect(String(first.auth.getState().sessionToken).startsWith('local-')).toBe(!onServer);
  expect(first.auth.getState().profile).not.toBeNull();
  const open = first.auth.getState();
  const before = { account: localStorage.getItem(ACCOUNT_MARKER), alerts: localStorage.getItem(ALERT_MARKER), auth: localStorage.getItem('safeos-auth') };
  const other = await tab();
  if (how.startsWith('a sign-out')) await other.auth.getState().logout();
  else await other.clearLocalData();
  expect(localStorage.getItem(ACCOUNT_MARKER)).not.toBe(before.account);
  // The open tab is told of the other keys the clear changed: none of them signs it out.
  tellOpenTabs(ALERT_MARKER, before.alerts);
  tellOpenTabs('safeos-auth', before.auth);
  expect(first.auth.getState()).toBe(open);
  tellOpenTabs(ACCOUNT_MARKER, before.account);
  expect(first.auth.getState()).toMatchObject({ isAuthenticated: false, sessionToken: null, sessionId: null, profile: null });
  const saving = outcomeOf(first.auth.getState().updateProfile({ displayName: 'Changed name' }));
  expect(await within(saving, 5000)).not.toBe('pending');
  expect(await stored('profile_cache')).toEqual([]);
  expect(await stored('local_session')).toEqual([]);
  expect(heldToken()).toBeNull();
  if (calls) expect(calls.sent('PATCH', '/api/auth/profile')).toHaveLength(0);
});

it('drops a session request in flight when the open tab is told that another tab cleared all local data', async () => {
  let answer!: (value: unknown) => void;
  const pending = new Promise((resolve) => { answer = resolve; });
  const calls = server({ create: () => pending as never });
  const other = await tab();
  const first = await tab();
  const before = localStorage.getItem(ACCOUNT_MARKER);
  await other.clearLocalData({ preserveBackendConfig: true });
  // The request is made before this tab is told of the clear.
  const making = first.auth.getState().createSession();
  await waitFor(() => expect(calls.posts()).toHaveLength(1), { timeout: 5000 });
  tellOpenTabs(ACCOUNT_MARKER, before);
  answer(sessionAnswer('late-token'));
  await making;
  expect(first.auth.getState()).toMatchObject({
    isAuthenticated: false, sessionToken: null, sessionId: null, profile: null, isLoading: false, isInitialized: true,
  });
  expect(heldToken()).toBeNull();
  expect(await stored('local_session')).toEqual([]);
  expect(await stored('profile_cache')).toEqual([]);
});

it('settles a profile save made after the open tab was told of another tab’s clear without waiting for a request made before it', async () => {
  (await oldTab()).close();
  let asked = 0;
  // The first profile request is accepted and never answered. The server gives this device the same token again.
  const calls = server({
    profile: () => (asked++ === 0 ? new Promise<never>(() => {}) : tookIt()),
    create: () => sessionAnswer('saved-token', renewed),
  });
  const first = await tab();
  await first.auth.getState().initialize();
  expect(first.auth.getState().sessionToken).toBe('saved-token');
  // The old request's time limit is set on the faked clock, which is never advanced: it does not run out here.
  jest.useFakeTimers();
  const old = outcomeOf(first.auth.getState().updateProfile({ displayName: 'Before the clear' }));
  await pause(50);
  expect(calls.sent('PATCH', '/api/auth/profile')).toHaveLength(1);
  jest.useRealTimers();
  const before = localStorage.getItem(ACCOUNT_MARKER);
  const other = await tab();
  await other.clearLocalData({ preserveBackendConfig: true });
  tellOpenTabs(ACCOUNT_MARKER, before);
  await first.auth.getState().createSession();
  expect(first.auth.getState().sessionToken).toBe('saved-token');
  const saving = outcomeOf(first.auth.getState().updateProfile({ displayName: 'After the clear' }));
  expect(await within(saving, 5000)).toBe('saved');
  expect(calls.sent('PATCH', '/api/auth/profile')).toHaveLength(2);
  expect((await stored('profile_cache')).map((row) => [row.id, row.displayName])).toEqual([['renewed-person', 'After the clear']]);
  expect(await within(old, 50)).toBe('pending');
});

it('clears the browser and signs out once the server has left the sign-out request 15 seconds without an answer', async () => {
  (await oldTab()).close();
  // The request that ends the session is accepted and never answered.
  const calls = server({ end: () => new Promise<never>(() => {}) });
  const { auth } = await tab();
  await auth.getState().initialize();
  expect(auth.getState().sessionToken).toBe('saved-token');
  jest.useFakeTimers();
  const leaving = outcomeOf(auth.getState().logout());
  await pause(50);
  expect(calls.sent('DELETE')).toHaveLength(1);
  jest.advanceTimersByTime(14_999);
  expect(await within(leaving, 100)).toBe('pending');
  jest.advanceTimersByTime(1);
  // The clear that follows runs on the real clock.
  jest.useRealTimers();
  expect(await within(leaving, 5000)).toBe('saved');
  expect(auth.getState()).toMatchObject({ isAuthenticated: false, sessionToken: null, sessionId: null, profile: null });
  expect(heldToken()).toBeNull();
  expect(await stored('local_session')).toEqual([]);
  expect(await stored('profile_cache')).toEqual([]);
});
