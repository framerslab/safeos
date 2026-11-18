/** @jest-environment jsdom */
/**
 * What the device held unseen when this code first ran
 *
 * Nothing saved before this release counts as new. The first time the code
 * runs on a device it writes the ids of every record it then holds not
 * marked as seen, and the list never changes after that. Where the browser
 * refuses to store it, the list holds for the visit.
 */

import { HISTORY_SEEN_KEY, heldAtFirstRun } from '@/lib/history-seen';
import { forgetStorageFull } from '@/lib/storage-full';
import { forgetVisit } from '@/lib/visit-store';

const KEY = 'safeos-history-seen';

beforeEach(() => {
  localStorage.clear();
  forgetVisit();
  forgetStorageFull();
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('writes what the device holds unseen the first time, and never again', () => {
  expect(HISTORY_SEEN_KEY).toBe(KEY);

  const first = heldAtFirstRun(() => ['a', 'b']);
  expect([...first].sort()).toEqual(['a', 'b']);
  expect(localStorage.getItem(KEY)).toBe('["a","b"]');

  const later = jest.fn(() => ['c']);
  const second = heldAtFirstRun(later);
  expect([...second].sort()).toEqual(['a', 'b']);
  expect(localStorage.getItem(KEY)).toBe('["a","b"]');
  expect(later).not.toHaveBeenCalled();
});

it('holds the list for the visit when the browser refuses to store it', () => {
  // The object tests/setup.ts installs; a spy on Storage.prototype never reaches it.
  jest.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new DOMException('The browser refused to store this.', 'SecurityError');
  });

  const first = heldAtFirstRun(() => ['a', 'b']);
  expect([...first].sort()).toEqual(['a', 'b']);
  expect(localStorage.getItem(KEY)).toBeNull();

  const later = jest.fn(() => ['c']);
  expect([...heldAtFirstRun(later)].sort()).toEqual(['a', 'b']);
  expect(later).not.toHaveBeenCalled();
});

it.each(['{bad', '{"a":1}', '["a",1]'])('reads a damaged record as none and writes it again: %s', (damaged) => {
  localStorage.setItem(KEY, damaged);

  const held = heldAtFirstRun(() => ['x']);

  expect([...held]).toEqual(['x']);
  expect(localStorage.getItem(KEY)).toBe('["x"]');
});

it('an empty device writes an empty list', () => {
  expect(heldAtFirstRun(() => []).size).toBe(0);
  expect(localStorage.getItem(KEY)).toBe('[]');

  const later = jest.fn(() => ['c']);
  expect(heldAtFirstRun(later).size).toBe(0);
  expect(later).not.toHaveBeenCalled();
});
