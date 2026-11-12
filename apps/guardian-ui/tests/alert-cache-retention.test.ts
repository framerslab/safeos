/** @jest-environment jsdom */
import { openDB } from 'idb';
import { cacheAlert, getCachedAlerts } from '@/lib/client-db';
import { useMonitoringStore } from '@/stores/monitoring-store';
import { useAuthStore } from '@/stores/auth-store';

require('fake-indexeddb/auto');
Object.defineProperty(global, 'structuredClone', { configurable: true, value: (value: unknown) =>
  require('v8').deserialize(require('v8').serialize(value)),
});
const DAY = 24 * 60 * 60 * 1000;
const alert = (id: string, createdAt = new Date().toISOString()) => ({
  id, streamId: 'camera', severity: 'low' as const, message: id, createdAt, acknowledged: false,
});
function owner(id: string) {
  useAuthStore.setState({ profile: { id } as any });
  useMonitoringStore.setState({ alerts: [] });
}
beforeEach(async () => {
  owner('alice');
  await useMonitoringStore.getState().hydrateAlerts();
  const db = await openDB('safeos-guardian');
  await db.clear('alert_cache');
  db.close();
});
afterEach(() => jest.restoreAllMocks());

it.each(['engine', 'sync'])('bounds shared records written by %s to 500', async (producer) => {
  for (let i = 0; i < 505; i++) await cacheAlert(alert(`${producer}-${i}`));
  const db = await openDB('safeos-guardian');
  expect(await db.count('alert_cache')).toBe(500);
  db.close();
});

it('keeps exactly 100 monitoring records for each owner independently', async () => {
  for (const id of ['alice', 'bob']) {
    owner(id);
    for (let i = 0; i < 105; i++) useMonitoringStore.getState().addAlert(alert(`${id}-${i}`));
    await useMonitoringStore.getState().hydrateAlerts();
  }
  owner('alice');
  await useMonitoringStore.getState().hydrateAlerts();
  expect(useMonitoringStore.getState().alerts).toHaveLength(100);
  expect(useMonitoringStore.getState().alerts.every(a => a.id.startsWith('alice-'))).toBe(true);
  const db = await openDB('safeos-guardian');
  expect(await db.count('alert_cache')).toBe(200);
  db.close();
});

it('expires shared and monitoring records after 24 hours even without new alerts', async () => {
  const start = Date.now();
  await cacheAlert(alert('engine-old', new Date(start).toISOString()));
  useMonitoringStore.getState().addAlert(alert('monitor-old', new Date(start).toISOString()));
  await useMonitoringStore.getState().hydrateAlerts();
  jest.spyOn(Date, 'now').mockReturnValue(start + DAY + 1);
  useMonitoringStore.setState({ alerts: [] });
  await useMonitoringStore.getState().hydrateAlerts();
  expect(useMonitoringStore.getState().alerts).toEqual([]);
  expect(await getCachedAlerts()).toEqual([]);
  const db = await openDB('safeos-guardian');
  expect(await db.count('alert_cache')).toBe(0);
  db.close();
});

it('reads monitoring history through an owner index without loading the store', async () => {
  useMonitoringStore.getState().addAlert(alert('alice-only'));
  await useMonitoringStore.getState().hydrateAlerts();
  owner('bob');
  useMonitoringStore.getState().addAlert(alert('bob-only'));
  await useMonitoringStore.getState().hydrateAlerts();
  const getAll = jest.spyOn(IDBObjectStore.prototype, 'getAll');
  owner('alice');
  await useMonitoringStore.getState().hydrateAlerts();
  expect(useMonitoringStore.getState().alerts.map(a => a.id)).toEqual(['alice-only']);
  expect(getAll.mock.instances.some(store => store.name === 'alert_cache')).toBe(false);
});

it('acknowledges and clears only the current owners history', async () => {
  useMonitoringStore.getState().addAlert(alert('alice-only'));
  await useMonitoringStore.getState().hydrateAlerts();
  owner('bob');
  useMonitoringStore.getState().addAlert(alert('bob-only'));
  await useMonitoringStore.getState().hydrateAlerts();
  useMonitoringStore.getState().clearAlerts();
  await useMonitoringStore.getState().hydrateAlerts();
  owner('alice');
  await useMonitoringStore.getState().hydrateAlerts();
  expect(useMonitoringStore.getState().alerts.map(a => a.id)).toEqual(['alice-only']);
});
