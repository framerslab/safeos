/** @jest-environment jsdom */
/**
 * Settings' first two rows on a phone
 *
 * A phone's top bar holds the brand alone, so Settings opens with the look
 * row and then the Help row. The look row is named for what a press does; a
 * press turns the whole page to the other look, renames the row and says what
 * it did, also when the browser refuses to store the choice.
 */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PhoneRows } from '@/components/settings/PhoneRows';
import { useThemeStore } from '@/lib/theme-manager';

// An address without its trailing slash: next/link drops it outside a build.
const bare = (address: string | null) => (address || '').replace(/(?<=[^/])\/(?=$|[?#])/, '');

beforeEach(() => {
  localStorage.clear();
  useThemeStore.setState({ themeMode: 'light', resolvedTheme: 'light' });
  document.documentElement.className = '';
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

const statusOf = (container: HTMLElement) => container.querySelector('[role="status"]') as HTMLElement;

describe("Settings' first rows on a phone", () => {
  it('shows the look row first and the Help row second, the look row named for what a press does', () => {
    const { container } = render(<PhoneRows />);
    const controls = Array.from(container.querySelectorAll('.settings-phone-rows a, .settings-phone-rows button'));
    expect(controls.map((control) => control.tagName.toLowerCase())).toEqual(['button', 'a']);
    expect(controls[0]).toBe(screen.getByRole('button', { name: 'Switch to the dark look' }));
    const help = screen.getByRole('link', { name: 'Help' });
    expect(controls[1]).toBe(help);
    expect(bare(help.getAttribute('href'))).toBe('/help');
  });

  it('a press turns the page to the other look, renames the row and says so', () => {
    const { container } = render(<PhoneRows />);
    const status = statusOf(container);
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Switch to the dark look' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByRole('button', { name: 'Switch to the light look' })).toBeTruthy();
    expect(status.textContent).toBe('Dark look on');

    fireEvent.click(screen.getByRole('button', { name: 'Switch to the light look' }));
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(status.textContent).toBe('Light look on');
    expect(screen.getByRole('button', { name: 'Switch to the dark look' })).toBeTruthy();
  });

  it('keeps the look for the visit when the browser refuses to store it', () => {
    const { container } = render(<PhoneRows />);
    // The object tests/setup.ts installs as localStorage is not a Storage, so
    // the refusal is put on the object itself.
    jest.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('refused');
    });
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Switch to the dark look' }))).not.toThrow();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(statusOf(container).textContent).toBe('Dark look on');
  });
});
