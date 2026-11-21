/** @jest-environment jsdom */
/**
 * Frames the limit removes, in every tab
 *
 * A device keeps up to 500 Lost and Found frames and 100 of People's. A save
 * past the limit removes the oldest frames marked as seen, and the tabs hear
 * of it after the removal, so a tab that reads the frames when it hears does
 * not keep showing the removed ones.
 */

import { openDB } from 'idb';
import {
  getAllIntrusionFrames,
  getAllMatchFrames,
  saveIntrusionFrame,
  saveMatchFrame,
  type IntrusionFrameDB,
  type MatchFrameDB,
} from '@/lib/client-db';
import { onTabMessage } from '@/lib/tab-channel';

require('fake-indexeddb/auto');
jest.setTimeout(60000);
// The test browser has no structuredClone, which the database needs to keep a record.
Object.defineProperty(global, 'structuredClone', { configurable: true, value: (value: unknown) =>
  require('v8').deserialize(require('v8').serialize(value)),
});

const match = (id: string, timestamp: number, acknowledged: boolean): MatchFrameDB => ({
  id, subjectId: 'pet-1', frameData: 'frame', thumbnailData: 'thumb', confidence: 80, timestamp,
  details: { colorMatch: 80, dominantMatch: 80, edgeMatch: 80, sizeMatch: 80 },
  region: null, acknowledged, notes: '', exported: false,
});

const person = (id: string, timestamp: number, acknowledged: boolean): IntrusionFrameDB => ({
  id, frameData: 'frame', thumbnailData: 'thumb', timestamp, personCount: 1, allowedCount: 0,
  detections: [], acknowledged, notes: '', exported: false,
});

/** Puts frames straight into the store, in one write. */
async function fill(store: 'match_frame' | 'intrusion_frame', frames: unknown[]) {
  const database = await openDB('safeos-guardian');
  const tx = database.transaction(store, 'readwrite');
  for (const frame of frames) void tx.store.put(frame);
  await tx.done;
  database.close();
}

/** A tab that reads the frames each time it hears that alerts changed; the ids of its last read. */
function listeningTab<T extends { id: string }>(read: () => Promise<T[]>) {
  const reads: Promise<T[]>[] = [];
  const off = onTabMessage((message) => {
    if (message.type === 'alerts-changed') reads.push(read());
  });
  return {
    off,
    lastRead: async () => {
      const done = await Promise.all(reads);
      return done.length ? done[done.length - 1].map((frame) => frame.id) : null;
    },
  };
}

it('a tab that hears of a Lost and Found frame saved past the limit does not keep the frame it removed', async () => {
  await getAllMatchFrames();
  await fill('match_frame', Array.from({ length: 500 }, (_, i) => match(`match-${i}`, 1000 + i, true)));
  const tab = listeningTab(() => getAllMatchFrames());

  await saveMatchFrame(match('match-new', 9000, false));
  tab.off();

  const ids = await tab.lastRead();
  expect(ids).toContain('match-new');
  expect(ids).not.toContain('match-0');
  expect(ids).toHaveLength(500);
});

it("a tab that hears of a People's frame saved past the limit does not keep the frame it removed", async () => {
  await getAllIntrusionFrames();
  await fill('intrusion_frame', Array.from({ length: 100 }, (_, i) => person(`person-${i}`, 1000 + i, true)));
  const tab = listeningTab(() => getAllIntrusionFrames());

  await saveIntrusionFrame(person('person-new', 9000, false));
  tab.off();

  const ids = await tab.lastRead();
  expect(ids).toContain('person-new');
  expect(ids).not.toContain('person-0');
  expect(ids).toHaveLength(100);
});
