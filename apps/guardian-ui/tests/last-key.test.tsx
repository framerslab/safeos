/** @jest-environment jsdom */
/**
 * Setup's last key
 *
 * The key names the page it opens, and while the page opens it says so and
 * waits; a refused write is said above it from its status region. On a phone
 * the key stands in a bar fixed to the foot, and the page's foot is kept clear
 * of it; from 768 px the bar leaves.
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LastKey, type LastKeyProps } from '@/components/setup/LastKey';
import { WAYS, type WayId } from '@/lib/app-routes';

const words = (element: Element | null | undefined) =>
  (element?.textContent || '').replace(/’/g, "'").replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

const ownMatchMedia = window.matchMedia;
let wide = false;
let listeners: Array<(event: { matches: boolean }) => void> = [];
let onPress: jest.Mock;

function standIn() {
  listeners = [];
  window.matchMedia = ((query: string) => ({
    get matches() {
      return wide;
    },
    media: query,
    addEventListener: (_: string, listener: (event: { matches: boolean }) => void) => listeners.push(listener),
    removeEventListener: (_: string, listener: (event: { matches: boolean }) => void) => {
      listeners = listeners.filter((kept) => kept !== listener);
    },
  })) as unknown as typeof window.matchMedia;
}

function fire(matches: boolean) {
  wide = matches;
  act(() => listeners.forEach((listener) => listener({ matches })));
}

const key = (props: Partial<LastKeyProps> = {}) => render(<LastKey way={null} state="rest" onPress={onPress} {...props} />);

beforeEach(() => {
  wide = false;
  standIn();
  onPress = jest.fn();
});
afterEach(() => {
  cleanup();
  window.matchMedia = ownMatchMedia;
  document.documentElement.classList.remove('setup-bar-fixed');
  document.documentElement.style.removeProperty('--setup-bar');
});

describe("setup's last key", () => {
  it.each([
    [null, 'Open dashboard', 'Opening the dashboard…'],
    ['monitor', 'Open Motion and sound', 'Opening Motion and sound…'],
    ['lost-found', 'Open Lost and Found', 'Opening Lost and Found…'],
    ['security', 'Open People', 'Opening People…'],
    ['wildlife', 'Open Wildlife', 'Opening Wildlife…'],
  ] as const)('names the destination for %s', (id: WayId | null, rest, opening) => {
    const way = id ? WAYS.find((each) => each.id === id) ?? null : null;
    const first = key({ way });
    const button = screen.getByRole('button', { name: rest });
    expect(button.hasAttribute('aria-busy')).toBe(false);
    first.unmount();
    key({ way, state: 'opening' });
    const waiting = screen.getByRole('button');
    expect(words(waiting)).toBe(opening);
    expect(waiting.getAttribute('aria-busy')).toBe('true');
    expect(waiting.getAttribute('aria-disabled')).toBe('true');
    expect(waiting.classList.contains('setup-key--waiting')).toBe(true);
    fireEvent.click(waiting);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('says what was not saved above the key, from its status region', () => {
    const unsaved = key({ state: 'unsaved' });
    const says = unsaved.container.querySelector('.setup-last-says[role="status"]') as HTMLElement;
    expect(says.querySelector('svg.problem-mark')).not.toBeNull();
    expect(words(says)).toBe('This browser did not save setup. SafeOS works for this visit and asks for setup again next time.');
    expect(says.compareDocumentPosition(screen.getByRole('button')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cleanup();
    const rest = key();
    expect(words(rest.container.querySelector('.setup-last-says'))).toBe('');
  });

  it('presses the key at rest and after a refused write', () => {
    const { rerender } = key();
    fireEvent.click(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
    rerender(<LastKey way={null} state="unsaved" onPress={onPress} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it("keeps the page's foot clear of the bar under 768 px, and lets it go from 768 px", () => {
    const root = document.documentElement;
    const { unmount } = key();
    expect(root.classList.contains('setup-bar-fixed')).toBe(true);
    expect(root.style.getPropertyValue('--setup-bar')).not.toBe('');
    fire(true);
    expect(root.classList.contains('setup-bar-fixed')).toBe(false);
    expect(root.style.getPropertyValue('--setup-bar')).toBe('');
    fire(false);
    expect(root.classList.contains('setup-bar-fixed')).toBe(true);
    expect(root.style.getPropertyValue('--setup-bar')).not.toBe('');
    unmount();
    expect(root.classList.contains('setup-bar-fixed')).toBe(false);
    expect(root.style.getPropertyValue('--setup-bar')).toBe('');
  });

  it('follows the width where the media query has only addListener and removeListener', () => {
    listeners = [];
    const removed: Array<(event: { matches: boolean }) => void> = [];
    window.matchMedia = ((query: string) => ({
      get matches() {
        return wide;
      },
      media: query,
      addListener: (listener: (event: { matches: boolean }) => void) => listeners.push(listener),
      removeListener: (listener: (event: { matches: boolean }) => void) => {
        removed.push(listener);
        listeners = listeners.filter((kept) => kept !== listener);
      },
    })) as unknown as typeof window.matchMedia;
    const root = document.documentElement;
    const { unmount } = key();
    expect(root.classList.contains('setup-bar-fixed')).toBe(true);
    expect(listeners).toHaveLength(1);
    fire(true);
    expect(root.classList.contains('setup-bar-fixed')).toBe(false);
    expect(root.style.getPropertyValue('--setup-bar')).toBe('');
    fire(false);
    expect(root.classList.contains('setup-bar-fixed')).toBe(true);
    const heard = listeners[0];
    unmount();
    expect(removed).toEqual([heard]);
    expect(listeners).toEqual([]);
  });
});
