/** @jest-environment jsdom */
import { openDB } from 'idb';
import { cacheAlert, getCachedAlerts, getCachedMonitoringAlerts, queueSyncAction } from '@/lib/client-db';
import { localAlertEngine } from '@/lib/local-alert-engine';
import { syncPendingActions } from '@/lib/sync-service';
require('fake-indexeddb/auto');
Object.defineProperty(global, 'structuredClone', { configurable: true, value: (value: unknown) =>
  require('v8').deserialize(require('v8').serialize(value)),
});
beforeEach(async () => {
  await getCachedAlerts();
  const db = await openDB('safeos-guardian');
  await db.clear('alert_cache');
  await db.clear('sync_queue');
  db.close();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
it('enforces the shared limit through the real local alert engine', async () => {
  await localAlertEngine.updateConfig({ soundEnabled: false, notificationsEnabled: false });
  await localAlertEngine.updateThresholds({ alertCooldown: 0 });
  for (let i = 0; i < 505; i++) await localAlertEngine.createAlert('motion', 'info');
  const db = await openDB('safeos-guardian');
  expect(await db.count('alert_cache')).toBe(500);
  db.close();
});
it('caches acknowledgement responses from the API with their original age and shared bound', async () => {
  localStorage.setItem('safeos_backend_config', JSON.stringify({ apiUrl: 'https://api.example.test' }));
  for (let i = 0; i < 500; i++) await cacheAlert({ id: `engine-${i}`, acknowledged: true, createdAt: new Date().toISOString() });
  const rows = [
    { id: 'synced-current', thumbnail_url: 'data:image/png;base64,server', stream_id: 'camera', acknowledged: 1, created_at: new Date().toISOString() },
    { id: 'synced-older', stream_id: 'camera', acknowledged: 1, created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() },
  ];
  global.fetch = jest.fn().mockImplementation(async (url: string) => ({ ok: true, json: async () => ({
    alert: rows.find(row => url.includes(row.id)),
  }) }));
  for (const row of rows) await queueSyncAction({ action: 'acknowledge_alert', endpoint: `/api/alerts/${row.id}/acknowledge`, method: 'POST', body: null });
  expect(await syncPendingActions()).toEqual({ synced: 2, failed: 0, pending: 0 });
  const db = await openDB('safeos-guardian');
  expect(await db.get('alert_cache', 'synced-current')).toMatchObject({ streamId: 'camera', acknowledged: true, createdAt: rows[0].created_at, thumbnailUrl: rows[0].thumbnail_url });
  expect(await db.get('alert_cache', 'synced-older')).toBeUndefined();
  expect(await db.count('alert_cache')).toBe(500);
  db.close();
});

it('keeps monitoring ownership and history when sync updates an acknowledgement', async () => {
  localStorage.setItem('safeos_backend_config', JSON.stringify({ apiUrl: 'https://api.example.test' }));
  const createdAt = new Date().toISOString();
  await cacheAlert({ id: 'monitor-synced', monitoring: true, ownerId: 'alice', streamId: 'camera',
    message: 'Motion', createdAt, acknowledged: false, thumbnailUrl: 'data:image/png;base64,example' });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ alert: {
    id: 'monitor-synced', stream_id: 'camera', created_at: createdAt, acknowledged: 1,
  } }) });
  await queueSyncAction({ action: 'acknowledge_alert', endpoint: '/api/alerts/monitor-synced/acknowledge', method: 'POST', body: null });
  expect(await syncPendingActions()).toEqual({ synced: 1, failed: 0, pending: 0 });
  expect(await getCachedMonitoringAlerts('alice')).toEqual([expect.objectContaining({
    id: 'monitor-synced', ownerId: 'alice', acknowledged: true, createdAt,
    thumbnailUrl: 'data:image/png;base64,example',
  })]);
  expect(await getCachedMonitoringAlerts('bob')).toEqual([]);
});
