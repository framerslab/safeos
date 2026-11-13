/** @jest-environment jsdom */
import { waitFor } from '@testing-library/react';
import { openDB } from 'idb';
import { IDBFactory } from 'fake-indexeddb';
import { clearGeneration, ids, oldTab, session, stored } from './helpers/saved-history';
require('fake-indexeddb/auto');
jest.setTimeout(60000);
Object.defineProperty(global, 'structuredClone', { configurable: true, value: (value: unknown) =>
  require('v8').deserialize(require('v8').serialize(value)),
});
const MARKER = 'safeos_local_data_cleared';
const live = (id: string) => ({ id, streamId: 'camera', severity: 'low' as const, message: id, acknowledged: false });
const storedAlerts = async () => (await stored('alert_cache')).map((alert) => alert.id).sort();

/**
 * One tab: a fresh set of modules over the shared database and local storage. A tab made with
 * `held` saves through a `cacheAlert` that waits for `hold.gate` and then saves for real.
 */
async function tab(options: { held?: boolean } = {}) {
  jest.resetModules();
  const hold = { calls: [] as any[][], gate: Promise.resolve() };
  if (options.held) jest.doMock('@/lib/client-db', () => {
    const real = jest.requireActual('@/lib/client-db');
    return { ...real, cacheAlert: async (...args: any[]) => {
      hold.calls.push(args);
      await hold.gate;
      return real.cacheAlert(...args);
    } };
  });
  const { useAuthStore: auth } = await import('@/stores/auth-store');
  const { useMonitoringStore: monitoring } = await import('@/stores/monitoring-store');
  const { clearLocalData } = await import('@/lib/local-data');
  jest.dontMock('@/lib/client-db');
  const listed = () => monitoring.getState().alerts.map((alert) => alert.id).sort();
  return { auth, monitoring, clearLocalData, hold, listed, read: () => monitoring.getState().hydrateAlerts() };
}
/** Every alert write fails once it has read the database. */
function failSaves() {
  return jest.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
    throw new DOMException('Storage full', 'QuotaExceededError');
  });
}
beforeEach(() => {
  jest.resetModules();
  global.indexedDB = new IDBFactory();
  localStorage.clear();
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  global.fetch = jest.fn().mockRejectedValue(new TypeError('Offline'));
});
afterEach(() => jest.restoreAllMocks());

it('shares one history between two tabs across a session renewal', async () => {
  (await oldTab()).close();
  const first = await tab();
  await first.auth.getState().initialize();
  await first.read();
  const db = await openDB('safeos-guardian');
  await db.put('local_session', { ...session, expiresAt: '2026-10-02T00:00:00Z' });
  db.close();
  const renewed = await tab();
  await renewed.auth.getState().initialize();
  expect(renewed.auth.getState().profile?.id).toBeTruthy();
  expect(renewed.auth.getState().profile?.id).not.toBe(first.auth.getState().profile?.id);
  await renewed.read();
  first.monitoring.getState().addAlert(live('raised-under-the-old-session'));
  first.monitoring.getState().acknowledgeAlert('saved-one');
  await first.read();
  await renewed.read();
  const four = ['raised-under-the-old-session', ...ids].sort();
  expect(renewed.listed()).toEqual(four);
  expect(renewed.monitoring.getState().alerts.find((alert) => alert.id === 'saved-one')?.acknowledged).toBe(true);
  const reloaded = await tab();
  await reloaded.read();
  expect(reloaded.listed()).toEqual(four);
});

it.each(['plain', 'held', 'marker refused'])('clears the browser for every tab at a sign-out, and clears nothing when the marker cannot be written: %s', async (mode) => {
  (await oldTab()).close();
  const a = await tab();
  const b = await tab({ held: mode === 'held' });
  await a.read();
  await b.read();
  const failing = failSaves();
  b.monitoring.getState().addAlert(live('before'));
  await b.read();
  failing.mockRestore();
  const four = ['before', ...ids].sort();
  expect(await storedAlerts()).not.toContain('before');
  expect(b.listed()).toEqual(four);

  if (mode === 'marker refused') {
    const generation = await clearGeneration();
    const marker = localStorage.getItem(MARKER);
    const setItem = localStorage.setItem.bind(localStorage);
    const refusing = jest.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === MARKER) throw new DOMException('full', 'QuotaExceededError');
      setItem(key, value);
    });
    await expect(a.auth.getState().logout()).rejects.toMatchObject({ name: 'QuotaExceededError' });
    await a.read();
    refusing.mockRestore();
    expect(await storedAlerts()).toEqual(['engine-old', ...ids].sort());
    expect((await stored('local_session')).map((row) => row.id)).toEqual(['saved-session']);
    expect(await clearGeneration()).toBe(generation);
    expect(localStorage.getItem(MARKER)).toBe(marker);
    await b.read();
    expect(await storedAlerts()).toEqual(['engine-old', ...four].sort());
    expect(b.listed()).toEqual(four);
  } else {
    let release = () => {};
    let overtaken: Promise<void> | undefined;
    if (mode === 'held') {
      const earlier = b.hold.calls.length;
      b.hold.gate = new Promise<void>((resolve) => { release = resolve; });
      overtaken = b.read();
      await waitFor(() => expect(b.hold.calls.slice(earlier).some(([record]) => record.id === 'before')).toBe(true), { timeout: 5000 });
    }
    await a.auth.getState().logout();
    expect(await stored('alert_cache')).toEqual([]);
    expect(await stored('local_session')).toEqual([]);
    expect(b.listed()).toEqual(four);
    release();
    await (overtaken ?? b.read());
    expect(await stored('alert_cache')).toEqual([]);
    expect(b.listed()).toEqual([]);
    b.monitoring.getState().addAlert(live('after'));
    await b.read();
    // Nothing was left waiting in the other tab: only the alert raised after the sign-out is saved.
    expect(await storedAlerts()).toEqual(['after']);
    expect(b.listed()).toEqual(['after']);
    const reloaded = await tab();
    await reloaded.read();
    expect(reloaded.listed()).toEqual(['after']);
    await b.auth.getState().logout();
    expect(await stored('alert_cache')).toEqual([]);
    await b.read();
  }
  expect(await stored('clear_generation')).toEqual([expect.stringMatching(/.+/)]);
  expect(await clearGeneration()).toEqual(expect.stringMatching(/.+/));
});

it('does not put a cleared alert back when another tab acknowledges it', async () => {
  (await oldTab()).close();
  const a = await tab();
  const b = await tab();
  await a.read();
  await b.read();
  await a.auth.getState().logout();
  b.monitoring.getState().acknowledgeAlert('saved-one');
  await waitFor(() => expect(b.listed()).not.toContain('saved-one'), { timeout: 5000 });
  // No history read emptied the list: the other two are still there.
  expect(b.listed()).toEqual(['saved-three', 'saved-two']);
  expect(await stored('alert_cache')).toEqual([]);
  await b.read();
  expect(await stored('alert_cache')).toEqual([]);
});

it('does not write a failed save of another tab after Clear all', async () => {
  (await oldTab()).close();
  const a = await tab();
  const b = await tab();
  await a.read();
  await b.read();
  const generation = await clearGeneration();
  const failing = failSaves();
  b.monitoring.getState().addAlert(live('x'));
  await b.read();
  failing.mockRestore();
  a.monitoring.getState().clearAlerts();
  await a.read();
  await b.read();
  expect(await storedAlerts()).toEqual(['engine-old']);
  expect(b.listed()).toEqual([]);
  // A later read finds nothing left waiting either.
  await b.read();
  expect(await storedAlerts()).toEqual(['engine-old']);
  expect((await stored('local_session')).map((row) => row.id)).toEqual(['saved-session']);
  expect(await clearGeneration()).not.toBe(generation);
});
