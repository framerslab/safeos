/**
 * The words Lost and Found shows for a sighting: a question and a
 * resemblance the person checks, never a score.
 */

import { describe, it, expect } from '@jest/globals';
import {
  LINE_WORDS,
  SPOKEN_DEFAULT,
  checksInARow,
  lineState,
  savedSightings,
  sightingLines,
  sightingNotificationBody,
  sightingPlate,
  sightingQuestion,
} from '@/lib/lost-found-words';

describe('Lost and Found words', () => {
  it('counts saved sightings and checks in a row in whole words', () => {
    expect([0, 1, 2].map(savedSightings)).toEqual([
      'No possible sightings saved',
      '1 possible sighting saved',
      '2 possible sightings saved',
    ]);
    expect(checksInARow(1, 'Miso')).toBe('1 check like Miso’s photos');
    expect(checksInARow(3, 'Miso')).toBe('3 checks in a row like Miso’s photos');
  });

  it('reads a score as over the line from the line itself', () => {
    expect([lineState(69, 70), lineState(70, 70), lineState(0, 70)]).toEqual(['under', 'over', 'under']);
    expect(LINE_WORDS).toEqual({ over: 'Over the line', under: 'Quiet' });
  });

  it('asks a question and names no score', () => {
    expect(sightingQuestion('Miso')).toBe('Could this be Miso?');
    expect(sightingLines('Miso')).toEqual([
      'Colours and shape like Miso’s photos.',
      'Compare the two pictures. It can be another animal that looks alike.',
    ]);
    expect(sightingPlate('Miso')).toBe('Colours like Miso’s');
    expect(sightingNotificationBody('Miso', new Date(2026, 10, 21, 21, 42, 10))).toMatch(
      /^Colours and shape like Miso’s photos, .*42.*10.*\.$/,
    );
    for (const words of [sightingQuestion('Miso'), ...sightingLines('Miso'), sightingPlate('Miso'), SPOKEN_DEFAULT]) {
      expect(words).not.toMatch(/%|match|detected|confidence/i);
    }
  });
});
