/** @jest-environment jsdom */
/**
 * Mark all as seen on a device out of room
 *
 * Mark all as seen writes every alert it marks in one transaction. A device
 * out of room refuses that write; the dashboard then says the device is out
 * of room, so the alerts that stay unmarked are explained.
 */

import type * as ClientDB from '@/lib/client-db';
import type * as StorageFull from '@/lib/storage-full';

require('fake-indexeddb/auto');
// The test browser has no structuredClone, which the database needs to keep a record.
Object.defineProperty(global, 'structuredClone', { configurable: true, value: (value: unknown) =>
  require('v8').deserialize(require('v8').serialize(value)),
});

let db: typeof ClientDB;
let full: typeof StorageFull;

// Each case starts a visit of its own: the device is not known to be full.
beforeEach(() => {
  jest.resetModules();
  db = require('@/lib/client-db') as typeof ClientDB;
  full = require('@/lib/storage-full') as typeof StorageFull;
});

afterEach(() => jest.restoreAllMocks());

const refuseForRoom = () =>
  jest.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
  });

it('says the device is out of room when it refuses to mark Lost and Found frames as seen', async () => {
  await db.saveMatchFrame({
    id: 'match-1', subjectId: 'pet-1', frameData: 'frame', thumbnailData: 'thumb', confidence: 80, timestamp: 1000,
    details: { colorMatch: 80, dominantMatch: 80, edgeMatch: 80, sizeMatch: 80 },
    region: null, acknowledged: false, notes: '', exported: false,
  });
  expect(full.storageIsFull()).toBe(false);

  refuseForRoom();
  await db.acknowledgeMatchFrames(['match-1']);

  expect(full.storageIsFull()).toBe(true);
});

it("says the device is out of room when it refuses to mark People's frames as seen", async () => {
  await db.saveIntrusionFrame({
    id: 'person-1', frameData: 'frame', thumbnailData: 'thumb', timestamp: 1000, personCount: 1, allowedCount: 0,
    detections: [], acknowledged: false, notes: '', exported: false,
  });
  expect(full.storageIsFull()).toBe(false);

  refuseForRoom();
  await db.acknowledgeIntrusionFrames(['person-1']);

  expect(full.storageIsFull()).toBe(true);
});
