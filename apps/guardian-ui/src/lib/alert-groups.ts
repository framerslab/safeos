/**
 * What one alert is, and what is new
 *
 * Motion and sound saves one record each time it raises an alert, so each
 * record is one alert. The other three ways save a frame at every check while
 * something stays in view, so for them one alert is one run of frames: frames
 * of one way, for one pet or one kind of animal, that follow each other with
 * no gap longer than 30 seconds. A Lost and Found frame that did not raise
 * the alert is a recording History keeps, never an alert or part of one, and
 * nothing matched to a saved person is ever an alert here. The grouping is
 * made when the stores are read and changes no saved record.
 *
 * An alert is seen once any of its records is marked as seen. What is new is
 * an alert not seen, none of whose records this device held unseen when this
 * code first ran on it. No clock time decides it: every way stamps its
 * records from the device's clock, which can be set back.
 *
 * @module lib/alert-groups
 */

import { cardTime } from './alert-event';
import type { WayId } from './app-routes';
import type { IntrusionFrameDB, MatchFrameDB, SubjectProfileDB } from './client-db';
import type { DetectionHistoryEntry } from '../stores/animal-alert-store';

/** Frames of one way that follow each other with no gap longer than this are one alert. */
export const RUN_GAP_MS = 30_000;

/** What this device holds, as its four stores keep it. */
export interface SavedRecords {
  /** Motion and sound's records. */
  alerts: Array<{ id: string; message: string; acknowledged: boolean; createdAt?: string; timestamp?: string; repeats?: number }>;
  matchFrames: MatchFrameDB[];
  intrusionFrames: IntrusionFrameDB[];
  sightings: DetectionHistoryEntry[];
  /** Every saved Lost and Found subject, of any kind. */
  subjects: SubjectProfileDB[];
  /** Lost and Found's alert threshold as it is set now (0 to 100). */
  alertThreshold: number;
}

/** One alert: one Motion and sound record, or one run of frames of another way. */
export interface DeviceAlert {
  /** The id of its first record. */
  id: string;
  way: WayId;
  /** The time of its first record, by the device's clock. Used for order and for words, never to decide what is new. */
  at: number;
  /** Every record of the alert. */
  recordIds: string[];
  /** True once any of its records is marked as seen. */
  seen: boolean;
  /** What happened, without its time: "Movement", "Colours like Mittens’s", "1 person in view", "Looks like a bird". */
  what: string;
  /** The first frame's saved picture, for the ways that keep one. */
  picture?: string;
}

/** A time a record holds: a number, or a date that parses. */
function timeOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
  }
  return null;
}

/**
 * A record's time, or null when none parses: its `createdAt`, else its
 * `timestamp`, else the time its id carries when the id reads
 * `{kind}-{time}-{random}` (lib/alert-id). Never throws. History reads it too.
 */
export function recordTime(record: { id: string; createdAt?: unknown; timestamp?: unknown }): number | null {
  try {
    const dated = timeOf(record.createdAt) ?? timeOf(record.timestamp);
    if (dated !== null) return dated;
    const carried = /^[^-]+-(\d+)-/.exec(typeof record.id === 'string' ? record.id : '');
    return carried ? timeOf(Number(carried[1])) : null;
  } catch {
    return null;
  }
}

/**
 * A Motion and sound record's time as History lists it: an event that
 * alerted again at its newest alert (lib/alert-event's cardTime), else the
 * record's own time.
 */
function motionTime(record: SavedRecords['alerts'][number]): number {
  const shown = timeOf(cardTime(record));
  return shown ?? recordTime(record) ?? Number.NaN;
}

// What a Motion and sound record says happened, read from its id's opening word.
function motionWhat(id: string, message: unknown): string {
  const kind = id.split('-')[0];
  if (kind === 'motion' || kind === 'pixel') return 'Movement';
  if (kind === 'audio') return 'Sound';
  if (kind === 'inactivity') {
    const minutes = /for (\d+) minute/.exec(typeof message === 'string' ? message : '');
    if (minutes) {
      const n = Number(minutes[1]);
      return n === 1 ? 'No movement for 1 minute' : `No movement for ${n} minutes`;
    }
  }
  return 'Alert';
}

const pictureOf = (frame: { thumbnailData?: string; frameData?: string }) => frame.thumbnailData || frame.frameData || undefined;

interface Timed<T> {
  record: T;
  at: number | null;
}

// Records in time order, the undated last, ties by id.
function inOrder<T extends { id: string }>(records: Timed<T>[]): Timed<T>[] {
  return [...records].sort((a, b) => {
    if (a.at === null || b.at === null) {
      if (a.at !== b.at) return a.at === null ? 1 : -1;
    } else if (a.at !== b.at) {
      return a.at - b.at;
    }
    return a.record.id < b.record.id ? -1 : a.record.id > b.record.id ? 1 : 0;
  });
}

// Cuts one group's records, in time order, wherever two neighbours are more
// than RUN_GAP_MS apart. A record with no time is a run of its own.
function runsOf<T extends { id: string }>(records: T[]): Timed<T>[][] {
  const runs: Timed<T>[][] = [];
  let last: number | null = null;
  for (const timed of inOrder(records.map((record) => ({ record, at: recordTime(record) })))) {
    const current = runs[runs.length - 1];
    if (!current || timed.at === null || last === null || timed.at - last > RUN_GAP_MS) runs.push([timed]);
    else current.push(timed);
    last = timed.at;
  }
  return runs;
}

function alertOfRun<T extends { id: string; acknowledged: boolean }>(
  run: Timed<T>[], way: WayId, what: string, picture: string | undefined,
): DeviceAlert {
  const first = run[0];
  return {
    id: first.record.id,
    way,
    at: first.at ?? Number.NaN,
    recordIds: run.map((timed) => timed.record.id),
    seen: run.some((timed) => timed.record.acknowledged === true),
    what,
    ...(picture ? { picture } : {}),
  };
}

function groupBy<T>(records: T[], key: (record: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const record of records) {
    const name = key(record);
    groups.set(name, [...(groups.get(name) ?? []), record]);
  }
  return groups;
}

const animalWord = (type: unknown) => (type === 'unknown_animal' || typeof type !== 'string' || type === '' ? 'animal' : type);

/** Every alert the records hold, seen or not, newest first. Changes no record. */
export function groupAlerts(records: SavedRecords): DeviceAlert[] {
  const alerts: DeviceAlert[] = [];

  for (const record of records.alerts) {
    alerts.push({
      id: record.id,
      way: 'monitor',
      at: motionTime(record),
      recordIds: [record.id],
      seen: record.acknowledged === true,
      what: motionWhat(record.id, record.message),
    });
  }

  // A Lost and Found frame counts when its subject is saved, is a pet or
  // another thing, and the frame raised the alert. A frame saved before the
  // `alerted` field is judged by the threshold as it is set now.
  const subjects = new Map(records.subjects.filter((s) => s.type === 'pet' || s.type === 'other').map((s) => [s.id, s]));
  const counted = records.matchFrames.filter((frame) => {
    if (!subjects.has(frame.subjectId)) return false;
    if (typeof frame.alerted === 'boolean') return frame.alerted;
    return frame.confidence >= records.alertThreshold;
  });
  for (const [subjectId, frames] of groupBy(counted, (frame) => frame.subjectId)) {
    const name = subjects.get(subjectId)?.name ?? '';
    for (const run of runsOf(frames)) alerts.push(alertOfRun(run, 'lost-found', `Colours like ${name}’s`, pictureOf(run[0].record)));
  }

  for (const run of runsOf(records.intrusionFrames)) {
    const count = run[0].record.personCount;
    const what = count === 1 ? '1 person in view' : `${count} people in view`;
    alerts.push(alertOfRun(run, 'security', what, pictureOf(run[0].record)));
  }

  for (const [type, sightings] of groupBy(records.sightings, (sighting) => String(sighting.type))) {
    const animal = animalWord(type);
    const what = `Looks like ${/^[aeiou]/i.test(animal) ? 'an' : 'a'} ${animal}`;
    for (const run of runsOf(sightings)) alerts.push(alertOfRun(run, 'wildlife', what, run[0].record.frameData || undefined));
  }

  // Newest first, ties by id; an alert with no time after every dated one.
  return alerts.sort((a, b) => {
    const aDated = Number.isFinite(a.at);
    const bDated = Number.isFinite(b.at);
    if (aDated !== bDated) return aDated ? -1 : 1;
    if (aDated && a.at !== b.at) return b.at - a.at;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** The alerts not marked as seen, none of whose records was held unseen at the first run. Order kept. */
export function onlyNew(alerts: DeviceAlert[], heldAtFirstRun: ReadonlySet<string>): DeviceAlert[] {
  // An alert with no time is left out: its line could give no time.
  return alerts.filter((alert) => !alert.seen && Number.isFinite(alert.at) && !alert.recordIds.some((id) => heldAtFirstRun.has(id)));
}

/** "Movement at 14:05". */
export function alertLine(alert: DeviceAlert, time: (at: number) => string): string {
  return `${alert.what} at ${time(alert.at)}`;
}

/** The id of every record not marked as seen, of all four stores, whatever its kind. */
export function unseenIds(records: SavedRecords): string[] {
  return [
    ...records.alerts, ...records.matchFrames, ...records.intrusionFrames, ...records.sightings,
  ].filter((record) => record.acknowledged !== true).map((record) => record.id);
}
