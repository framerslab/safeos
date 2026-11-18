/**
 * A nap started from Nap Mode, handed to the watch and kept with it.
 *
 * Start Nap Mode leaves the planned minutes as a one-use hand-off in this tab,
 * good for two minutes. The monitor takes it on arrival, so a link from
 * anywhere else carries no nap and cannot start the camera. The monitor then
 * keeps the nap in this history entry's state: a reload or Back to the watch
 * finds it with its start time, and a new visit to the monitor has none.
 *
 * @module lib/nap-session
 */

import { DEFAULT_PRESETS, quietHoursActiveAt, type QuietHoursSettings } from '../stores/settings-store';

/** Where the hand-off waits in this tab's session storage. */
export const NAP_HANDOFF_KEY = 'safeos-nap-handoff';

/** How long a hand-off stays good: long enough for the monitor to load. */
const HANDOFF_WINDOW_MS = 2 * 60_000;

/** The longest planned nap, in minutes. */
const LONGEST_NAP_MINUTES = 180;

/** A kept nap older than this belongs to a tab restored later, and starts nothing. */
const KEPT_NAP_WINDOW_MS = 12 * 60 * 60_000;

/** The nap's key in this history entry's state. */
const HISTORY_KEY = 'safeosNap';

export interface Nap {
  /** When the watch took the nap over, in milliseconds since the epoch. */
  startedAt: number;
  /** The planned nap, in minutes. */
  minutes: number;
}

interface NapHandoff {
  minutes: number;
  at: number;
}

// Held beside session storage, so the hand-off reaches the monitor in a browser
// that refuses storage: the app moves between pages without a page load.
let handoff: NapHandoff | null = null;

function isPlannedMinutes(minutes: unknown): minutes is number {
  return Number.isInteger(minutes) && (minutes as number) >= 1 && (minutes as number) <= LONGEST_NAP_MINUTES;
}

/** Leaves the planned minutes for the monitor Start Nap Mode is about to open. */
export function handNapToWatch(minutes: number, now: number = Date.now()): void {
  handoff = { minutes, at: now };
  try {
    sessionStorage.setItem(NAP_HANDOFF_KEY, JSON.stringify(handoff));
  } catch (error) {
    console.warn('Nap hand-off held in memory only:', error);
  }
}

/**
 * Takes the hand-off, once: it is gone after this call. Returns the planned
 * minutes, or null when there is none or it is invalid or out of its window.
 */
export function takeNapHandoff(now: number = Date.now()): number | null {
  let held = handoff;
  handoff = null;
  try {
    const stored = sessionStorage.getItem(NAP_HANDOFF_KEY);
    sessionStorage.removeItem(NAP_HANDOFF_KEY);
    if (!held && stored) held = JSON.parse(stored);
  } catch (error) {
    console.warn('Nap hand-off could not be read:', error);
  }
  if (!held || !isPlannedMinutes(held.minutes)) return null;
  const age = now - held.at;
  return age >= 0 && age <= HANDOFF_WINDOW_MS ? held.minutes : null;
}

/** The nap kept in this history entry, or null. */
export function readKeptNap(now: number = Date.now()): Nap | null {
  const kept = window.history.state?.[HISTORY_KEY];
  if (!kept || !isPlannedMinutes(kept.minutes) || typeof kept.startedAt !== 'number') return null;
  const age = now - kept.startedAt;
  return age >= 0 && age <= KEPT_NAP_WINDOW_MS ? { startedAt: kept.startedAt, minutes: kept.minutes } : null;
}

/** Keeps the nap in this history entry, or clears it with null. */
export function keepNap(nap: Nap | null): void {
  const state = { ...window.history.state };
  if (nap) state[HISTORY_KEY] = nap;
  else delete state[HISTORY_KEY];
  window.history.replaceState(state, '');
}

/** True once the nap's planned minutes have passed, counted in whole minutes. */
export function napTimeIsUp(nap: Nap, now: number): boolean {
  return Math.floor((now - nap.startedAt) / 60_000) >= nap.minutes;
}

interface VolumeState {
  emergencyModeActive: boolean;
  globalMute: boolean;
  quietHoursSettings: QuietHoursSettings;
  isQuietHoursActive: () => boolean;
}

/**
 * The volume, 0 to 100, the nap's alarm will play at: what the settings store's
 * effective volume will be once the Nap preset is applied. A movement alert in
 * a nap sounds the alarm at exactly this volume, so the check plays the same.
 */
export function napAlertVolume(state: VolumeState): number {
  if (state.emergencyModeActive) return 100;
  if (state.globalMute) return 0;
  if (state.isQuietHoursActive()) {
    return state.quietHoursSettings.mode === 'reduced' ? state.quietHoursSettings.reducedVolume : 0;
  }
  return DEFAULT_PRESETS.infant_sleep.alertVolume;
}

/**
 * When a nap of these minutes starting now would lose its sound: 'now', or
 * 'during' when quiet hours begin before it ends, or null when it keeps it.
 */
export function napSilence(state: VolumeState, minutes: number, now: Date = new Date()): 'now' | 'during' | null {
  if (state.emergencyModeActive) return null;
  if (napAlertVolume(state) === 0) return 'now';
  const quietHours = state.quietHoursSettings;
  if (quietHours.mode === 'reduced' && quietHours.reducedVolume > 0) return null;
  for (let minute = 1; minute <= minutes; minute += 1) {
    if (quietHoursActiveAt(quietHours, new Date(now.getTime() + minute * 60_000))) return 'during';
  }
  return null;
}
