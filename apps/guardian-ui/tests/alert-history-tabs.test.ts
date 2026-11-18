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

// A repeat of a continuing event updates the event's card. Another tab may have acknowledged,
// removed or cleared that card since: the repeat checks the stored card in the same transaction as
// its write, leaves what the other tab did, and goes on a fresh card.
const FIRST = { ...live('event-card'), createdAt: '2026-11-01T10:00:00.000Z', timestamp: '2026-11-01T10:00:00.000Z' };
const REPEAT = { ...FIRST, severity: 'high' as const, message: 'the repeat', timestamp: '2026-11-01T10:01:00.000Z', repeats: 1 };
const FRESH = { id: 'fresh-card', createdAt: '2026-11-01T10:01:00.000Z' };

it.each(['acknowledges', 'removes', 'clears all'])('keeps what another tab did when it %s a card whose event repeats: the repeat goes on a fresh card', async (action) => {
  (await oldTab()).close();
  const watching = await tab();
  const other = await tab();
  await watching.read();
  await other.read();
  watching.monitoring.getState().addAlert(FIRST);
  await watching.read();
  await other.read();
  if (action === 'acknowledges') other.monitoring.getState().acknowledgeAlert('event-card');
  else if (action === 'removes') other.monitoring.getState().removeAlert('event-card');
  else other.monitoring.getState().clearAlerts();
  await other.read();

  const fresh = jest.fn(() => FRESH);
  watching.monitoring.getState().addAlert(REPEAT, { fresh });
  await watching.read();

  const rows = await stored('alert_cache');
  const card = rows.find((row) => row.id === 'event-card');
  if (action === 'acknowledges') {
    expect(card).toMatchObject({ acknowledged: true, severity: 'low', message: 'event-card', createdAt: FIRST.createdAt });
    expect(card.repeats).toBeUndefined();
    expect(watching.monitoring.getState().alerts.find((alert) => alert.id === 'event-card')?.acknowledged).toBe(true);
  } else {
    expect(card).toBeUndefined();
    expect(watching.listed()).not.toContain('event-card');
  }
  expect(fresh).toHaveBeenCalledTimes(1);
  const shown = rows.find((row) => row.id === 'fresh-card');
  expect(shown).toMatchObject({ acknowledged: false, severity: 'high', message: 'the repeat', createdAt: FRESH.createdAt });
  expect(shown.repeats).toBeUndefined();
  expect(watching.listed()).toContain('fresh-card');
});

it('puts repeats queued behind a card another tab acknowledged on one fresh card', async () => {
  (await oldTab()).close();
  const watching = await tab();
  const other = await tab();
  await watching.read();
  await other.read();
  watching.monitoring.getState().addAlert(FIRST);
  await watching.read();
  await other.read();
  other.monitoring.getState().acknowledgeAlert('event-card');
  await other.read();

  // The monitor's detector event, on the card; two of its repeats are queued
  // before the first finds the card acknowledged. Each gets the monitor's
  // fresh-card callback.
  const { newDetectorEvent, freshCardFor } = await import('@/lib/alert-event');
  const detector = newDetectorEvent();
  detector.alertId = 'event-card';
  detector.startedAt = FIRST.createdAt;
  let made = 0;
  const fresh = jest.fn(freshCardFor(detector, () => `fresh-${++made}`, Date.parse(FRESH.createdAt)));
  watching.monitoring.getState().addAlert(REPEAT, { fresh });
  watching.monitoring.getState().addAlert({ ...REPEAT, message: 'the next repeat', timestamp: '2026-11-01T10:02:00.000Z', repeats: 2 }, { fresh });
  await watching.read();
  expect(detector.alertId).toBe('fresh-1');

  const rows = await stored('alert_cache');
  expect(fresh).toHaveBeenCalledTimes(1);
  expect(rows.find((row) => row.id === 'fresh-2')).toBeUndefined();
  expect(rows.find((row) => row.id === 'fresh-1')).toMatchObject({
    acknowledged: false, message: 'the next repeat', createdAt: FRESH.createdAt, repeats: 1,
  });
  expect(rows.find((row) => row.id === 'event-card')).toMatchObject({ acknowledged: true, message: 'event-card' });
  expect(watching.monitoring.getState().alerts.find((alert) => alert.id === 'fresh-1')?.repeats).toBe(1);

  // The detector's next repeat, made as the monitor makes it, updates that card.
  const shown = watching.monitoring.getState().alerts.find((alert) => alert.id === detector.alertId);
  watching.monitoring.getState().addAlert({
    ...REPEAT, id: detector.alertId!, createdAt: detector.startedAt!, message: 'a later repeat',
    timestamp: '2026-11-01T10:03:00.000Z', repeats: (shown?.repeats ?? 0) + 1,
  }, { fresh });
  await watching.read();
  const later = (await stored('alert_cache')).filter((row) => row.id.startsWith('fresh-'));
  expect(later.map((row) => row.id)).toEqual(['fresh-1']);
  expect(later[0]).toMatchObject({ message: 'a later repeat', repeats: 2, acknowledged: false });
  expect(detector.alertId).toBe('fresh-1');
});

it("does not save a repeat's fresh card when another tab clears all between the repeat's check and the fresh card", async () => {
  (await oldTab()).close();
  const watching = await tab({ held: true });
  const other = await tab();
  await watching.read();
  await other.read();
  watching.monitoring.getState().addAlert(FIRST);
  await watching.read();
  await other.read();
  other.monitoring.getState().acknowledgeAlert('event-card');
  await other.read();

  // The repeat finds the card acknowledged; its fresh card's save waits while the other tab clears all.
  let open = () => {};
  watching.hold.gate = new Promise<void>((resolve) => { open = resolve; });
  const calls = watching.hold.calls.length;
  watching.monitoring.getState().addAlert(REPEAT, { fresh: () => FRESH });
  await waitFor(() => expect(watching.hold.calls.length).toBe(calls + 1), { timeout: 5000 });
  other.monitoring.getState().clearAlerts();
  await other.read();
  open();
  await watching.read();

  expect((await stored('alert_cache')).filter((row) => row.monitoring)).toEqual([]);
  expect(watching.listed()).not.toContain('fresh-card');
});

/** Two tabs, an event card saved, and the other tab's acknowledgement of it. */
async function acknowledgedElsewhere(options: { held?: boolean } = {}) {
  (await oldTab()).close();
  const watching = await tab(options);
  const other = await tab();
  await watching.read();
  await other.read();
  watching.monitoring.getState().addAlert(FIRST);
  await watching.read();
  await other.read();
  other.monitoring.getState().acknowledgeAlert('event-card');
  await other.read();
  return { watching, other };
}
const monitoringRows = async () => (await stored('alert_cache')).filter((row) => row.monitoring);

it("does not save repeats queued behind a stale card when another tab clears all before the fresh card's save", async () => {
  const { watching, other } = await acknowledgedElsewhere({ held: true });
  let open = () => {};
  watching.hold.gate = new Promise<void>((resolve) => { open = resolve; });
  const calls = watching.hold.calls.length;
  let made = 0;
  const fresh = jest.fn(() => ({ id: `fresh-${++made}`, createdAt: FRESH.createdAt }));
  watching.monitoring.getState().addAlert(REPEAT, { fresh });
  watching.monitoring.getState().addAlert({ ...REPEAT, message: 'the next repeat', timestamp: '2026-11-01T10:02:00.000Z', repeats: 2 }, { fresh });
  // The first repeat found the card acknowledged; its fresh card's save waits while the other tab clears all.
  await waitFor(() => expect(watching.hold.calls.length).toBe(calls + 1), { timeout: 5000 });
  other.monitoring.getState().clearAlerts();
  await other.read();
  open();
  await watching.read();

  expect(await monitoringRows()).toEqual([]);
  expect(watching.listed().filter((id) => id.startsWith('fresh-'))).toEqual([]);
});

it('does not put back on screen a repeat queued before this tab cleared all', async () => {
  const { watching } = await acknowledgedElsewhere();
  watching.monitoring.getState().addAlert(REPEAT, { fresh: () => FRESH });
  watching.monitoring.getState().clearAlerts();
  // No history read: the list is what the queue leaves on screen.
  await waitFor(async () => expect(await monitoringRows()).toEqual([]), { timeout: 5000 });
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(watching.listed()).toEqual([]);
});

it('acknowledges the fresh card a repeat went on, not the card another tab acknowledged', async () => {
  const { watching } = await acknowledgedElsewhere();
  watching.monitoring.getState().addAlert(REPEAT, { fresh: () => FRESH });
  // The person acknowledges the repeat as it shows, before its save finds the card acknowledged.
  watching.monitoring.getState().acknowledgeAlert('event-card');
  await watching.read();

  const rows = await stored('alert_cache');
  expect(rows.find((row) => row.id === 'event-card')).toMatchObject({ acknowledged: true, message: 'event-card', severity: 'low' });
  expect(rows.find((row) => row.id === 'fresh-card')).toMatchObject({ acknowledged: true, message: 'the repeat' });
});

it('counts repeats in the order they are saved, and keeps the newest reading on screen', async () => {
  const { watching } = await acknowledgedElsewhere({ held: true });
  let open = () => {};
  watching.hold.gate = new Promise<void>((resolve) => { open = resolve; });
  const calls = watching.hold.calls.length;
  const fresh = jest.fn(() => FRESH);
  watching.monitoring.getState().addAlert(REPEAT, { fresh });
  watching.monitoring.getState().addAlert({ ...REPEAT, message: 'the second', timestamp: '2026-11-01T10:02:00.000Z', repeats: 2 }, { fresh });
  // The fresh card's first save waits; the event, on the fresh card now, alerts a third time.
  await waitFor(() => expect(watching.hold.calls.length).toBe(calls + 1), { timeout: 5000 });
  watching.monitoring.getState().addAlert(
    { ...REPEAT, id: FRESH.id, createdAt: FRESH.createdAt, message: 'the third', timestamp: '2026-11-01T10:03:00.000Z', repeats: 1 },
    { fresh },
  );
  open();
  await waitFor(async () => expect((await stored('alert_cache')).find((row) => row.id === FRESH.id)?.message).toBe('the third'), { timeout: 5000 });
  await new Promise((resolve) => setTimeout(resolve, 50));

  const saved = (await stored('alert_cache')).find((row) => row.id === FRESH.id);
  const shown = watching.monitoring.getState().alerts.find((alert) => alert.id === FRESH.id);
  expect(saved).toMatchObject({ message: 'the third', repeats: 2 });
  expect(shown).toMatchObject({ message: 'the third', repeats: 2 });
});

it('keeps the saved repeat count when a repeat is acknowledged as it shows', async () => {
  (await oldTab()).close();
  const watching = await tab();
  const other = await tab();
  await watching.read();
  await other.read();
  watching.monitoring.getState().addAlert(FIRST);
  await watching.read();
  await other.read();
  // The other tab saves the event's first repeat; this tab's list does not show it yet.
  other.monitoring.getState().addAlert(REPEAT, { fresh: () => FRESH });
  await other.read();

  // This tab's own repeat counts from what it shows; the person acknowledges it as it shows.
  watching.monitoring.getState().addAlert({ ...REPEAT, message: 'from this tab', timestamp: '2026-11-01T10:02:00.000Z', repeats: 1 }, { fresh: () => FRESH });
  watching.monitoring.getState().acknowledgeAlert('event-card');
  await watching.read();

  expect((await stored('alert_cache')).find((row) => row.id === 'event-card')).toMatchObject({
    acknowledged: true, message: 'from this tab', repeats: 2,
  });
});

it("puts a repeat queued behind a stale card on the fresh card whose own save failed, and saves one card", async () => {
  const { watching } = await acknowledgedElsewhere();
  const failing = failSaves();
  let made = 0;
  const fresh = jest.fn(() => ({ id: `fresh-${++made}`, createdAt: FRESH.createdAt }));
  watching.monitoring.getState().addAlert(REPEAT, { fresh });
  watching.monitoring.getState().addAlert({ ...REPEAT, message: 'the next repeat', timestamp: '2026-11-01T10:02:00.000Z', repeats: 2 }, { fresh });
  // Both saves fail; the next history read retries them.
  await watching.read();
  failing.mockRestore();
  await watching.read();

  const rows = await monitoringRows();
  expect(fresh).toHaveBeenCalledTimes(1);
  expect(rows.map((row) => row.id).filter((id) => id.startsWith('fresh-'))).toEqual(['fresh-1']);
  expect(rows.find((row) => row.id === 'fresh-1')).toMatchObject({ message: 'the next repeat', acknowledged: false });
  expect(watching.listed().filter((id) => id.startsWith('fresh-'))).toEqual(['fresh-1']);
});

it('shows a card whose acknowledgement waits to be saved with its saved reading and count', async () => {
  (await oldTab()).close();
  const watching = await tab();
  await watching.read();
  watching.monitoring.getState().addAlert(FIRST);
  watching.monitoring.getState().addAlert(REPEAT, { fresh: () => FRESH });
  await watching.read();
  // The acknowledgement's save fails, and so does its retry at the next history read.
  const failing = failSaves();
  watching.monitoring.getState().acknowledgeAlert('event-card');
  await watching.read();
  const shown = watching.monitoring.getState().alerts.find((alert) => alert.id === 'event-card');
  failing.mockRestore();

  expect(shown).toMatchObject({ acknowledged: true, message: 'the repeat', severity: 'high', repeats: 1 });
});

it('updates the card in place when no other tab changed it', async () => {
  (await oldTab()).close();
  const watching = await tab();
  await watching.read();
  watching.monitoring.getState().addAlert(FIRST);
  await watching.read();
  const fresh = jest.fn(() => FRESH);
  watching.monitoring.getState().addAlert(REPEAT, { fresh });
  await watching.read();

  expect(fresh).not.toHaveBeenCalled();
  const rows = await stored('alert_cache');
  expect(rows.find((row) => row.id === 'fresh-card')).toBeUndefined();
  expect(rows.find((row) => row.id === 'event-card')).toMatchObject({
    acknowledged: false, severity: 'high', message: 'the repeat', createdAt: FIRST.createdAt, repeats: 1,
  });
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

it('does not write a queued alert after Clear All Local Data, and the clear names itself in the database and in local storage', async () => {
  const one = await tab();
  await one.read();
  const generation = await clearGeneration();
  const marker = localStorage.getItem(MARKER);
  one.monitoring.getState().addAlert(live('x'));
  await one.clearLocalData();
  await one.read();
  expect(await storedAlerts()).not.toContain('x');
  expect(one.listed()).toEqual([]);
  expect(await stored('clear_generation')).toEqual([expect.stringMatching(/.+/)]);
  expect(await clearGeneration()).not.toBe(generation);
  expect(localStorage.getItem(MARKER)).toEqual(expect.stringMatching(/.+/));
  expect(localStorage.getItem(MARKER)).not.toBe(marker);
});

/** Every alert write and history read fails before it reads the database. */
function failBeforeRead() {
  return jest.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(() => {
    throw new DOMException('The connection is unavailable', 'InvalidStateError');
  });
}

it.each(['before it reads the database', 'after it reads the database'])(
  'saves with its retry an alert raised after another tab cleared, whose first save failed %s', async (when) => {
    (await oldTab()).close();
    const a = await tab();
    const b = await tab();
    await a.read();
    await b.read();
    await a.clearLocalData();
    await a.read();
    const failing = when.startsWith('before') ? failBeforeRead() : failSaves();
    b.monitoring.getState().addAlert(live('after'));
    await b.read();
    failing.mockRestore();
    await b.read();
    expect(await storedAlerts()).toEqual(['after']);
    expect(b.listed()).toEqual(['after']);
  });

it('does not write an alert queued before its tab read the database after another tab clears', async () => {
  (await oldTab()).close();
  const a = await tab();
  await a.read();
  const b = await tab();
  const failing = failBeforeRead();
  b.monitoring.getState().addAlert(live('early'));
  await b.read();
  failing.mockRestore();
  await a.clearLocalData();
  await b.read();
  expect(await stored('alert_cache')).toEqual([]);
  expect(b.listed()).toEqual([]);
  await b.read();
  expect(await stored('alert_cache')).toEqual([]);
});

it('keeps an alert raised while a history read waits for a held save', async () => {
  const one = await tab({ held: true });
  await one.read();
  let release = () => {};
  one.hold.gate = new Promise<void>((resolve) => { release = resolve; });
  one.monitoring.getState().addAlert(live('first'));
  const reading = one.read();
  await waitFor(() => expect(one.hold.calls.some(([record]) => record.id === 'first')).toBe(true), { timeout: 5000 });
  one.monitoring.getState().addAlert(live('second'));
  release();
  await reading;
  expect(one.listed()).toEqual(['first', 'second']);
  expect(await storedAlerts()).toEqual(['first', 'second']);
});
