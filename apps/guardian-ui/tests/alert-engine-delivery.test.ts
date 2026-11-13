/** @jest-environment jsdom */
import { waitFor } from '@testing-library/react';
import { openDB } from 'idb';
import { IDBFactory } from 'fake-indexeddb';
require('fake-indexeddb/auto');
jest.setTimeout(60000);
Object.defineProperty(global, 'structuredClone', { configurable: true, value: (value: unknown) =>
  require('v8').deserialize(require('v8').serialize(value)),
});
type Save = (...args: any[]) => Promise<boolean>;
type Update = (...args: any[]) => Promise<'updated' | 'gone' | 'failed'>;

/**
 * One tab's alert engine: a fresh set of modules over the shared database and local storage.
 * `save` replaces only `cacheAlert`, and is given the real one to save with; `update` does the
 * same for `updateCachedAlert`.
 */
async function engineTab(save?: (real: Save) => Save, update?: (real: Update) => Update) {
  jest.resetModules();
  if (save || update) jest.doMock('@/lib/client-db', () => {
    const real = jest.requireActual('@/lib/client-db');
    return {
      ...real,
      ...(save ? { cacheAlert: save(real.cacheAlert) } : {}),
      ...(update ? { updateCachedAlert: update(real.updateCachedAlert) } : {}),
    };
  });
  const { localAlertEngine: engine } = await import('@/lib/local-alert-engine');
  const { getNotificationManager } = await import('@/lib/notification-manager');
  const { clearLocalData } = await import('@/lib/local-data');
  jest.dontMock('@/lib/client-db');
  const sound = jest.spyOn(engine, 'playAlertSound').mockResolvedValue(undefined);
  const notification = jest.spyOn(getNotificationManager(), 'show').mockResolvedValue(null as never);
  const listener = jest.fn();
  engine.onAlert(listener);
  return { engine, sound, notification, listener, clearLocalData };
}
beforeEach(() => {
  jest.resetModules();
  global.indexedDB = new IDBFactory();
  localStorage.clear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());

it('delivers an alert while its save is held back', async () => {
  const { engine, sound, notification, listener } = await engineTab(() => () => new Promise<boolean>(() => {}));
  const alert = await Promise.race([
    engine.createAlert('motion', 'critical'),
    new Promise<'still waiting'>((resolve) => setTimeout(() => resolve('still waiting'), 500)),
  ]);
  expect(alert).toMatchObject({ type: 'motion', severity: 'critical' });
  expect(sound).toHaveBeenCalledWith('critical');
  expect(notification).toHaveBeenCalled();
  expect(listener).toHaveBeenCalledWith(alert);
});

/**
 * A `cacheAlert` the test steers: it answers false without saving while `failures` lasts, and
 * otherwise waits for `gate` and saves for real. Every call is recorded.
 */
function steeredSave() {
  const control = { failures: 0, calls: [] as any[][], gate: Promise.resolve() };
  const make = (real: Save): Save => async (...args: any[]) => {
    control.calls.push(args);
    if (control.failures > 0) {
      control.failures -= 1;
      return false;
    }
    await control.gate;
    return real(...args);
  };
  return { control, make };
}
/** Another tab: a second set of modules over the same database and local storage. */
async function otherTab() {
  jest.resetModules();
  const { clearLocalData } = await import('@/lib/local-data');
  const { useMonitoringStore: monitoring } = await import('@/stores/monitoring-store');
  return { clearLocalData, monitoring };
}
async function storedIds(): Promise<string[]> {
  const db = await openDB('safeos-guardian');
  try { return (await db.getAll('alert_cache')).map((alert) => alert.id).sort(); } finally { db.close(); }
}

it('queues a failed save and retries it, and no sound holds an alert back', async () => {
  const { control, make } = steeredSave();
  const { engine, sound, listener } = await engineTab(make);
  await engine.updateThresholds({ alertCooldown: 0 });
  control.failures = 1;
  const first = await engine.createAlert('motion', 'critical');
  const second = await engine.createAlert('motion', 'critical');
  await engine.whenSaved();
  sound.mockRejectedValueOnce(new Error('The browser refused to play'));
  const third = await engine.createAlert('motion', 'critical');
  sound.mockImplementation(() => new Promise<void>(() => {}));
  const fourth = await Promise.race([
    engine.createAlert('motion', 'critical'),
    new Promise<'still waiting'>((resolve) => setTimeout(() => resolve('still waiting'), 500)),
  ]);
  await engine.whenSaved();
  const alerts = [first, second, third, fourth];
  for (const alert of alerts) expect(alert).toMatchObject({ type: 'motion', severity: 'critical' });
  expect(listener).toHaveBeenCalledTimes(4);
  expect(await storedIds()).toEqual(alerts.map((alert) => (alert as { id: string }).id).sort());
});

it('retries a save that fails while a later alert waits behind it', async () => {
  let failFirst = () => {};
  const held = new Promise<void>((resolve) => { failFirst = resolve; });
  let calls = 0;
  // The first write is held, then fails; every later write saves for real.
  const { engine } = await engineTab((real) => async (...args: any[]) => {
    if (calls++ === 0) {
      await held;
      return false;
    }
    return real(...args);
  });
  await engine.updateThresholds({ alertCooldown: 0 });
  const x = await engine.createAlert('motion', 'critical');
  const y = await engine.createAlert('motion', 'critical');
  failFirst();
  await engine.whenSaved();
  expect(await storedIds()).toEqual([x!.id, y!.id].sort());
});

it('acknowledges an alert whose save failed and saves the acknowledgement with the retry', async () => {
  const { control, make } = steeredSave();
  const { engine } = await engineTab(make);
  await engine.updateThresholds({ alertCooldown: 0 });
  control.failures = 1;
  const x = await engine.createAlert('motion', 'critical');
  await engine.whenSaved();
  expect(await engine.acknowledgeAlert(x!.id)).toBe(true);
  const y = await engine.createAlert('motion', 'critical');
  await engine.whenSaved();
  const db = await openDB('safeos-guardian');
  const stored = await db.get('alert_cache', x!.id);
  expect(stored).toMatchObject({ acknowledged: true });
  expect(stored.acknowledgedAt).toEqual(expect.any(String));
  expect(await db.get('alert_cache', y!.id)).toBeDefined();
  db.close();
});

it('acknowledges the saved record from a listener, and writes nothing for a cleared alert', async () => {
  const { engine } = await engineTab();
  let kept: Promise<boolean> | undefined;
  engine.onAlert((alert) => { kept = engine.acknowledgeAlert(alert.id); });
  const alert = await engine.createAlert('motion', 'critical');
  expect(await kept).toBe(true);
  const db = await openDB('safeos-guardian');
  expect(await db.get('alert_cache', alert!.id)).toMatchObject({ acknowledged: true });
  db.close();
  const other = await otherTab();
  await other.clearLocalData();
  expect(await engine.acknowledgeAlert(alert!.id)).toBe(false);
  expect(await storedIds()).toEqual([]);
});

it.each(['this tab', 'another tab', 'another tab that has read nothing', 'another tab with the retry held'])(
  'does not write a save that failed before Clear All Local Data: %s', async (where) => {
    const { control, make } = steeredSave();
    const { engine, clearLocalData } = await engineTab(make);
    await engine.updateThresholds({ alertCooldown: 0 });
    const w = where === 'another tab that has read nothing' ? null : await engine.createAlert('motion', 'critical');
    await engine.whenSaved();
    control.failures = 1;
    const x = await engine.createAlert('motion', 'critical');
    await engine.whenSaved();
    const other = where === 'this tab' ? undefined : await otherTab();
    let y: { id: string } | null;
    if (where === 'another tab with the retry held') {
      let release = () => {};
      control.gate = new Promise<void>((resolve) => { release = resolve; });
      const earlier = control.calls.length;
      y = await engine.createAlert('motion', 'critical');
      await waitFor(() => expect(control.calls.slice(earlier).some(([record]) => record.id === x!.id)).toBe(true), { timeout: 5000 });
      await other!.clearLocalData();
      release();
    } else {
      await (other ? other.clearLocalData() : clearLocalData());
      y = await engine.createAlert('motion', 'critical');
    }
    await engine.whenSaved();
    // Y alone: W went with the clear, and X, whose save failed before it, is not written after it.
    expect(await storedIds()).toEqual([y!.id]);
    expect([x!.id, ...(w ? [w.id] : [])]).not.toContain(y!.id);
  });

it('saves with its retry an alert raised after another tab cleared, whose first save failed', async () => {
  const { control, make } = steeredSave();
  const { engine } = await engineTab(make);
  await engine.updateThresholds({ alertCooldown: 0 });
  const w = await engine.createAlert('motion', 'critical');
  await engine.whenSaved();
  const other = await otherTab();
  await other.clearLocalData();
  await other.monitoring.getState().hydrateAlerts();
  control.failures = 1;
  const x = await engine.createAlert('motion', 'critical');
  await engine.whenSaved();
  const y = await engine.createAlert('motion', 'critical');
  await engine.whenSaved();
  expect(await storedIds()).toEqual([x!.id, y!.id].sort());
  expect(await storedIds()).not.toContain(w!.id);
});

it('saves a failed save with a history read when no later alert comes', async () => {
  const { control, make } = steeredSave();
  const { engine } = await engineTab(make);
  await engine.updateThresholds({ alertCooldown: 0 });
  control.failures = 1;
  const x = await engine.createAlert('motion', 'critical');
  await engine.whenSaved();
  expect(await storedIds()).toEqual([]);
  const listed = await engine.getRecentAlerts();
  expect(await storedIds()).toEqual([x!.id]);
  expect(listed.map((alert) => alert.id)).toEqual([x!.id]);
});

/**
 * An `updateCachedAlert` the test steers: it answers failed without writing while `failures`
 * lasts, and otherwise updates for real. Every call is recorded.
 */
function steeredUpdate() {
  const control = { failures: 0, calls: [] as any[][] };
  const make = (real: Update): Update => async (...args: any[]) => {
    control.calls.push(args);
    if (control.failures > 0) {
      control.failures -= 1;
      return 'failed';
    }
    return real(...args);
  };
  return { control, make };
}

it('retries a failed acknowledgement of a saved alert with the next retry pass', async () => {
  const { control, make } = steeredUpdate();
  const { engine } = await engineTab(undefined, make);
  await engine.updateThresholds({ alertCooldown: 0 });
  const x = await engine.createAlert('motion', 'critical');
  await engine.whenSaved();
  control.failures = 1;
  expect(await engine.acknowledgeAlert(x!.id)).toBe(true);
  const db = await openDB('safeos-guardian');
  try {
    expect(await db.get('alert_cache', x!.id)).toMatchObject({ acknowledged: false });
    const y = await engine.createAlert('motion', 'critical');
    await engine.whenSaved();
    const stored = await db.get('alert_cache', x!.id);
    expect(stored).toMatchObject({ acknowledged: true });
    expect(stored.acknowledgedAt).toEqual(expect.any(String));
    expect(await db.get('alert_cache', y!.id)).toMatchObject({ acknowledged: false });
  } finally {
    db.close();
  }
});

it('creates no record when it retries a failed acknowledgement whose record is gone', async () => {
  const { control, make } = steeredUpdate();
  const { engine } = await engineTab(undefined, make);
  await engine.updateThresholds({ alertCooldown: 0 });
  const x = await engine.createAlert('motion', 'critical');
  await engine.whenSaved();
  control.failures = 1;
  expect(await engine.acknowledgeAlert(x!.id)).toBe(true);
  const db = await openDB('safeos-guardian');
  await db.delete('alert_cache', x!.id);
  db.close();
  const forX = () => control.calls.filter(([record]) => record.id === x!.id).length;
  const y = await engine.createAlert('motion', 'critical');
  await engine.whenSaved();
  // The retry asked for an update of the record, found it gone and created none.
  expect(forX()).toBe(2);
  expect(await storedIds()).toEqual([y!.id]);
  // A retry that found the record gone leaves nothing waiting.
  const z = await engine.createAlert('motion', 'critical');
  await engine.whenSaved();
  expect(forX()).toBe(2);
  expect(await storedIds()).toEqual([y!.id, z!.id].sort());
});

it('acknowledges with the retry a saved engine alert that Clear all in another tab kept', async () => {
  const { control, make } = steeredUpdate();
  const { engine } = await engineTab(undefined, make);
  await engine.updateThresholds({ alertCooldown: 0 });
  const x = await engine.createAlert('motion', 'critical');
  await engine.whenSaved();
  control.failures = 1;
  expect(await engine.acknowledgeAlert(x!.id)).toBe(true);
  // Another tab's Clear all deletes its monitoring alerts and names a new clear; the engine's alert stays.
  jest.resetModules();
  const other = await import('@/lib/client-db');
  await other.clearCachedMonitoringAlerts();
  expect(await storedIds()).toEqual([x!.id]);
  await engine.getRecentAlerts();
  const db = await openDB('safeos-guardian');
  try {
    const stored = await db.get('alert_cache', x!.id);
    expect(stored).toMatchObject({ acknowledged: true });
    expect(stored.acknowledgedAt).toEqual(expect.any(String));
  } finally {
    db.close();
  }
});

it('writes nothing and drops a failed acknowledgement whose alert another tab cleared with all local data', async () => {
  const { control, make } = steeredUpdate();
  const { engine } = await engineTab(undefined, make);
  await engine.updateThresholds({ alertCooldown: 0 });
  const x = await engine.createAlert('motion', 'critical');
  await engine.whenSaved();
  control.failures = 1;
  expect(await engine.acknowledgeAlert(x!.id)).toBe(true);
  const other = await otherTab();
  await other.clearLocalData();
  const forX = () => control.calls.filter(([record]) => record.id === x!.id);
  await engine.getRecentAlerts();
  // The retry is an update with no clear stamp: it found the record gone and created none.
  expect(forX()).toHaveLength(2);
  expect(forX()[1][1]).toBeUndefined();
  expect(await storedIds()).toEqual([]);
  // A retry that found the record gone leaves nothing waiting.
  await engine.getRecentAlerts();
  expect(forX()).toHaveLength(2);
  expect(await storedIds()).toEqual([]);
});
