/** @jest-environment jsdom */
/**
 * A device out of room
 *
 * When the browser's storage for the site is full, a save of an alert or a
 * picture fails. SafeOS notes it once for the visit so the dashboard can say
 * so; nothing throws, and the alert goes on. Any other failure notes nothing.
 */

import { serialize, deserialize } from 'v8';
import 'fake-indexeddb/auto';
import {
  forgetStorageFull, guardedStorage, isStorageFull, noteStorageFull, onStorageFull, storageIsFull,
} from '@/lib/storage-full';
import { forgetVisit } from '@/lib/visit-store';
import { cacheAlert, getAllMatchFrames, saveIntrusionFrame, saveMatchFrame } from '@/lib/client-db';
import { useAnimalAlertStore } from '@/stores/animal-alert-store';

// jsdom does not expose Node's structuredClone. Clone at the IndexedDB edge.
Object.assign(globalThis, { structuredClone: (value: unknown) => deserialize(serialize(value)) });

const full = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError');

beforeEach(() => {
  localStorage.clear();
  forgetVisit();
  forgetStorageFull();
  useAnimalAlertStore.setState({ detectionHistory: [], currentDetections: [] });
});

afterEach(() => {
  jest.restoreAllMocks();
});

it("knows the browser's full-storage error by its name", () => {
  expect(isStorageFull(full())).toBe(true);
  expect(isStorageFull({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
  expect(isStorageFull(new Error('x'))).toBe(false);
  expect(isStorageFull(undefined)).toBe(false);
  expect(isStorageFull(new DOMException('stopped', 'AbortError'))).toBe(false);
});

it('notes a full storage once and tells its listeners', () => {
  const listener = jest.fn();
  const off = onStorageFull(listener);

  noteStorageFull(full());
  noteStorageFull(full());
  expect(listener).toHaveBeenCalledTimes(1);
  expect(storageIsFull()).toBe(true);

  forgetStorageFull();
  noteStorageFull(new Error('x'));
  noteStorageFull(new DOMException('stopped', 'AbortError'));
  expect(storageIsFull()).toBe(false);
  expect(listener).toHaveBeenCalledTimes(1);

  off();
  noteStorageFull(full());
  expect(listener).toHaveBeenCalledTimes(1);
});

it("a store's refused write is noted and does not throw", () => {
  jest.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw full();
  });

  expect(() => guardedStorage.setItem('k', 'v')).not.toThrow();
  expect(storageIsFull()).toBe(true);
});

it('a Wildlife sighting is kept for the visit and its alert goes on when storage is full', () => {
  jest.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw full();
  });
  const sighting = {
    id: 'animal-1', type: 'bird' as const, displayName: 'Bird', sizeCategory: 'small' as const, dangerLevel: 'none' as const,
    confidence: 0.9, bbox: [0, 0, 10, 10] as [number, number, number, number], timestamp: Date.now(),
  };

  expect(() => useAnimalAlertStore.getState().addDetections([sighting])).not.toThrow();
  expect(useAnimalAlertStore.getState().detectionHistory.map((entry) => entry.id)).toEqual(['animal-1']);
  expect(storageIsFull()).toBe(true);
});

it('a save the database refuses for lack of room is noted', async () => {
  // The database is made before the refusal, as on a device that has used SafeOS.
  await getAllMatchFrames();
  jest.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
    throw full();
  });
  const at = Date.now();

  await expect(saveMatchFrame({
    id: 'match-1', subjectId: 'mittens', frameData: 'frame', thumbnailData: 'thumb', confidence: 80, timestamp: at,
    details: { colorMatch: 80, dominantMatch: 80, edgeMatch: 80, sizeMatch: 80 }, region: null,
    acknowledged: false, notes: '', exported: false, alerted: true,
  })).resolves.toBeUndefined();
  expect(storageIsFull()).toBe(true);

  forgetStorageFull();
  await expect(saveIntrusionFrame({
    id: 'intrusion-1', frameData: 'frame', thumbnailData: 'thumb', timestamp: at, personCount: 1, allowedCount: 0,
    detections: [], acknowledged: false, notes: '', exported: false,
  })).resolves.toBeUndefined();
  expect(storageIsFull()).toBe(true);

  forgetStorageFull();
  await expect(cacheAlert({
    id: `motion-${at}-full`, monitoring: true, streamId: 'local', severity: 'low', message: 'Motion detected',
    acknowledged: false, createdAt: new Date(at).toISOString(),
  })).resolves.toBe(false);
  expect(storageIsFull()).toBe(true);
});
