/**
 * @jest-environment jsdom
 */
import { act, cleanup, renderHook } from '@testing-library/react';
import { showShortcutsHelp, useShortcutsHelp } from '../src/lib/keyboard-shortcuts';

afterEach(cleanup);

it('opens the shortcuts help when a control outside the provider asks for it', () => {
  const { result } = renderHook(() => useShortcutsHelp());
  expect(result.current.isOpen).toBe(false);
  act(() => showShortcutsHelp());
  expect(result.current.isOpen).toBe(true);
  // Asking again leaves it open: the control opens the help, the dialog closes itself.
  act(() => showShortcutsHelp());
  expect(result.current.isOpen).toBe(true);
});
