/** @jest-environment jsdom */
import { openDB } from 'idb';
import { cacheAlert, getCachedAlerts, getCachedMonitoringAlerts, saveLocalSession } from '@/lib/client-db';
import { useAuthStore } from '@/stores/auth-store';
import { useMonitoringStore } from '@/stores/monitoring-store';
require('fake-indexeddb/auto');
Object.defineProperty(global, 'structuredClone', { configurable: true, value: (value: unknown) =>
  require('v8').deserialize(require('v8').serialize(value)),
});
it('upgrades a version 4 database in place and indexes its existing alerts', async () => {
  const old = await openDB('safeos-guardian', 4, { upgrade(db) {
    const alerts = db.createObjectStore('alert_cache', { keyPath: 'id' });
    alerts.createIndex('by-stream', 'streamId');
    alerts.createIndex('by-created', 'createdAt');
    db.createObjectStore('settings_cache', { keyPath: 'key' });
  } });
  const record = { id: 'existing', monitoring: true, streamId: 'camera', message: 'Saved history',
    createdAt: '2026-10-01T10:00:00.000Z', acknowledged: true };
  await old.put('alert_cache', record);
  for (let i = 0; i < 299; i++) await old.put('alert_cache', { ...record, id: `retained-${i}` });
  // Older writers accepted a missing or invalid creation date.
  await old.put('alert_cache', { ...record, id: 'invalid-date', createdAt: 'not-a-date' });
  await old.put('alert_cache', { ...record, id: 'unindexed-date', createdAt: {} });
  await old.put('settings_cache', { key: 'saved', value: 'keep' });
  old.close();
  await saveLocalSession({ id: 'alice-session', token: 'local-alice', deviceId: null,
    profile: { id: 'alice' }, createdAt: '2026-10-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z', syncedAt: null });
  await useAuthStore.getState().initialize();
  await useMonitoringStore.getState().hydrateAlerts();
  expect(useMonitoringStore.getState().alerts).toHaveLength(302);
  expect(await getCachedAlerts(undefined, 'alice')).toEqual(expect.arrayContaining([expect.objectContaining(record)]));
  expect(await getCachedMonitoringAlerts('bob')).toEqual([]);
  const upgraded = await openDB('safeos-guardian');
  expect(upgraded.version).toBeGreaterThan(4);
  expect(await upgraded.count('alert_cache')).toBe(302);
  expect(await upgraded.get('alert_cache', 'invalid-date')).toMatchObject({ savedBeforeUpgrade: true, originalCreatedAt: 'not-a-date' });
  expect(await upgraded.get('alert_cache', 'unindexed-date')).toMatchObject({ savedBeforeUpgrade: true, originalCreatedAt: {} });
  expect(upgraded.transaction('alert_cache').store.indexNames.contains('by-owner-created')).toBe(true);
  expect(await upgraded.get('settings_cache', 'saved')).toEqual({ key: 'saved', value: 'keep' });
  for (let i = 0; i < 101; i++) useMonitoringStore.getState().addAlert({
    id: `new-${i}`, streamId: 'camera', severity: 'critical', message: `New ${i}`,
    acknowledged: i > 0, createdAt: new Date(Date.now() - 1000 + i).toISOString(),
  });
  await useMonitoringStore.getState().hydrateAlerts();
  expect(useMonitoringStore.getState().alerts).toHaveLength(402);
  expect(await upgraded.get('alert_cache', 'new-0')).toBeDefined();
  expect(await upgraded.get('alert_cache', 'new-1')).toBeUndefined();
  for (let i = 0; i < 505; i++) await cacheAlert({ id: `shared-${i}`, acknowledged: true });
  expect((await upgraded.getAll('alert_cache')).filter((a: any) => a.savedBeforeUpgrade)).toHaveLength(302);
  expect(await upgraded.count('alert_cache')).toBe(802);
  useMonitoringStore.getState().acknowledgeAlert('existing');
  await useMonitoringStore.getState().hydrateAlerts();
  expect(await upgraded.get('alert_cache', 'existing')).toMatchObject({ savedBeforeUpgrade: true });
  useMonitoringStore.getState().clearAlerts();
  await useMonitoringStore.getState().hydrateAlerts();
  expect(await upgraded.get('alert_cache', 'existing')).toBeUndefined();
  upgraded.close();
}, 60000);
