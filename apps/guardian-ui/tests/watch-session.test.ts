/** @jest-environment jsdom */
/**
 * What this device remembers of a watch
 *
 * The way a watch last ran with, and the times of the last watch: when it
 * started, the last moment it was known to run and when it ended. A browser
 * that refuses storage keeps them for the visit, and a damaged record reads
 * as none.
 */

import {
  keepWatchTimes,
  lastWatchLine,
  readLastWay,
  readWatchSession,
  rememberWay,
  watchEnded,
  watchSeen,
  watchStarted,
} from '@/lib/watch-session';
import { forgetVisit } from '@/lib/visit-store';

const storedSession = () => JSON.parse(localStorage.getItem('safeos-watch-session') as string);

beforeEach(() => {
  localStorage.clear();
  forgetVisit();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  delete (document as unknown as { visibilityState?: string }).visibilityState;
});

it('remembers the way a watch runs with, and the pet for Lost and Found', () => {
  rememberWay('lost-found', 'pet-1');
  expect(readLastWay()).toEqual({ way: 'lost-found', pet: 'pet-1' });
  expect(localStorage.getItem('safeos-last-way')).toBe(JSON.stringify({ way: 'lost-found', pet: 'pet-1' }));

  rememberWay('monitor', 'pet-1');
  expect(readLastWay()).toEqual({ way: 'monitor' });
});

it("a start replaces the last watch's times", () => {
  watchStarted(1000);
  watchSeen(61_000);
  watchEnded(90_000);
  expect(storedSession()).toEqual({ startedAt: 1000, seenAt: 90_000, endedAt: 90_000 });

  watchStarted(200_000);
  expect(storedSession()).toEqual({ startedAt: 200_000, seenAt: 200_000, endedAt: null });
});

it('says when the last watch ended', () => {
  expect(lastWatchLine({ startedAt: 1, seenAt: 5, endedAt: 9 }, (at) => `T${at}`)).toBe('The last watch ended at T9.');
});

it('says how long a watch is known to have run when its page was closed without a word', () => {
  expect(lastWatchLine({ startedAt: 1, seenAt: 5, endedAt: null }, (at) => `T${at}`)).toBe(
    'The last watch ran until at least T5.',
  );
  expect(lastWatchLine(null, (at) => `T${at}`)).toBeNull();
});

it('writes the time once a minute and when the page turns hidden, and the end when the page is left', () => {
  jest.useFakeTimers({ now: 1_000_000 });
  let visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });

  watchStarted(Date.now());
  const stop = keepWatchTimes();

  jest.advanceTimersByTime(60_000);
  expect(readWatchSession()?.seenAt).toBe(1_060_000);

  jest.advanceTimersByTime(5_000);
  document.dispatchEvent(new Event('visibilitychange'));
  expect(readWatchSession()?.seenAt).toBe(1_060_000);

  visibility = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  expect(readWatchSession()?.seenAt).toBe(Date.now());
  expect(readWatchSession()?.endedAt).toBeNull();

  jest.advanceTimersByTime(1_000);
  window.dispatchEvent(new Event('pagehide'));
  expect(readWatchSession()?.endedAt).toBe(Date.now());

  stop();
  watchStarted(Date.now());
  const started = readWatchSession();
  jest.advanceTimersByTime(60_000);
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('pagehide'));
  expect(readWatchSession()).toEqual(started);
});

it('a time written after the end changes nothing', () => {
  watchStarted(1);
  watchEnded(9);
  watchSeen(20);
  expect(readWatchSession()).toEqual({ startedAt: 1, seenAt: 9, endedAt: 9 });
});

it('keeps what it remembers for the visit when the browser refuses to store it', () => {
  jest.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('The browser refused to store this.');
  });

  expect(() => rememberWay('security')).not.toThrow();
  expect(localStorage.getItem('safeos-last-way')).toBeNull();
  expect(readLastWay()).toEqual({ way: 'security' });
});

it('reads a damaged record as none', () => {
  localStorage.setItem('safeos-last-way', '{bad');
  expect(readLastWay()).toBeNull();

  localStorage.setItem('safeos-last-way', '{"way":"nap"}');
  expect(readLastWay()).toBeNull();

  localStorage.setItem('safeos-watch-session', '{"startedAt":"x"}');
  expect(readWatchSession()).toBeNull();
});
