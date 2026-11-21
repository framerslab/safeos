/** @jest-environment jsdom */
/**
 * Which alerts sound
 *
 * The alert sound belongs to the running watch: only an alert that watch
 * raised sounds.
 */

import { forgetRaised, raisedByThisWatch, watchRaised } from '@/lib/watch-sound';

it('only an alert this watch raised sounds', () => {
  watchRaised('a');

  expect(raisedByThisWatch('a')).toBe(true);
  expect(raisedByThisWatch('b')).toBe(false);
});

it('a new watch forgets the alerts of the one before', () => {
  watchRaised('a');
  forgetRaised();

  expect(raisedByThisWatch('a')).toBe(false);
});
