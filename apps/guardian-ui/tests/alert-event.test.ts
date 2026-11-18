/**
 * One detector event, from its first reading over the line to its quiet end
 *
 * An event ends once readings stay under the line for the sustained window.
 * The watch samples every 200 ms, so the window can pass between two quiet
 * samples and the next reading over the line: that reading starts a new
 * event, which alerts on its own timing, not as a repeat of the old one held
 * for the repeat cooldown.
 *
 * @module tests/alert-event.test
 */
import { newDetectorEvent, readDetector } from '../src/lib/alert-event';

const timing = { severitySeconds: 0, cooldownPeriodSeconds: 30, sustainedMs: 250 };

it('starts a new event when the quiet window passed between samples, so it is not held as a repeat', () => {
  const event = newDetectorEvent();
  expect(readDetector(event, 0, 'high', timing)).toEqual({ kind: 'quiet' });
  expect(readDetector(event, 300, 'high', timing)).toEqual({ kind: 'alert', repeat: false });

  // Quiet at 1000 and 1200 ms (200 ms of quiet so far), over the line again at 1400 ms:
  // 400 ms of quiet passed, more than the 250 ms window.
  readDetector(event, 1000, null, timing);
  readDetector(event, 1200, null, timing);
  expect(readDetector(event, 1400, 'high', timing)).toEqual({ kind: 'quiet' });
  expect(readDetector(event, 1700, 'high', timing)).toEqual({ kind: 'alert', repeat: false });
});

it('keeps an event going through a quiet spell shorter than the window, and holds its repeat', () => {
  const event = newDetectorEvent();
  readDetector(event, 0, 'high', timing);
  expect(readDetector(event, 300, 'high', timing)).toEqual({ kind: 'alert', repeat: false });

  // 200 ms of quiet, under the 250 ms window: the same event goes on.
  readDetector(event, 1000, null, timing);
  expect(readDetector(event, 1200, 'high', timing)).toEqual({ kind: 'held' });
  expect(readDetector(event, 31_000, 'high', timing)).toEqual({ kind: 'alert', repeat: true });
});
