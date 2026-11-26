/** @jest-environment jsdom */
/**
 * Frames the limit removes, in every tab
 *
 * At the limit, the oldest seen pictures go first. People's library also
 * removes its oldest unseen pictures if it has more than 100. Tabs hear of
 * the removal after it finishes.
 */

import { openDB } from 'idb';
import { groupAlerts } from '@/lib/alert-groups';
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

/** Empties a store, so a case starts from its own frames. */
async function empty(store: 'match_frame' | 'intrusion_frame') {
  const database = await openDB('safeos-guardian');
  await database.clear(store);
  database.close();
}

// One alert is a run of frames less than 30 seconds apart. Marking it seen
// marks the frames it holds then; frames saved after join the run unmarked.
// Removing the run's marked frames must not make the alert new again.
it('keeps a Lost and Found alert seen when the limit removes the only frame of its run marked as seen', async () => {
  await getAllMatchFrames();
  await empty('match_frame');
  await fill('match_frame', Array.from({ length: 500 }, (_, i) => match(`run-${i}`, 1_000_000 + i * 1000, i === 0)));

  await saveMatchFrame(match('run-500', 1_000_000 + 500 * 1000, false));

  const frames = await getAllMatchFrames();
  expect(frames).toHaveLength(500);
  expect(frames.map((frame) => frame.id)).not.toContain('run-0');
  expect(frames.find((frame) => frame.id === 'run-1')?.acknowledged).toBe(true);
});

// A frame under the alert threshold is saved too (`alerted: false`) and is no
// part of an alert, so the seen mark never moves onto it.
it('keeps a Lost and Found alert seen when the first frame the limit keeps of its run raised no alert', async () => {
  await getAllMatchFrames();
  await empty('match_frame');
  await fill('match_frame', Array.from({ length: 500 }, (_, i) => ({
    ...match(`mixed-${i}`, 1_000_000 + i * 1000, i === 0),
    ...(i === 1 ? { confidence: 60, alerted: false } : { alerted: true }),
  })));

  await saveMatchFrame({ ...match('mixed-500', 1_000_000 + 500 * 1000, false), alerted: true });

  const frames = await getAllMatchFrames();
  expect(frames.map((frame) => frame.id)).not.toContain('mixed-0');
  const alerts = groupAlerts({
    alerts: [], intrusionFrames: [], sightings: [], matchFrames: frames, alertThreshold: 70,
    subjects: [{
      id: 'pet-1', name: 'Mittens', type: 'pet', description: '', fingerprint: null, referenceImages: [],
      createdAt: '2026-01-01T00:00:00.000Z', lastActiveAt: null, matchCount: 0,
    }],
  });
  expect(alerts.filter((alert) => alert.way === 'lost-found').map((alert) => alert.seen)).toEqual([true]);
});

it("keeps a People's alert seen when the limit removes the only frame of its run marked as seen", async () => {
  await getAllIntrusionFrames();
  await empty('intrusion_frame');
  await fill('intrusion_frame', Array.from({ length: 100 }, (_, i) => person(`people-${i}`, 1_000_000 + i * 1000, i === 0)));

  await saveIntrusionFrame(person('people-100', 1_000_000 + 100 * 1000, false));

  const frames = await getAllIntrusionFrames();
  expect(frames).toHaveLength(100);
  expect(frames.map((frame) => frame.id)).not.toContain('people-0');
  expect(frames.find((frame) => frame.id === 'people-1')?.acknowledged).toBe(true);
});

it('keeps the newest 100 of 130 unseen People pictures', async () => {
  await getAllIntrusionFrames();
  await empty('intrusion_frame');
  await fill('intrusion_frame', Array.from({ length: 129 }, (_, i) => person(`unseen-${i}`, i + 1000, false)));

  await saveIntrusionFrame(person('unseen-129', 1129, false));

  // The save itself keeps 100; the read below would trim the store too.
  const database = await openDB('safeos-guardian');
  try {
    expect((await database.getAllKeys('intrusion_frame')).sort()).toEqual(
      Array.from({ length: 100 }, (_, i) => `unseen-${30 + i}`).sort(),
    );
  } finally {
    database.close();
  }

  const kept = await getAllIntrusionFrames();
  expect(kept).toHaveLength(100);
  expect(kept.map((frame) => frame.id)).toEqual(Array.from({ length: 100 }, (_, i) => `unseen-${129 - i}`));
  expect(kept.every((frame) => !frame.acknowledged)).toBe(true);
});

it('repairs a People picture store already over its limit when the pictures are opened', async () => {
  await getAllIntrusionFrames();
  await empty('intrusion_frame');
  await fill('intrusion_frame', Array.from({ length: 130 }, (_, i) => (
    person(`older-${i}`, i * 60_000, i === 129)
  )));

  const kept = await getAllIntrusionFrames();

  expect(kept).toHaveLength(100);
  expect(kept[0]?.id).toBe('older-128');
  expect(kept[99]?.id).toBe('older-29');
  const database = await openDB('safeos-guardian');
  try {
    expect(await database.count('intrusion_frame')).toBe(100);
  } finally {
    database.close();
  }
});

// Removing a seen frame from the middle of a run can leave a gap over 30
// seconds, which cuts the run in two. Both parts stay seen.
it("keeps both parts of a People's seen alert seen when the limit removes the frame between them", async () => {
  await getAllIntrusionFrames();
  await empty('intrusion_frame');
  await fill('intrusion_frame', Array.from({ length: 100 }, (_, i) => person(`split-${i}`, 1_000_000 + i * 20_000, i === 50)));

  await saveIntrusionFrame(person('split-100', 1_000_000 + 100 * 20_000, false));

  const frames = await getAllIntrusionFrames();
  expect(frames.map((frame) => frame.id)).not.toContain('split-50');
  const alerts = groupAlerts({
    alerts: [], intrusionFrames: frames, sightings: [], matchFrames: [], alertThreshold: 70, subjects: [],
  });
  expect(alerts.filter((alert) => alert.way === 'security').map((alert) => alert.seen)).toEqual([true, true]);
});
