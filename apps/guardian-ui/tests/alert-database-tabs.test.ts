/** @jest-environment jsdom */
import { openDB } from 'idb';
import { IDBFactory } from 'fake-indexeddb';
require('fake-indexeddb/auto');
Object.defineProperty(global, 'structuredClone', { configurable: true, value: (value: unknown) =>
  require('v8').deserialize(require('v8').serialize(value)),
});
beforeEach(() => {
  jest.resetModules();
  global.indexedDB = new IDBFactory();
});
it('closes an open connection for a newer version and asks this tab to reload', async () => {
  const { getCachedAlerts } = await import('@/lib/client-db');
  await getCachedAlerts();
  const observer = await openDB('safeos-guardian');
  const version = observer.version;
  observer.close();
  const notice = jest.fn();
  window.addEventListener('safeos:database-status', notice);
  const newer = openDB('safeos-guardian', version + 1);
  const result = await Promise.race([newer, new Promise<null>(resolve => setTimeout(() => resolve(null), 500))]);
  expect(result).not.toBeNull();
  expect(notice).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.stringMatching(/reload/i) }));
  result?.close();
  window.removeEventListener('safeos:database-status', notice);
});
it('reports a blocked upgrade and settles the opener instead of waiting forever', async () => {
  const old = await openDB('safeos-guardian', 4);
  const notice = jest.fn();
  window.addEventListener('safeos:database-status', notice);
  const { getCachedAlerts } = await import('@/lib/client-db');
  try {
    const result = await Promise.race([getCachedAlerts(), new Promise<string>(resolve => setTimeout(() => resolve('still waiting'), 500))]);
    expect(notice).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.stringMatching(/close.*other SafeOS tabs/i) }));
    expect(result).not.toBe('still waiting');
  } finally {
    old.close();
    window.removeEventListener('safeos:database-status', notice);
  }
});
