/** @jest-environment jsdom */
import { openDB } from 'idb';
import { cacheAlert, getCachedAlerts } from '@/lib/client-db';
import { useMonitoringStore } from '@/stores/monitoring-store';
import { localAlertEngine } from '@/lib/local-alert-engine';
import { useAuthStore } from '@/stores/auth-store';

require('fake-indexeddb/auto');
// These integration scenarios serialize hundreds of real IndexedDB transactions.
jest.setTimeout(60000);
Object.defineProperty(global, 'structuredClone', { configurable: true, value: (value: unknown) =>
  require('v8').deserialize(require('v8').serialize(value)),
});
const DAY = 24 * 60 * 60 * 1000;
const alert = (id: string, createdAt = new Date().toISOString()) => ({
  id, streamId: 'camera', severity: 'low' as const, message: id, createdAt, acknowledged: false,
});
function owner(id: string) {
  useAuthStore.setState({ profile: { id } as any, isInitialized: true });
  useMonitoringStore.setState({ alerts: [] });
}
beforeEach(async () => {
  owner('alice');
  await useMonitoringStore.getState().hydrateAlerts();
  const db = await openDB('safeos-guardian');
  await db.clear('alert_cache');
  db.close();
  useMonitoringStore.setState({ alerts: [] });
});
afterEach(() => jest.restoreAllMocks());

it.each(['engine', 'sync'])('bounds shared records written by %s to 500', async (producer) => {
  for (let i = 0; i < 505; i++) await cacheAlert(alert(`${producer}-${i}`));
  const db = await openDB('safeos-guardian');
  expect(await db.count('alert_cache')).toBe(500);
  db.close();
});

it('keeps 100 new monitoring records for the browser across two sessions', async () => {
  for (const id of ['alice', 'bob']) {
    owner(id);
    for (let i = 0; i < 105; i++) useMonitoringStore.getState().addAlert(alert(`${id}-${i}`));
    await useMonitoringStore.getState().hydrateAlerts();
  }
  owner('alice');
  await useMonitoringStore.getState().hydrateAlerts();
  expect(useMonitoringStore.getState().alerts).toHaveLength(100);
  const db = await openDB('safeos-guardian');
  expect(await db.count('alert_cache')).toBe(100);
  db.close();
});

it('keeps shared and monitoring records regardless of age without new alerts', async () => {
  const start = Date.now();
  await cacheAlert(alert('engine-old', new Date(start).toISOString()));
  useMonitoringStore.getState().addAlert(alert('monitor-old', new Date(start).toISOString()));
  await useMonitoringStore.getState().hydrateAlerts();
  jest.spyOn(Date, 'now').mockReturnValue(start + DAY + 1);
  await useMonitoringStore.getState().hydrateAlerts();
  expect(useMonitoringStore.getState().alerts.map(a => a.id)).toEqual(['monitor-old']);
  expect((await getCachedAlerts()).map(a => a.id).sort()).toEqual(['engine-old', 'monitor-old']);
  const db = await openDB('safeos-guardian');
  expect(await db.count('alert_cache')).toBe(2);
  db.close();
});

it('reads monitoring history through the producer index without loading the store', async () => {
  useMonitoringStore.getState().addAlert(alert('alice-only'));
  await useMonitoringStore.getState().hydrateAlerts();
  owner('bob');
  useMonitoringStore.getState().addAlert(alert('bob-only'));
  await useMonitoringStore.getState().hydrateAlerts();
  const getAll = jest.spyOn(IDBObjectStore.prototype, 'getAll');
  const cursors = jest.spyOn(IDBIndex.prototype, 'openCursor');
  owner('alice');
  await useMonitoringStore.getState().hydrateAlerts();
  expect(useMonitoringStore.getState().alerts.map(a => a.id).sort()).toEqual(['alice-only', 'bob-only']);
  expect(getAll.mock.contexts.some(store => (store as unknown as IDBObjectStore).name === 'alert_cache')).toBe(false);
  expect(cursors.mock.contexts.map(index => (index as unknown as IDBIndex).name)).toContain('by-producer-created');
});

it('a clear under another session clears the browser’s monitoring history and leaves the shared record', async () => {
  await cacheAlert(alert('shared'));
  useMonitoringStore.getState().addAlert(alert('alice-only'));
  await useMonitoringStore.getState().hydrateAlerts();
  owner('bob');
  useMonitoringStore.getState().addAlert(alert('bob-only'));
  await useMonitoringStore.getState().hydrateAlerts();
  useMonitoringStore.getState().clearAlerts();
  await useMonitoringStore.getState().hydrateAlerts();
  owner('alice');
  await useMonitoringStore.getState().hydrateAlerts();
  expect(useMonitoringStore.getState().alerts).toEqual([]);
  expect((await getCachedAlerts()).map(a => a.id)).toEqual(['shared']);
});

it('keeps old records on write without an age cutoff', async () => {
  const older = new Date(Date.now() - DAY - 1).toISOString();
  await cacheAlert(alert('old-shared', older));
  useMonitoringStore.getState().addAlert(alert('old-monitor', older));
  await useMonitoringStore.getState().hydrateAlerts();
  const db = await openDB('safeos-guardian');
  expect(await db.count('alert_cache')).toBe(2);
  db.close();
});

it('generic readers and acknowledgements reach every record', async () => {
  await cacheAlert(alert('shared'));
  for (const id of ['alice', 'bob']) {
    owner(id);
    useMonitoringStore.getState().addAlert(alert(`${id}-private`));
    await useMonitoringStore.getState().hydrateAlerts();
  }
  owner('alice');
  const every = ['alice-private', 'bob-private', 'shared'];
  expect((await getCachedAlerts()).map(a => a.id).sort()).toEqual(every);
  expect((await getCachedAlerts('camera')).map(a => a.id).sort()).toEqual(every);
  expect((await localAlertEngine.getRecentAlerts()).map(a => a.id).sort()).toEqual(every);
  expect((await localAlertEngine.getUnacknowledgedAlerts()).map(a => a.id).sort()).toEqual(every);
  await localAlertEngine.acknowledgeAlert('bob-private');
  const db = await openDB('safeos-guardian');
  expect((await db.get('alert_cache', 'bob-private')).acknowledged).toBe(true);
  db.close();
});

it('keeps every session’s history and the shared record on a later monitoring-only read', async () => {
  const start = Date.now();
  await cacheAlert(alert('shared-older', new Date(start).toISOString()));
  for (const id of ['alice', 'bob']) {
    owner(id);
    useMonitoringStore.getState().addAlert(alert(`${id}-older`, new Date(start).toISOString()));
    await useMonitoringStore.getState().hydrateAlerts();
  }
  jest.spyOn(Date, 'now').mockReturnValue(start + DAY + 1);
  await useMonitoringStore.getState().hydrateAlerts();
  expect(useMonitoringStore.getState().alerts.map(a => a.id).sort()).toEqual(['alice-older', 'bob-older']);
  const db = await openDB('safeos-guardian');
  expect(await db.count('alert_cache')).toBe(3);
  db.close();
});


it('keeps an early unseen critical alert in memory and storage ahead of acknowledged alerts', async () => {
  const created = Date.now() - 30 * DAY;
  useMonitoringStore.getState().addAlert({ ...alert('unseen', new Date(created).toISOString()), severity: 'critical' });
  for (let i = 0; i < 100; i++) useMonitoringStore.getState().addAlert({
    ...alert(`seen-${i}`, new Date(created + i + 1).toISOString()), acknowledged: true,
  });
  expect(useMonitoringStore.getState().alerts.map(a => a.id)).toContain('unseen');
  expect(useMonitoringStore.getState().alerts.map(a => a.id)).not.toContain('seen-0');
  await useMonitoringStore.getState().hydrateAlerts();
  expect(useMonitoringStore.getState().alerts.map(a => a.id)).toContain('unseen');
  const db = await openDB('safeos-guardian');
  expect(await db.get('alert_cache', 'unseen')).toBeDefined();
  expect(await db.get('alert_cache', 'seen-0')).toBeUndefined();
  expect(await db.count('alert_cache')).toBe(100);
  db.close();
});

it('trims acknowledged shared records first, then oldest unseen records only when necessary', async () => {
  const created = Date.now() - 30 * DAY;
  for (let i = 0; i < 500; i++) await cacheAlert(alert(`unseen-${i}`, new Date(created + i).toISOString()));
  await cacheAlert({ ...alert('seen-new'), acknowledged: true });
  const db = await openDB('safeos-guardian');
  expect(await db.get('alert_cache', 'seen-new')).toBeUndefined();
  expect(await db.get('alert_cache', 'unseen-0')).toBeDefined();
  await cacheAlert(alert('unseen-new'));
  expect(await db.get('alert_cache', 'unseen-0')).toBeUndefined();
  expect(await db.get('alert_cache', 'unseen-1')).toBeDefined();
  db.close();
});

it('keeps displayed alerts when a browser history read fails and retries on the next read', async () => {
  useMonitoringStore.getState().addAlert({ ...alert('visible-during-read-failure'), severity: 'critical' });
  await useMonitoringStore.getState().hydrateAlerts();
  jest.spyOn(IDBDatabase.prototype, 'transaction').mockImplementationOnce(() => {
    throw new DOMException('The connection is unavailable', 'InvalidStateError');
  });
  await useMonitoringStore.getState().hydrateAlerts();
  expect(useMonitoringStore.getState().alerts.map(a => a.id)).toEqual(['visible-during-read-failure']);
  await useMonitoringStore.getState().hydrateAlerts();
  expect(useMonitoringStore.getState().alerts.map(a => a.id)).toEqual(['visible-during-read-failure']);
});

it('keeps a live alert through a failed save and retries it on the next history read', async () => {
  const put = IDBObjectStore.prototype.put;
  const failingWrite = jest.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<typeof put>) {
    if (this.name === 'alert_cache') throw new DOMException('Storage full', 'QuotaExceededError');
    return put.apply(this, args);
  });
  useMonitoringStore.getState().addAlert({ ...alert('live-during-write-failure'), severity: 'critical' });
  await useMonitoringStore.getState().hydrateAlerts();
  expect(useMonitoringStore.getState().alerts.map(a => a.id)).toEqual(['live-during-write-failure']);
  failingWrite.mockRestore();
  await useMonitoringStore.getState().hydrateAlerts();
  expect(useMonitoringStore.getState().alerts.map(a => a.id)).toEqual(['live-during-write-failure']);
  expect((await getCachedAlerts()).map(a => a.id)).toEqual(['live-during-write-failure']);
});

it.each(['dismiss', 'clear'])('does not restore an unsaved live alert after %s', async (action) => {
  const put = IDBObjectStore.prototype.put;
  const failingWrite = jest.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<typeof put>) {
    if (this.name === 'alert_cache') throw new DOMException('Storage full', 'QuotaExceededError');
    return put.apply(this, args);
  });
  useMonitoringStore.getState().addAlert(alert('unsaved-to-remove'));
  await useMonitoringStore.getState().hydrateAlerts();
  expect(useMonitoringStore.getState().alerts.map(a => a.id)).toEqual(['unsaved-to-remove']);
  if (action === 'dismiss') useMonitoringStore.getState().removeAlert('unsaved-to-remove');
  else useMonitoringStore.getState().clearAlerts();
  failingWrite.mockRestore();
  await useMonitoringStore.getState().hydrateAlerts();
  expect(useMonitoringStore.getState().alerts).toEqual([]);
  expect(await getCachedAlerts()).toEqual([]);
});
