/** @jest-environment jsdom */
/**
 * The watch's view, kept on this device
 *
 * The watch shows its settings folded or open; the choice is kept, and a
 * browser that refuses this site's storage keeps it for the visit.
 */

import { act, renderHook } from '@testing-library/react';
import { forgetVisit } from '@/lib/visit-store';
import { useWatchView, WATCH_VIEW_KEY } from '@/lib/watch-view';

beforeEach(() => {
  localStorage.clear();
  forgetVisit();
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('shows the watch on a new device', () => {
  const { result } = renderHook(() => useWatchView());
  expect(result.current[0]).toBe('watch');
});

it('shows the settings where this device chose them', () => {
  localStorage.setItem('safeos-watch-view', 'settings');
  const { result } = renderHook(() => useWatchView());
  expect(result.current[0]).toBe('settings');
});

it('reads anything else as the watch', () => {
  localStorage.setItem('safeos-watch-view', 'everything');
  const { result } = renderHook(() => useWatchView());
  expect(result.current[0]).toBe('watch');
});

it('keeps the choice on this device', () => {
  const { result } = renderHook(() => useWatchView());
  act(() => result.current[1]('settings'));
  expect(result.current[0]).toBe('settings');
  expect(WATCH_VIEW_KEY).toBe('safeos-watch-view');
  expect(localStorage.getItem('safeos-watch-view')).toBe('settings');
});

it('keeps the view for the visit when storage is refused', () => {
  jest.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new DOMException('refused', 'SecurityError');
  });
  const { result } = renderHook(() => useWatchView());
  expect(() => act(() => result.current[1]('settings'))).not.toThrow();
  expect(result.current[0]).toBe('settings');
});
