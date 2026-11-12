/** @jest-environment jsdom */
import { openDB } from 'idb';
import { getCachedAlerts } from '@/lib/client-db';
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
    createdAt: new Date().toISOString(), acknowledged: true };
  await old.put('alert_cache', record);
  for (let i = 0; i < 99; i++) await old.put('alert_cache', { ...record, id: `retained-${i}` });
  // Older writers accepted a missing or invalid creation date.
  await old.put('alert_cache', { ...record, id: 'invalid-date', createdAt: 'not-a-date' });
  await old.put('alert_cache', { ...record, id: 'unindexed-date', createdAt: {} });
  await old.put('settings_cache', { key: 'saved', value: 'keep' });
  old.close();
  expect(await getCachedAlerts()).toEqual(expect.arrayContaining([expect.objectContaining(record)]));
  const upgraded = await openDB('safeos-guardian');
  expect(upgraded.version).toBeGreaterThan(4);
  expect(await upgraded.count('alert_cache')).toBe(100);
  expect(await upgraded.get('alert_cache', 'invalid-date')).toBeUndefined();
  expect(await upgraded.get('alert_cache', 'unindexed-date')).toBeUndefined();
  expect(upgraded.transaction('alert_cache').store.indexNames.contains('by-owner-created')).toBe(true);
  expect(await upgraded.get('settings_cache', 'saved')).toEqual({ key: 'saved', value: 'keep' });
  upgraded.close();
});
