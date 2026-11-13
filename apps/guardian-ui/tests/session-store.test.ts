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
afterEach(() => jest.restoreAllMocks());

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
