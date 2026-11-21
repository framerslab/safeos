/** @jest-environment jsdom */
/**
 * A failed read of one alert store
 *
 * The device's alerts are read from four stores. A read that fails is not an
 * empty store: the read as a whole fails, so the alerts keep their last
 * reading, or say they could not be read, instead of showing none new.
 */

import { readSavedRecords } from '@/lib/device-alerts';
import { getCachedMonitoringAlerts } from '@/lib/client-db';

require('fake-indexeddb/auto');
// The test browser has no structuredClone, which the database needs to keep a record.
Object.defineProperty(global, 'structuredClone', { configurable: true, value: (value: unknown) =>
  require('v8').deserialize(require('v8').serialize(value)),
});

afterEach(() => jest.restoreAllMocks());

it.each(['match_frame', 'intrusion_frame'])('fails as a whole when the %s read fails', async (store) => {
  await getCachedMonitoringAlerts();
  const read = IDBObjectStore.prototype.getAll;
  jest.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(function (this: IDBObjectStore, ...args: any[]) {
    if (this.name === store) throw new DOMException('The read failed.', 'UnknownError');
    return read.apply(this, args as []);
  });

  await expect(readSavedRecords()).rejects.toThrow();
});

it('reads empty stores as empty', async () => {
  const records = await readSavedRecords();
  expect(records.matchFrames).toEqual([]);
  expect(records.intrusionFrames).toEqual([]);
});
