/**
 * Each meter of the watch, read from its check
 *
 * A meter shows a kind's level on a track from 0 to 100 with the alert line
 * the setting in use gives, and a word for its state. Motion and Sound read
 * their level against that line; Picture change follows the check's own
 * answer, so its bar is over the line exactly when the check says yes, in both
 * of the check's modes (a count of pixels or a share of the picture).
 *
 * @module lib/watch-meters
 */

import { DEFAULT_MIN_CHANGE_PERCENT } from './pixel-detection';

export type MeterState = 'loading' | 'quiet' | 'over' | 'no-alert';

export interface MeterReading {
  value: number;
  line: number | null;
  state: MeterState;
}

export const METER_STATE_WORDS: Record<'quiet' | 'over' | 'no-alert', string> = {
  quiet: 'Quiet',
  over: 'Over the line',
  'no-alert': 'No alert',
};

/** Picture change's line: the check's own yes sits at 20 on its track. */
const PICTURE_CHANGE_LINE = 20;

const held = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** A level from 0 to 100 against its line; null while no reading has come. */
export function levelMeter(level: number | null, line: number, enabled: boolean): MeterReading {
  if (level === null) return { value: 0, line, state: 'loading' };
  const value = held(Math.round(level), 0, 100);
  if (!enabled) return { value, line: null, state: 'no-alert' };
  return { value, line, state: value >= line ? 'over' : 'quiet' };
}

/**
 * How far a Picture change reading stands towards the check's yes, 1 at the
 * yes: in the count mode the changed pixels against the count's line, in the
 * share mode the changed share of the picture against the check's share.
 */
export function pictureChangeRatio({
  useAbsoluteThreshold,
  changedPx,
  thresholdPx,
  difference,
}: {
  useAbsoluteThreshold: boolean;
  changedPx: number;
  thresholdPx: number;
  difference: number;
}): number {
  if (useAbsoluteThreshold) return thresholdPx > 0 ? changedPx / thresholdPx : 0;
  return difference / DEFAULT_MIN_CHANGE_PERCENT;
}

/** Picture change's meter, or none where the setting does not check it. */
export function pictureChangeMeter(
  status: { ratio: number; triggered: boolean } | null,
  enabled: boolean,
): MeterReading | null {
  if (!enabled) return null;
  if (status === null) return { value: 0, line: PICTURE_CHANGE_LINE, state: 'loading' };
  const value = Math.round(PICTURE_CHANGE_LINE * status.ratio);
  return status.triggered
    ? { value: held(value, PICTURE_CHANGE_LINE, 100), line: PICTURE_CHANGE_LINE, state: 'over' }
    : { value: held(value, 0, PICTURE_CHANGE_LINE - 1), line: PICTURE_CHANGE_LINE, state: 'quiet' };
}

/** What a screen reader says for a meter; nothing while it waits for a reading. */
export function meterValueText(reading: MeterReading): string | undefined {
  if (reading.state === 'loading') return undefined;
  if (reading.state === 'no-alert') return `${reading.value} per cent, ${METER_STATE_WORDS['no-alert']}`;
  return `${reading.value} per cent, line at ${reading.line}, ${METER_STATE_WORDS[reading.state]}`;
}
