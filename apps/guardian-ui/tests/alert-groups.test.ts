/** @jest-environment node */
/**
 * What one alert is, and what is new
 *
 * A Motion and sound record is one alert. The other three ways save a frame
 * at every check while something stays in view, so for them one alert is one
 * run of frames: frames of one way, for one pet or one kind of animal, with no
 * gap longer than 30 seconds. A Lost and Found frame that did not raise the
 * alert is a recording and never part of an alert, and nothing a person is
 * matched to is ever an alert here. An alert is seen once any of its records
 * is marked; what is new is an alert not seen, none of whose records the
 * device held unseen when this code first ran. No clock time decides it.
 */

import { RUN_GAP_MS, alertLine, groupAlerts, onlyNew, recordTime, unseenIds, type SavedRecords } from '@/lib/alert-groups';
import type { IntrusionFrameDB, MatchFrameDB, SubjectProfileDB } from '@/lib/client-db';
import type { DetectionHistoryEntry } from '@/stores/animal-alert-store';

const iso = (at: number) => new Date(at).toISOString();

const motion = (id: string, at: number, seen = false): SavedRecords['alerts'][number] => ({
  id, message: 'Motion detected: 60% (threshold: 40%)', acknowledged: seen, createdAt: iso(at), timestamp: iso(at),
});

const frame = (
  id: string, pet: string, at: number,
  { confidence = 80, alerted, seen = false }: { confidence?: number; alerted?: boolean; seen?: boolean } = {},
): MatchFrameDB => ({
  id, subjectId: pet, frameData: `frame:${id}`, thumbnailData: `thumb:${id}`, confidence, timestamp: at,
  details: { colorMatch: confidence, dominantMatch: confidence, edgeMatch: confidence, sizeMatch: confidence },
  region: null, acknowledged: seen, notes: '', exported: false,
  ...(alerted === undefined ? {} : { alerted }),
});

const person = (id: string, at: number, count = 1, seen = false): IntrusionFrameDB => ({
  id, frameData: `frame:${id}`, thumbnailData: `thumb:${id}`, timestamp: at, personCount: count, allowedCount: 0,
  detections: [], acknowledged: seen, notes: '', exported: false,
});

const sighting = (id: string, at: number, animal = 'bird', seen = false): DetectionHistoryEntry => ({
  id, type: animal as DetectionHistoryEntry['type'], displayName: animal, sizeCategory: 'small', dangerLevel: 'none',
  confidence: 0.9, bbox: [0, 0, 10, 10], timestamp: at, frameData: `sight:${id}`, acknowledged: seen, notes: '', exported: false,
});

const pet = (id: string, name: string, type: SubjectProfileDB['type'] = 'pet'): SubjectProfileDB => ({
  id, name, type, description: '', fingerprint: {}, referenceImages: [], createdAt: iso(0), lastActiveAt: null, matchCount: 0,
});

const records = (partial: Partial<SavedRecords>): SavedRecords => ({
  alerts: [], matchFrames: [], intrusionFrames: [], sightings: [], subjects: [], alertThreshold: 70, ...partial,
});

it('counts each Motion and sound record as one alert and names it by its kind', () => {
  const alerts = groupAlerts(records({
    alerts: [
      motion('motion-1-a', 1000),
      motion('pixel-2-b', 2000),
      motion('audio-3-c', 3000),
      { ...motion('inactivity-4-d', 4000), message: 'Inactivity: no motion detected for 10 minutes' },
      { ...motion('inactivity-5-e', 5000), message: 'Inactivity: no motion detected for 1 minute' },
      motion('test-6-f', 6000),
    ],
  }));

  expect(alerts.map((alert) => alert.what)).toEqual([
    'Alert', 'No movement for 1 minute', 'No movement for 10 minutes', 'Sound', 'Movement', 'Movement',
  ]);
  expect(alerts.map((alert) => alert.id)).toEqual(['test-6-f', 'inactivity-5-e', 'inactivity-4-d', 'audio-3-c', 'pixel-2-b', 'motion-1-a']);
  for (const alert of alerts) {
    expect(alert.way).toBe('monitor');
    expect(alert.recordIds).toEqual([alert.id]);
    expect(alert.picture).toBeUndefined();
  }
});

it('joins frames of one way into one alert while no gap is longer than 30 seconds', () => {
  const alerts = groupAlerts(records({
    intrusionFrames: [person('p1', 0, 2), person('p2', 5000), person('p3', 10_000), person('p4', 50_000)],
  }));

  expect(alerts).toHaveLength(2);
  const [newer, older] = alerts;
  expect(older.recordIds).toEqual(['p1', 'p2', 'p3']);
  expect(older.at).toBe(0);
  expect(older.picture).toBe('thumb:p1');
  expect(older.what).toBe('2 people in view');
  expect(older.way).toBe('security');
  expect(newer.what).toBe('1 person in view');
  expect(newer.recordIds).toEqual(['p4']);

  expect(RUN_GAP_MS).toBe(30_000);
  expect(groupAlerts(records({ intrusionFrames: [person('a', 0), person('b', 30_000)] }))).toHaveLength(1);
  expect(groupAlerts(records({ intrusionFrames: [person('a', 0), person('b', 30_001)] }))).toHaveLength(2);
});

it("keeps one pet's frames and one kind of animal apart", () => {
  const pets = groupAlerts(records({
    subjects: [pet('a', 'Mittens'), pet('b', 'Rex')],
    matchFrames: [0, 1, 2, 3, 4, 5].map((i) => frame(`f${i}`, i % 2 === 0 ? 'a' : 'b', i * 1000, { alerted: true })),
  }));
  expect(pets).toHaveLength(2);
  expect(pets.map((alert) => alert.what).sort()).toEqual(['Colours like Mittens’s', 'Colours like Rex’s']);
  expect(pets.every((alert) => alert.way === 'lost-found')).toBe(true);

  const animals = groupAlerts(records({
    sightings: [0, 1, 2, 3, 4, 5].map((i) => sighting(`s${i}`, i * 1000, i % 2 === 0 ? 'bird' : 'elephant')),
  }));
  expect(animals).toHaveLength(2);
  expect(animals.map((alert) => alert.what).sort()).toEqual(['Looks like a bird', 'Looks like an elephant']);
  expect(animals.every((alert) => alert.way === 'wildlife')).toBe(true);

  const unknown = groupAlerts(records({ sightings: [sighting('u', 0, 'unknown_animal')] }));
  expect(unknown.map((alert) => alert.what)).toEqual(['Looks like an animal']);
  expect(unknown[0].picture).toBe('sight:u');
});

it('a Lost and Found frame that did not raise the alert is no alert and joins no run', () => {
  const subjects = [pet('a', 'Mittens')];
  const alerts = groupAlerts(records({
    subjects,
    matchFrames: [frame('f1', 'a', 0, { alerted: true }), frame('f2', 'a', 10_000, { alerted: false }), frame('f3', 'a', 20_000, { alerted: true })],
  }));
  expect(alerts).toHaveLength(1);
  expect(alerts[0].recordIds).toEqual(['f1', 'f3']);

  // A recording between two alerted frames does not join them into one run.
  const bridged = groupAlerts(records({
    subjects,
    matchFrames: [frame('f1', 'a', 0, { alerted: true }), frame('f2', 'a', 25_000, { alerted: false }), frame('f3', 'a', 50_000, { alerted: true })],
  }));
  expect(bridged.map((alert) => alert.recordIds)).toEqual([['f3'], ['f1']]);

  expect(groupAlerts(records({
    subjects,
    matchFrames: [0, 1, 2].map((i) => frame(`f${i}`, 'a', i * 1000, { alerted: false })),
  }))).toEqual([]);
});

it('judges a frame saved before the field by the alert threshold as it is set now', () => {
  const saved = { subjects: [pet('a', 'Mittens')], matchFrames: [frame('f1', 'a', 0), frame('f2', 'a', 2000)] };

  expect(groupAlerts(records({ ...saved, alertThreshold: 95 }))).toEqual([]);
  const alerts = groupAlerts(records({ ...saved, alertThreshold: 70 }));
  expect(alerts.map((alert) => alert.what)).toEqual(['Colours like Mittens’s']);
  expect(alerts[0].recordIds).toEqual(['f1', 'f2']);
  expect(alerts[0].picture).toBe('thumb:f1');
});

it('never names or pictures a person, or a pet that is not saved', () => {
  const sam = groupAlerts(records({
    subjects: [pet('sam', 'Sam', 'person')],
    matchFrames: [frame('f1', 'sam', 0, { alerted: true }), frame('f2', 'sam', 1000, { alerted: true })],
  }));
  expect(sam).toEqual([]);
  expect(JSON.stringify(sam)).not.toContain('Sam');

  expect(groupAlerts(records({
    subjects: [pet('a', 'Mittens')],
    matchFrames: [frame('f1', 'gone', 0, { alerted: true })],
  }))).toEqual([]);

  const keys = groupAlerts(records({
    subjects: [pet('k', 'Keys', 'other')],
    matchFrames: [frame('f1', 'k', 0, { alerted: true })],
  }));
  expect(keys.map((alert) => alert.what)).toEqual(['Colours like Keys’s']);
});

it('an alert is seen once any of its records is marked', () => {
  const alerts = groupAlerts(records({
    intrusionFrames: [person('p1', 0), person('p2', 5000, 1, true), person('p3', 10_000)],
  }));
  expect(alerts).toHaveLength(1);
  expect(alerts[0].seen).toBe(true);
});

it('what is new is not seen, and held no record unseen at the first run', () => {
  const alerts = groupAlerts(records({
    alerts: [motion('motion-1-seen', 1000, true), motion('held-1', 2000), motion('motion-3-new', 3000)],
  }));
  expect(alerts).toHaveLength(3);

  expect(onlyNew(alerts, new Set(['held-1'])).map((alert) => alert.id)).toEqual(['motion-3-new']);
});

it('no clock time decides what is new', () => {
  const hour = 60 * 60 * 1000;
  const base = Date.parse('2026-11-01T12:00:00Z');
  for (const offset of [-hour, hour]) {
    const alerts = groupAlerts(records({
      alerts: [motion('motion-seen', base, true), motion('motion-a', base + offset), motion('motion-b', base + offset + 1000)],
    }));
    expect(onlyNew(alerts, new Set()).map((alert) => alert.id).sort()).toEqual(['motion-a', 'motion-b']);
  }
});

it('frames that join a run after it was marked stay inside a seen alert', () => {
  const marked = groupAlerts(records({
    intrusionFrames: [person('p1', 0, 1, true), person('p2', 5000), person('p3', 10_000)],
  }));
  expect(marked).toHaveLength(1);
  expect(marked[0].seen).toBe(true);
  expect(onlyNew(marked, new Set())).toEqual([]);

  const later = groupAlerts(records({
    intrusionFrames: [person('p1', 0, 1, true), person('p2', 5000), person('p3', 10_000), person('p4', 50_000)],
  }));
  expect(later).toHaveLength(2);
  expect(later[0].recordIds).toEqual(['p4']);
  expect(later[0].seen).toBe(false);
  expect(onlyNew(later, new Set()).map((alert) => alert.id)).toEqual(['p4']);
});

it("writes an alert's line with its time", () => {
  const [alert] = groupAlerts(records({ alerts: [motion('motion-1-a', 1000)] }));
  expect(alertLine(alert, () => '14:05')).toBe('Movement at 14:05');
});

it("takes an alert's time from its id when its dates do not parse, and keeps an alert with no time out of what is new", () => {
  const dated = { id: 'motion-1731600000000-abc', message: 'Motion detected', acknowledged: false, createdAt: 'not a date' };
  const undated = { id: 'server-x-y', message: 'From the server', acknowledged: false };
  const saved = records({ alerts: [undated, dated, motion('motion-2-b', 1000)] });

  let alerts: ReturnType<typeof groupAlerts> = [];
  expect(() => { alerts = groupAlerts(saved); }).not.toThrow();
  expect(alerts.find((alert) => alert.id === dated.id)?.at).toBe(1731600000000);
  expect(alerts[alerts.length - 1].id).toBe('server-x-y');

  let fresh: ReturnType<typeof onlyNew> = [];
  expect(() => { fresh = onlyNew(alerts, new Set()); }).not.toThrow();
  expect(fresh.map((alert) => alert.id)).toEqual([dated.id, 'motion-2-b']);

  expect(recordTime(dated)).toBe(1731600000000);
  expect(recordTime(undated)).toBeNull();
  expect(recordTime({ id: 'server-x-y', createdAt: 'nor this', timestamp: Number.NaN })).toBeNull();
});

it('lists every record not marked as seen, of all four stores', () => {
  const ids = unseenIds(records({
    subjects: [pet('a', 'Mittens'), pet('sam', 'Sam', 'person')],
    alerts: [motion('motion-open', 0), motion('motion-marked', 1000, true)],
    matchFrames: [
      frame('under-threshold', 'a', 0, { confidence: 40 }),
      frame('of-a-person', 'sam', 1000, { alerted: true }),
      frame('frame-marked', 'a', 2000, { alerted: true, seen: true }),
    ],
    intrusionFrames: [person('people-open', 0), person('people-marked', 1000, 1, true)],
    sightings: [sighting('sighting-open', 0), sighting('sighting-marked', 1000, 'bird', true)],
  }));

  expect([...ids].sort()).toEqual(['motion-open', 'of-a-person', 'people-open', 'sighting-open', 'under-threshold']);
});
