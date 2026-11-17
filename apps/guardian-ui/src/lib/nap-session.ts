/**
 * The nap a person starts from Nap Mode, kept for this tab in sessionStorage.
 *
 * Start Nap Mode writes it as it opens the monitor: when the nap began, its
 * planned minutes, and start, true until the monitor has started the watch
 * once. The monitor reads it to start watching on arrival, to play the warning
 * once the planned minutes have passed, and ends it when the person stops the
 * watch.
 *
 * @module lib/nap-session
 */

export const NAP_SESSION_KEY = 'safeos-nap';

/** How long after Start Nap Mode the monitor still starts the watch on arrival. */
const START_WINDOW_MS = 2 * 60_000;

export interface NapSession {
  /** When Start Nap Mode was pressed, in milliseconds since the epoch. */
  startedAt: number;
  /** The planned nap, in minutes. */
  minutes: number;
  /** True until the monitor has started the watch for this nap. */
  start: boolean;
}

export function readNapSession(): NapSession | null {
  try {
    const raw = sessionStorage.getItem(NAP_SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<NapSession> | null;
    if (!value || !Number.isFinite(value.startedAt) || !Number.isFinite(value.minutes) || (value.minutes as number) <= 0) {
      return null;
    }
    return { startedAt: value.startedAt as number, minutes: value.minutes as number, start: value.start === true };
  } catch (error) {
    console.warn('[Nap] Could not read the nap kept for this tab:', error);
    return null;
  }
}

export function writeNapSession(session: NapSession): void {
  try {
    sessionStorage.setItem(NAP_SESSION_KEY, JSON.stringify(session));
  } catch (error) {
    // The monitor then opens without starting by itself and without the nap's reminder.
    console.warn('[Nap] Could not keep the nap for the monitor:', error);
  }
}

export function clearNapSession(): void {
  try {
    sessionStorage.removeItem(NAP_SESSION_KEY);
  } catch (error) {
    console.warn('[Nap] Could not clear the nap kept for this tab:', error);
  }
}

/**
 * True once, for the first monitor that reads a nap waiting to start within
 * two minutes of Start Nap Mode; the nap is then marked as started.
 */
export function takeNapStart(now: number): boolean {
  const session = readNapSession();
  if (!session || !session.start) return false;
  writeNapSession({ ...session, start: false });
  return now - session.startedAt <= START_WINDOW_MS;
}

/** True once the nap's planned minutes have passed, counted in whole minutes. */
export function napTimeIsUp(session: NapSession, now: number): boolean {
  return Math.floor((now - session.startedAt) / 60_000) >= session.minutes;
}
