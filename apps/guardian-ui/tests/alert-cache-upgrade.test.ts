/** @jest-environment jsdom */
import { openDB } from 'idb';
import { IDBFactory } from 'fake-indexeddb';
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
  await old.put('alert_cache', { ...record, id: 'zero-date', createdAt: 0 });
  await old.put('alert_cache', { ...record, id: 'empty-date', createdAt: '' });
  await old.put('settings_cache', { key: 'saved', value: 'keep' });
  old.close();
  await saveLocalSession({ id: 'alice-session', token: 'local-alice', deviceId: null,
    profile: { id: 'alice' }, createdAt: '2026-10-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z', syncedAt: null });
  await useAuthStore.getState().initialize();
  await useMonitoringStore.getState().hydrateAlerts();
  expect(useMonitoringStore.getState().alerts).toHaveLength(304);
  expect(await getCachedAlerts(undefined, 'alice')).toEqual(expect.arrayContaining([expect.objectContaining(record)]));
  expect(await getCachedMonitoringAlerts('bob')).toEqual([]);
  const upgraded = await openDB('safeos-guardian');
  expect(upgraded.version).toBeGreaterThan(4);
  expect(await upgraded.count('alert_cache')).toBe(304);
  expect(await upgraded.get('alert_cache', 'invalid-date')).toMatchObject({ savedBeforeUpgrade: true, originalCreatedAt: 'not-a-date' });
  expect(await upgraded.get('alert_cache', 'unindexed-date')).toMatchObject({ savedBeforeUpgrade: true, originalCreatedAt: {} });
  expect(await upgraded.get('alert_cache', 'zero-date')).toMatchObject({ savedBeforeUpgrade: true, originalCreatedAt: 0 });
  expect(await upgraded.get('alert_cache', 'empty-date')).toMatchObject({ savedBeforeUpgrade: true, originalCreatedAt: '' });
  expect(upgraded.transaction('alert_cache').store.indexNames.contains('by-owner-created')).toBe(true);
  expect(await upgraded.get('settings_cache', 'saved')).toEqual({ key: 'saved', value: 'keep' });
  for (let i = 0; i < 101; i++) useMonitoringStore.getState().addAlert({
    id: `new-${i}`, streamId: 'camera', severity: 'critical', message: `New ${i}`,
    acknowledged: i > 0, createdAt: new Date(Date.now() - 1000 + i).toISOString(),
  });
  await useMonitoringStore.getState().hydrateAlerts();
  expect(useMonitoringStore.getState().alerts).toHaveLength(404);
  expect(await upgraded.get('alert_cache', 'new-0')).toBeDefined();
  expect(await upgraded.get('alert_cache', 'new-1')).toBeUndefined();
  for (let i = 0; i < 505; i++) await cacheAlert({ id: `shared-${i}`, acknowledged: true });
  expect((await upgraded.getAll('alert_cache')).filter((a: any) => a.savedBeforeUpgrade)).toHaveLength(304);
  expect(await upgraded.count('alert_cache')).toBe(804);
  // Protection belongs to the saved record, including through an owner change.
  await cacheAlert({ ...record, ownerId: 'bob' });
  expect(await upgraded.get('alert_cache', 'existing')).toMatchObject({ ownerId: 'bob', savedBeforeUpgrade: true, retentionClass: 'saved' });
  await cacheAlert({ ...record, ownerId: 'alice' });
  useMonitoringStore.getState().acknowledgeAlert('existing');
  await useMonitoringStore.getState().hydrateAlerts();
  expect(await upgraded.get('alert_cache', 'existing')).toMatchObject({ savedBeforeUpgrade: true });
  useMonitoringStore.getState().clearAlerts();
  await useMonitoringStore.getState().hydrateAlerts();
  expect(await upgraded.get('alert_cache', 'existing')).toBeUndefined();
  upgraded.close();
}, 60000);

/** A fresh browser: an empty database factory and a new set of modules. */
async function fresh() {
  jest.resetModules();
  global.indexedDB = new IDBFactory();
  localStorage.clear();
  const db = await import('@/lib/client-db');
  const { useMonitoringStore: monitoring } = await import('@/stores/monitoring-store');
  return { db, monitoring };
}
const OTHER_STORES: Array<[string, string]> = [
  ['local_session', 'id'], ['profile_cache', 'id'], ['stream_cache', 'id'], ['frame_cache', 'id'], ['sync_queue', 'id'],
  ['settings_cache', 'key'], ['consent_log', 'id'], ['subject_profile', 'id'], ['match_frame', 'id'],
  ['intrusion_frame', 'id'], ['custom_media', 'id'], ['animal_detection', 'id'],
];

it.each([5, 6])('upgrades a version %i database left by an unreleased build', async (version) => {
  const { monitoring } = await fresh();
  const old = await openDB('safeos-guardian', version, { upgrade(database) {
    for (const [name, keyPath] of OTHER_STORES) database.createObjectStore(name, { keyPath });
    const alerts = database.createObjectStore('alert_cache', { keyPath: 'id' });
    alerts.createIndex('by-stream', 'streamId');
    alerts.createIndex('by-created', 'createdAt');
    alerts.createIndex('by-owner-created', ['cacheOwner', 'createdAt']);
    if (version === 6) {
      alerts.createIndex('by-retention', ['retentionClass', 'acknowledgementOrder', 'createdAt']);
      alerts.createIndex('by-owner-retention', ['cacheOwner', 'retentionClass', 'acknowledgementOrder', 'createdAt']);
    }
  } });
  for (const ownerId of ['bob', 'alice', '']) await old.put('alert_cache', {
    id: `saved-under-${ownerId || 'nobody'}`, monitoring: true, ownerId, cacheOwner: `monitoring:${ownerId}`,
    streamId: 'camera', severity: 'low', message: 'Unreleased build', createdAt: '2026-10-01T10:00:00.000Z',
    acknowledged: false, ...(version === 6 ? { retentionClass: 'new', acknowledgementOrder: 1 } : {}),
  });
  old.close();
  await monitoring.getState().hydrateAlerts();
  expect(monitoring.getState().alerts.map(a => a.id).sort()).toEqual(['saved-under-alice', 'saved-under-bob', 'saved-under-nobody']);
  const upgraded = await openDB('safeos-guardian');
  expect(upgraded.version).toBe(7);
  const records = await upgraded.getAll('alert_cache');
  expect(records.filter((a: any) => 'ownerId' in a || 'cacheOwner' in a)).toEqual([]);
  expect(records.map((a: any) => [a.savedBeforeUpgrade, a.retentionClass])).toEqual(records.map(() => [true, 'saved']));
  const indexes = upgraded.transaction('alert_cache').store.indexNames;
  expect(indexes.contains('by-owner-created')).toBe(false);
  expect(indexes.contains('by-owner-retention')).toBe(false);
  upgraded.close();
});

it('saves an alert whose date cannot be read', async () => {
  const { db } = await fresh();
  expect(await db.cacheAlert({ id: 'bad', createdAt: 'not-a-date' })).toBe(true);
  const stored = await openDB('safeos-guardian');
  const record = await stored.get('alert_cache', 'bad');
  stored.close();
  expect(Number.isFinite(Date.parse(record.createdAt))).toBe(true);
  expect(record.originalCreatedAt).toBe('not-a-date');
});

it('keeps the creation time of a saved record through an acknowledgement, also one in the future', async () => {
  const { db, monitoring } = await fresh();
  const old = await openDB('safeos-guardian', 4, { upgrade(database) {
    const alerts = database.createObjectStore('alert_cache', { keyPath: 'id' });
    alerts.createIndex('by-stream', 'streamId');
    alerts.createIndex('by-created', 'createdAt');
  } });
  await old.put('alert_cache', { id: 'future', monitoring: true, streamId: 'camera', severity: 'low',
    message: 'Dated ahead', createdAt: '2027-01-01T00:00:00.000Z', acknowledged: false });
  old.close();
  await monitoring.getState().hydrateAlerts();
  monitoring.getState().acknowledgeAlert('future');
  await monitoring.getState().hydrateAlerts();
  const kept = { createdAt: '2027-01-01T00:00:00.000Z', savedBeforeUpgrade: true, retentionClass: 'saved' };
  const stored = await openDB('safeos-guardian');
  expect(await stored.get('alert_cache', 'future')).toMatchObject({ ...kept, acknowledged: true });
  await db.cacheAlert({ id: 'future', acknowledged: false });
  expect(await stored.get('alert_cache', 'future')).toMatchObject(kept);
  stored.close();
});
