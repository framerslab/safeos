/**
 * A nap started from Nap Mode, handed to the watch in its address.
 *
 * Start Nap Mode opens /monitor/?nap=<minutes>. The monitor reads the planned
 * minutes once, drops them from the address and keeps the nap in memory, so
 * the nap belongs to the watch it opened: it starts that watch, plays the
 * warning once the planned minutes have passed and ends when the person stops
 * the watch or ends the nap. Nothing is stored, so a later watch in the tab
 * never inherits it.
 *
 * @module lib/nap-session
 */

import { DEFAULT_PRESETS, type QuietHoursSettings } from '../stores/settings-store';

/** The query parameter that carries the planned nap, in minutes. */
export const NAP_PARAM = 'nap';

/** The longest nap the address may carry, in minutes. */
const LONGEST_NAP_MINUTES = 180;

export interface Nap {
  /** When the watch took the nap over, in milliseconds since the epoch. */
  startedAt: number;
  /** The planned nap, in minutes. */
  minutes: number;
}

/** The address Start Nap Mode opens. */
export function napHandoffPath(minutes: number): string {
  return `/monitor/?${NAP_PARAM}=${minutes}`;
}

/** The planned minutes an address's query carries, a whole number from 1 to 180, or null. */
export function readNapParam(search: string): number | null {
  const raw = new URLSearchParams(search).get(NAP_PARAM);
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const minutes = Number(raw);
  return minutes >= 1 && minutes <= LONGEST_NAP_MINUTES ? minutes : null;
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
 * The volume, 0 to 100, the nap's alerts will play at: the settings store's
 * effective volume with the Nap preset's alert volume.
 */
export function napAlertVolume(state: VolumeState): number {
  if (state.emergencyModeActive) return 100;
  if (state.globalMute) return 0;
  if (state.isQuietHoursActive()) {
    return state.quietHoursSettings.mode === 'reduced' ? state.quietHoursSettings.reducedVolume : 0;
  }
  return DEFAULT_PRESETS.infant_sleep.alertVolume;
}
