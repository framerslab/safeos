/** @jest-environment node */
/**
 * Each meter of the watch, read from its check
 *
 * A meter's value, its alert line and its state come from the check's own
 * reading: Motion and Sound from their level against the line the setting
 * gives, Picture change from the check's own answer in both of its modes.
 */

import { levelMeter, meterValueText, pictureChangeMeter, METER_STATE_WORDS } from '@/lib/watch-meters';

it('reads no level yet as loading, with no words to say', () => {
  const reading = levelMeter(null, 20, true);
  expect(reading).toEqual({ value: 0, line: 20, state: 'loading' });
  expect(meterValueText(reading)).toBeUndefined();
});

it('reads a level at or over its line as over the line', () => {
  const reading = levelMeter(25, 20, true);
  expect(reading).toEqual({ value: 25, line: 20, state: 'over' });
  expect(meterValueText(reading)).toBe('25 per cent, line at 20, Over the line');
  expect(levelMeter(20, 20, true).state).toBe('over');
});

it('rounds a level and reads it under the line as quiet', () => {
  const reading = levelMeter(12.6, 20, true);
  expect(reading).toEqual({ value: 13, line: 20, state: 'quiet' });
  expect(meterValueText(reading)).toBe('13 per cent, line at 20, Quiet');
});

it('holds a level to 0 to 100', () => {
  expect(levelMeter(140, 20, true).value).toBe(100);
  expect(levelMeter(-3, 20, true).value).toBe(0);
});

it('reads a kind the setting does not alert on with no line', () => {
  const reading = levelMeter(40, 20, false);
  expect(reading).toEqual({ value: 40, line: null, state: 'no-alert' });
  expect(meterValueText(reading)).toBe('40 per cent, No alert');
});

it('shows no Picture change meter where the setting does not check it', () => {
  expect(pictureChangeMeter(null, false)).toBeNull();
  expect(pictureChangeMeter({ ratio: 2, triggered: true }, false)).toBeNull();
});

it('reads Picture change from the check, under its line until the check answers yes', () => {
  expect(pictureChangeMeter(null, true)).toEqual({ value: 0, line: 20, state: 'loading' });
  expect(pictureChangeMeter({ ratio: 0.5, triggered: false }, true)).toEqual({ value: 10, line: 20, state: 'quiet' });
  // A share-of-picture yes under the count's own line still reads over it.
  expect(pictureChangeMeter({ ratio: 0.9, triggered: true }, true)).toEqual({ value: 20, line: 20, state: 'over' });
  expect(pictureChangeMeter({ ratio: 1.2, triggered: false }, true)).toEqual({ value: 19, line: 20, state: 'quiet' });
  expect(pictureChangeMeter({ ratio: 9, triggered: true }, true)).toEqual({ value: 100, line: 20, state: 'over' });
});

it('names the three states', () => {
  expect(METER_STATE_WORDS).toEqual({ quiet: 'Quiet', over: 'Over the line', 'no-alert': 'No alert' });
});
