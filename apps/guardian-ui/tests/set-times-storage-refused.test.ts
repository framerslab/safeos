/** @jest-environment jsdom */
/**
 * Set times on a browser that refuses storage
 *
 * Every page checks the set times of Quiet hours. A browser can refuse this
 * site's storage on every call; the check then runs for the visit and
 * nothing throws, so the page stays up.
 */

import { renderHook } from '@testing-library/react';
import { useScheduleChecker, useScheduleStore } from '@/lib/schedule-manager';

const refuse = () => {
  throw new DOMException('denied', 'SecurityError');
};

let refusals: jest.SpyInstance[] = [];

// tests/setup.ts gives the page a storage object of its own, which is not a
// Storage, so the refusal is put on that object.
beforeEach(() => {
  refusals = [
    jest.spyOn(localStorage, 'getItem').mockImplementation(refuse),
    jest.spyOn(localStorage, 'setItem').mockImplementation(refuse),
    jest.spyOn(localStorage, 'removeItem').mockImplementation(refuse),
  ];
});

afterEach(() => {
  for (const refusal of refusals) refusal.mockRestore();
});

it('checks the set times with no error when the browser refuses its storage', () => {
  expect(() => localStorage.setItem('guardian-schedules', '{}')).toThrow();

  // A refused write that reaches the page throws out of this render.
  const { unmount } = renderHook(() => useScheduleChecker());
  expect(useScheduleStore.getState().activeScheduleId).toBeNull();
  expect(() => useScheduleStore.getState().checkSchedules()).not.toThrow();
  unmount();
});
