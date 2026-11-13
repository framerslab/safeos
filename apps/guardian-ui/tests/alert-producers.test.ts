/** @jest-environment jsdom */
import { openDB } from 'idb';
import { cacheAlert, getCachedAlerts, getCachedMonitoringAlerts, keepSyncResponse, queueSyncAction } from '@/lib/client-db';
import { localAlertEngine } from '@/lib/local-alert-engine';
import { syncPendingActions } from '@/lib/sync-service';
require('fake-indexeddb/auto');
// These integration scenarios serialize hundreds of real IndexedDB transactions.
jest.setTimeout(60000);
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
  await localAlertEngine.whenSaved();
  const db = await openDB('safeos-guardian');
  expect(await db.count('alert_cache')).toBe(500);
  db.close();
});
it('updates a stored alert from an acknowledgement response and never creates one', async () => {
  localStorage.setItem('safeos_backend_config', JSON.stringify({ apiUrl: 'https://api.example.test' }));
  for (let i = 0; i < 500; i++) await cacheAlert({ id: `engine-${i}`, acknowledged: true, createdAt: new Date().toISOString() });
  const rows = [
    { id: 'synced-current', thumbnail_url: 'data:image/png;base64,server', stream_id: 'camera', acknowledged: 1, created_at: new Date().toISOString() },
    { id: 'synced-older', stream_id: 'camera', acknowledged: 1, created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() },
  ];
  global.fetch = jest.fn().mockImplementation(async (url: string) => ({ ok: true, json: async () => ({
    alert: rows.find(row => url.includes(row.id)),
  }) }));
  await cacheAlert({ id: 'synced-current', streamId: 'camera', acknowledged: false, createdAt: rows[0].created_at });
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
  await cacheAlert({ id: 'monitor-synced', monitoring: true, streamId: 'camera',
    message: 'Motion', createdAt, acknowledged: false, thumbnailUrl: 'data:image/png;base64,example' });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ alert: {
    id: 'monitor-synced', stream_id: 'camera', created_at: createdAt, acknowledged: 1,
  } }) });
  await queueSyncAction({ action: 'acknowledge_alert', endpoint: '/api/alerts/monitor-synced/acknowledge', method: 'POST', body: null });
  expect(await syncPendingActions()).toEqual({ synced: 1, failed: 0, pending: 0 });
  expect(await getCachedMonitoringAlerts()).toEqual([expect.objectContaining({
    id: 'monitor-synced', acknowledged: true, createdAt,
    thumbnailUrl: 'data:image/png;base64,example',
  })]);
});

it('keeps a confirmed acknowledgement queued while the browser cannot save it, and applies it at the next sync', async () => {
  localStorage.setItem('safeos_backend_config', JSON.stringify({ apiUrl: 'https://api.example.test' }));
  const createdAt = new Date().toISOString();
  await cacheAlert({ id: 'confirmed', streamId: 'camera', message: 'Motion', createdAt, acknowledged: false });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ alert: {
    id: 'confirmed', stream_id: 'camera', created_at: createdAt, acknowledged: 1,
  } }) });
  await queueSyncAction({ action: 'acknowledge_alert', endpoint: '/api/alerts/confirmed/acknowledge', method: 'POST', body: null });
  // The next record write fails, as a full disk refuses it.
  const failing = jest.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
    throw new DOMException('Storage full', 'QuotaExceededError');
  });
  await syncPendingActions();
  failing.mockRestore();
  const db = await openDB('safeos-guardian');
  try {
    // A confirmed change the browser could not save is not a failed try.
    const queued = await db.getAll('sync_queue');
    expect(queued).toEqual([expect.objectContaining({ endpoint: '/api/alerts/confirmed/acknowledge', retries: 0 })]);
    expect(queued[0].lastError).toEqual(expect.any(String));
    expect(await db.get('alert_cache', 'confirmed')).toMatchObject({ acknowledged: false });
    expect(await syncPendingActions()).toEqual({ synced: 1, failed: 0, pending: 0 });
    // The next sync applies the server's kept answer and sends nothing again.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(await db.get('alert_cache', 'confirmed')).toMatchObject({ acknowledged: true, createdAt });
    expect(await db.count('sync_queue')).toBe(0);
  } finally {
    db.close();
  }
});

it('applies a confirmed acknowledgement at the next sync when its record update failed at the last try', async () => {
  localStorage.setItem('safeos_backend_config', JSON.stringify({ apiUrl: 'https://api.example.test' }));
  const createdAt = new Date().toISOString();
  await cacheAlert({ id: 'last-try', streamId: 'camera', message: 'Motion', createdAt, acknowledged: false });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ alert: {
    id: 'last-try', stream_id: 'camera', created_at: createdAt, acknowledged: 1,
  } }) });
  const db = await openDB('safeos-guardian');
  try {
    // Four earlier tries failed; the fifth reaches the server.
    await db.put('sync_queue', { id: 'sync-last-try', action: 'acknowledge_alert', endpoint: '/api/alerts/last-try/acknowledge',
      method: 'POST', body: null, createdAt, retries: 4, lastError: '503: Service Unavailable' });
    // The record write after the server's answer fails once, as a full disk refuses it.
    const failing = jest.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    });
    expect(await syncPendingActions()).toEqual({ synced: 0, failed: 1, pending: 1 });
    failing.mockRestore();
    expect(await db.get('alert_cache', 'last-try')).toMatchObject({ acknowledged: false });
    expect(await syncPendingActions()).toEqual({ synced: 1, failed: 0, pending: 0 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(await db.get('alert_cache', 'last-try')).toMatchObject({ acknowledged: true, createdAt });
    expect(await db.count('sync_queue')).toBe(0);
  } finally {
    db.close();
  }
});

it('applies a kept acknowledgement at the next sync while the browser is offline, and sends nothing', async () => {
  localStorage.setItem('safeos_backend_config', JSON.stringify({ apiUrl: 'https://api.example.test' }));
  // A fresh sync service, so going offline here leaves the other cases online.
  jest.resetModules();
  const client = await import('@/lib/client-db');
  const sync = await import('@/lib/sync-service');
  const createdAt = new Date().toISOString();
  await client.cacheAlert({ id: 'offline-kept', streamId: 'camera', message: 'Motion', createdAt, acknowledged: false });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ alert: {
    id: 'offline-kept', stream_id: 'camera', created_at: createdAt, acknowledged: 1,
  } }) });
  await client.queueSyncAction({ action: 'acknowledge_alert', endpoint: '/api/alerts/offline-kept/acknowledge', method: 'POST', body: null });
  sync.initSyncService();
  const db = await openDB('safeos-guardian');
  try {
    // The server confirms; the record write after its answer fails once, as a full disk refuses it.
    const failing = jest.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    });
    expect(await sync.syncPendingActions()).toEqual({ synced: 0, failed: 1, pending: 1 });
    failing.mockRestore();
    // The browser goes offline, and storage works again.
    jest.spyOn(Navigator.prototype, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    // The kept answer needs no server: the next pass applies it.
    expect(await sync.syncPendingActions()).toMatchObject({ synced: 1, failed: 0 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(await db.get('alert_cache', 'offline-kept')).toMatchObject({ acknowledged: true, createdAt });
    expect(await db.count('sync_queue')).toBe(0);
  } finally {
    sync.cleanupSyncService();
    db.close();
  }
});

it('does not write a queued action back when another tab clears local data while its kept answer is saved', async () => {
  await queueSyncAction({ action: 'acknowledge_alert', endpoint: '/api/alerts/cleared/acknowledge', method: 'POST', body: null });
  const db = await openDB('safeos-guardian');
  try {
    const [queued] = await db.getAll('sync_queue');
    // Another tab, with its database already open.
    jest.resetModules();
    const other = await import('@/lib/client-db');
    await other.getPendingSyncActions();
    // The other tab starts Clear All Local Data while this tab reads the queued action.
    let clearing: Promise<void> | undefined;
    const get = IDBObjectStore.prototype.get;
    jest.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<typeof get>) {
      if (this.name === 'sync_queue' && !clearing) clearing = other.clearClientData();
      return get.apply(this, args);
    });
    const kept = keepSyncResponse(queued.id, { alert: { id: 'cleared', acknowledged: 1 } },
      'The server confirmed the change, and the browser could not save it');
    await Promise.allSettled([kept]);
    expect(clearing).toBeDefined();
    await Promise.allSettled([clearing]);
    // The clear empties the queue, and the kept answer is not written back after it.
    expect(await db.count('sync_queue')).toBe(0);
  } finally {
    db.close();
  }
});
