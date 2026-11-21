/**
 * What this device remembers of a watch
 *
 * The way a watch last ran with (and, for Lost and Found, the pet), and the
 * times of the last watch: when it started, the last moment it was known to
 * run, and when it ended. A page that is closed without running its code (a
 * force quit, a dead battery) writes no end, so the last known moment is what
 * the dashboard can truly say.
 *
 * @module lib/watch-session
 */

import { WAYS, type WayId } from './app-routes';
import { readKept, writeKept } from './visit-store';

export const LAST_WAY_KEY = 'safeos-last-way';
export const WATCH_SESSION_KEY = 'safeos-watch-session';

export interface LastWay {
  way: WayId;
  /** Lost and Found: the id of the pet the watch looked for. */
  pet?: string;
}

export interface WatchSession {
  startedAt: number;
  /** The last moment the watch was known to run. */
  seenAt: number;
  endedAt: number | null;
}

function read<T>(key: string, valid: (value: unknown) => value is T): T | null {
  try {
    const value: unknown = JSON.parse(readKept(key) || 'null');
    return valid(value) ? value : null;
  } catch {
    return null;
  }
}

const isLastWay = (value: unknown): value is LastWay => {
  const record = value as LastWay | null;
  return !!record && typeof record === 'object' && WAYS.some((way) => way.id === record.way) &&
    (record.pet === undefined || typeof record.pet === 'string');
};

const isSession = (value: unknown): value is WatchSession => {
  const record = value as WatchSession | null;
  return !!record && typeof record === 'object' && Number.isFinite(record.startedAt) && Number.isFinite(record.seenAt) &&
    (record.endedAt === null || Number.isFinite(record.endedAt));
};

export function readLastWay(): LastWay | null {
  return read(LAST_WAY_KEY, isLastWay);
}

export function readWatchSession(): WatchSession | null {
  return read(WATCH_SESSION_KEY, isSession);
}

/** The way a running watch uses; the pet is kept for Lost and Found alone. */
export function rememberWay(way: WayId, pet?: string): void {
  writeKept(LAST_WAY_KEY, JSON.stringify(way === 'lost-found' && pet ? { way, pet } : { way }));
}

/** A watch started: its times replace the last watch's. */
export function watchStarted(now: number = Date.now()): void {
  writeKept(WATCH_SESSION_KEY, JSON.stringify({ startedAt: now, seenAt: now, endedAt: null }));
}

/** The watch is running at this moment. */
export function watchSeen(now: number = Date.now()): void {
  const session = readWatchSession();
  if (!session || session.endedAt !== null) return;
  writeKept(WATCH_SESSION_KEY, JSON.stringify({ ...session, seenAt: now }));
}

export function watchEnded(now: number = Date.now()): void {
  const session = readWatchSession();
  if (!session || session.endedAt !== null) return;
  writeKept(WATCH_SESSION_KEY, JSON.stringify({ ...session, seenAt: now, endedAt: now }));
}

/**
 * Runs while a watch runs: writes the time once a minute and when the page
 * turns hidden, the last moment a page can count on, and the end when the
 * page is left. Returns the function that ends it.
 */
export function keepWatchTimes(): () => void {
  const minute = window.setInterval(() => watchSeen(), 60_000);
  const hidden = () => {
    if (document.visibilityState === 'hidden') watchSeen();
  };
  const left = () => watchEnded();
  document.addEventListener('visibilitychange', hidden);
  window.addEventListener('pagehide', left);
  return () => {
    window.clearInterval(minute);
    document.removeEventListener('visibilitychange', hidden);
    window.removeEventListener('pagehide', left);
  };
}

/** What the dashboard says of the last watch, or null before any watch. */
export function lastWatchLine(session: WatchSession | null, time: (at: number) => string): string | null {
  if (!session) return null;
  return session.endedAt !== null
    ? `The last watch ended at ${time(session.endedAt)}.`
    : `The last watch ran until at least ${time(session.seenAt)}.`;
}
