/** @jest-environment jsdom */
/**
 * A Lost and Found picture deleted while the frame limit is making room
 * stays deleted. The limit reads the frames it keeps and marks in the same
 * write that removes the oldest, so a picture deleted before that write is
 * neither kept nor written back.
 */

import { openDB, type IDBPDatabase } from 'idb';
import { getAllMatchFrames, saveMatchFrame, type MatchFrameDB } from '@/lib/client-db';

require('fake-indexeddb/auto');
jest.setTimeout(60000);
// The test browser has no structuredClone, which the database needs to keep a record.
Object.defineProperty(global, 'structuredClone', { configurable: true, value: (value: unknown) =>
  require('v8').deserialize(require('v8').serialize(value)),
});

// The limit reads the alert threshold from the Lost and Found settings; the
// person deletes a picture at that moment.
let whileTheLimitWaits: (() => void) | null = null;
jest.mock('@/stores/lost-found-store', () => ({
  useLostFoundStore: {
    getState: () => {
      whileTheLimitWaits?.();
      return { settings: { minConfidenceForAlert: 70 } };
    },
  },
}));

const match = (id: string, timestamp: number, acknowledged: boolean): MatchFrameDB => ({
  id, subjectId: 'pet-1', frameData: 'frame', thumbnailData: 'thumb', confidence: 80, timestamp,
  details: { colorMatch: 80, dominantMatch: 80, edgeMatch: 80, sizeMatch: 80 },
  region: null, acknowledged, notes: '', exported: false,
});

it('does not bring back a picture deleted while the limit makes room', async () => {
  await getAllMatchFrames();
  const database: IDBPDatabase = await openDB('safeos-guardian');
  try {
    const tx = database.transaction('match_frame', 'readwrite');
    // One seen frame at the start of a run, so the limit marks the next one, run-1.
    for (let i = 0; i < 500; i++) void tx.store.put(match(`run-${i}`, 1_000_000 + i * 1000, i === 0));
    await tx.done;

    let deleted: Promise<unknown> | undefined;
    whileTheLimitWaits = () => {
      whileTheLimitWaits = null;
      deleted = database.delete('match_frame', 'run-1');
    };
    await saveMatchFrame(match('run-500', 1_000_000 + 500 * 1000, false));
    await deleted;

    const ids = (await getAllMatchFrames()).map((frame) => frame.id);
    expect(deleted).toBeDefined();
    expect(ids).not.toContain('run-0');
    expect(ids).not.toContain('run-1');
    expect(ids).toContain('run-500');
  } finally {
    whileTheLimitWaits = null;
    database.close();
  }
});
