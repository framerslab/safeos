/** @jest-environment jsdom */
import { IDBFactory } from 'fake-indexeddb';
require('fake-indexeddb/auto');
jest.setTimeout(60000);
Object.defineProperty(global, 'structuredClone', { configurable: true, value: (value: unknown) =>
  require('v8').deserialize(require('v8').serialize(value)),
});
beforeEach(() => {
  jest.resetModules();
  global.indexedDB = new IDBFactory();
  localStorage.clear();
});
afterEach(() => jest.restoreAllMocks());

it('keeps both records of two alerts raised in the same millisecond', async () => {
  const { newAlertId } = await import('@/lib/alert-id');
  const { useMonitoringStore: monitoring } = await import('@/stores/monitoring-store');
  const at = Date.parse('2026-11-12T10:00:00.000Z');
  jest.spyOn(Date, 'now').mockReturnValue(at);
  const first = newAlertId('motion');
  const second = newAlertId('motion');
  expect(first).not.toBe(second);
  for (const id of [first, second]) expect(id.startsWith(`motion-${at}-`)).toBe(true);
  for (const id of [first, second]) monitoring.getState().addAlert({ id, streamId: 'camera', severity: 'low', message: id, acknowledged: false });
  await monitoring.getState().hydrateAlerts();
  expect(monitoring.getState().alerts.map((alert) => alert.id).sort()).toEqual([first, second].sort());
});
