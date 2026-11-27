/**
 * Where setup draws each bar's line
 *
 * Each bar's line stands where the watch will alert once setup ends with the
 * answer shown chosen: 100 less the sensitivity of the setting the watch will
 * read for that use, and no line where that setting raises no such alert. The Motion and Audio set for a use on Settings,
 * Detection go over the setting through the watch's own rule
 * (effectiveSettings), so a change to that rule moves the watch's lines and
 * setup's together.
 *
 * @module lib/alert-lines
 */

import { DEFAULT_PRESETS, effectiveSettings, type ScenarioOverrides, type SecurityPreset } from '@/stores/settings-store';
import { USE_SETTING, type SetupUse } from './setup-steps';

export interface AlertLines {
  /** Where the motion alert starts, 0 to 100, or null where the setting has motion alerts off. */
  motion: number | null;
  /** Where the sound alert starts, or null where the setting raises no sound alert. */
  sound: number | null;
}

const held = (value: number) => Math.max(0, Math.min(100, value));

/**
 * 100 less each sensitivity, as the watch reads it; no motion line where the
 * setting has motion alerts off (the watch reads no motion then), and no
 * sound line where it does not listen for an alert.
 */
export function linesOf(
  setting: Pick<SecurityPreset, 'motionSensitivity' | 'audioSensitivity' | 'audioDetectionEnabled'> &
    Partial<Pick<SecurityPreset, 'motionDetectionEnabled'>>,
): AlertLines {
  return {
    motion: setting.motionDetectionEnabled === false ? null : held(100 - setting.motionSensitivity),
    sound: setting.audioDetectionEnabled ? held(100 - setting.audioSensitivity) : null,
  };
}

/**
 * The lines the watch will alert at once setup ends with the option shown
 * chosen. The setting under them is the device's own (`saved`) for no use or
 * for the use the device has, otherwise that use's preset, the one the last
 * key applies. Over it goes the Motion and Audio Sensitivity set for the use
 * on Settings, Detection (`overrides`), as the watch lays them; the use is
 * `chosen`, or `watchUse` (the use the watch reads now) for no use.
 */
export function alertLines(
  chosen: SetupUse | null,
  savedUse: SetupUse | null,
  saved: SecurityPreset,
  overrides: ScenarioOverrides,
  watchUse: SetupUse | null,
): AlertLines {
  const base = chosen === null || chosen === savedUse ? saved : DEFAULT_PRESETS[USE_SETTING[chosen]];
  return linesOf(effectiveSettings(base, overrides, chosen ?? watchUse));
}
