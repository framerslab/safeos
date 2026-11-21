/** @jest-environment jsdom */
/**
 * The saved alerts on a browser that refuses storage
 *
 * Every app page reads the alerts saved on this device into its list. A
 * browser can refuse this site's storage on every call; the read then holds
 * the list for the visit and ends with no error, so the page raises none.
 */

import { useMonitoringStore } from '@/stores/monitoring-store';

require('fake-indexeddb/auto');
jest.setTimeout(30000);
Object.defineProperty(global, 'structuredClone', { configurable: true, value: (value: unknown) =>
  require('v8').deserialize(require('v8').serialize(value)),
});

const refuse = () => {
  throw new DOMException('denied', 'SecurityError');
};

let refusals: jest.SpyInstance[] = [];

// tests/setup.ts gives the page a storage object of its own, which is not a
// Storage, so the refusal is put on that object.
beforeEach(() => {
  refusals = [
    jest.spyOn(localStorage, 'getItem').mockImplementation(refuse),
    jest.spyOn(localStorage, 'setItem').mockImplementation(refuse),
    jest.spyOn(localStorage, 'removeItem').mockImplementation(refuse),
  ];
});

afterEach(() => {
  for (const refusal of refusals) refusal.mockRestore();
});

it('reads the saved alerts with no error when the browser refuses its storage', async () => {
  expect(() => localStorage.setItem('safeos-monitoring', '{}')).toThrow();

  // A refused write that reaches the page rejects this read.
  await expect(useMonitoringStore.getState().hydrateAlerts()).resolves.toBeUndefined();
  expect(useMonitoringStore.getState().alerts).toEqual([]);
});
