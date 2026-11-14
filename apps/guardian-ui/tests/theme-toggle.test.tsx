/** @jest-environment jsdom */
/**
 * The theme button changes the page on a light device
 *
 * tests/setup.ts answers every prefers-color-scheme query with no match, so
 * this file runs as a device set to light with no saved theme. The store's
 * rehydrate step used to call useThemeStore while create() was still running;
 * that threw, the store never finished hydrating, and useTheme never applied
 * a theme, so the button changed its icon and left the page as it was.
 */

import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { useTheme, useThemeStore } from '@/lib/theme-manager';

afterEach(cleanup);

it('finishes hydrating and reads the device as light', () => {
  expect(useThemeStore.persist.hasHydrated()).toBe(true);
  expect(useThemeStore.getState().themeMode).toBe('system');
  expect(useThemeStore.getState().resolvedTheme).toBe('light');
});

it('switches the page to dark and back when the button is pressed', () => {
  let toggle: () => void = () => undefined;
  let isDark: boolean | undefined;
  function ThemeButton() {
    const theme = useTheme();
    toggle = theme.toggleTheme;
    isDark = theme.isDark;
    return null;
  }

  render(<ThemeButton />);
  expect(isDark).toBe(false);
  expect(document.documentElement.classList.contains('light')).toBe(true);

  act(() => toggle());
  expect(isDark).toBe(true);
  expect(document.documentElement.classList.contains('dark')).toBe(true);
  expect(document.documentElement.classList.contains('light')).toBe(false);

  act(() => toggle());
  expect(document.documentElement.classList.contains('light')).toBe(true);
  expect(document.documentElement.classList.contains('dark')).toBe(false);
});
