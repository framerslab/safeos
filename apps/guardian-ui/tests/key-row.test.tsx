/** @jest-environment jsdom */
/**
 * A row of keys
 *
 * Keys side by side share one row, each at its own width. When they are
 * wider than the row's place the row scrolls inside itself with two arrow
 * keys, Scroll left and Scroll right, and never wraps; an arrow key at its
 * end stays in the order and is inactive. The 404 page's two keys share one
 * such row at every width.
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { KeyRow } from '@/components/KeyRow';
import NotFound from '@/app/not-found';

/** jsdom lays nothing out: the keys need `need` px in a row `room` px wide, scrolled `left` px. */
function giveWidths(size: { need: number; room: number; left?: number }) {
  const spies = [
    jest.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(() => size.need),
    jest.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(() => size.room),
    jest.spyOn(Element.prototype, 'scrollLeft', 'get').mockImplementation(() => size.left ?? 0),
  ];
  return () => spies.forEach((spy) => spy.mockRestore());
}

let scrollBy: jest.Mock;
const setupMatchMedia = window.matchMedia;
/** The test setup's matchMedia, answering `matches` for each query as given. */
function answerMedia(matches: (query: string) => boolean) {
  window.matchMedia = ((query: string) => ({ ...setupMatchMedia(query), matches: matches(query) })) as typeof window.matchMedia;
}
beforeEach(() => {
  scrollBy = jest.fn();
  Object.defineProperty(Element.prototype, 'scrollBy', { configurable: true, writable: true, value: scrollBy });
  answerMedia(() => false);
});
afterEach(() => {
  cleanup();
  delete (Element.prototype as { scrollBy?: unknown }).scrollBy;
  window.matchMedia = setupMatchMedia;
});

function twoKeys() {
  return render(
    <KeyRow>
      <a href="/" className="key key--solid">Go to the home page</a>
      <a href="/help/" className="key key--outline">Help</a>
    </KeyRow>,
  );
}

it('keeps keys that fit in one row with no arrow keys', () => {
  const restore = giveWidths({ need: 260, room: 300 });
  try {
    const { container } = twoKeys();
    expect(container.querySelector('.key-row__keys')?.children).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Scroll left' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Scroll right' })).toBeNull();
    expect(container.querySelector('.key-row')?.getAttribute('data-more')).toBeNull();
  } finally {
    restore();
  }
});

it('scrolls a row wider than its place with its arrow keys, the one at its end inactive', () => {
  const size = { need: 420, room: 300, left: 0 };
  const restore = giveWidths(size);
  try {
    const { container } = twoKeys();
    const row = container.querySelector('.key-row') as HTMLElement;
    expect(row.getAttribute('data-more')).toBe('end');
    const left = screen.getByRole('button', { name: 'Scroll left' });
    const right = screen.getByRole('button', { name: 'Scroll right' });
    expect(left.getAttribute('aria-disabled')).toBe('true');
    expect(right.getAttribute('aria-disabled')).toBeNull();

    fireEvent.click(left);
    expect(scrollBy).not.toHaveBeenCalled();
    fireEvent.click(right);
    expect(scrollBy).toHaveBeenCalledWith({ left: 240, behavior: 'smooth' });

    // Scrolled to its end, the row holds more only before it.
    size.left = 120;
    act(() => {
      container.querySelector('.key-row__keys')?.dispatchEvent(new Event('scroll'));
    });
    expect(row.getAttribute('data-more')).toBe('start');
    expect(screen.getByRole('button', { name: 'Scroll right' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Scroll left' }));
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -240, behavior: 'smooth' });
  } finally {
    restore();
  }
});

it('moves the row at once for a person who asked for reduced motion', () => {
  answerMedia((query) => query.includes('reduce'));
  const restore = giveWidths({ need: 420, room: 300 });
  try {
    twoKeys();
    fireEvent.click(screen.getByRole('button', { name: 'Scroll right' }));
    expect(scrollBy).toHaveBeenCalledWith({ left: 240, behavior: 'auto' });
  } finally {
    restore();
  }
});

it('sets the 404 page\'s two keys side by side in one row', () => {
  const restore = giveWidths({ need: 272, room: 280 });
  try {
    const { container } = render(<NotFound />);
    const keys = container.querySelector('.key-row__keys') as HTMLElement;
    expect(Array.from(keys.children).map((key) => key.textContent?.trim())).toEqual(['Go to the home page', 'Help']);
    expect(container.querySelector('.flex-col')).toBeNull();
  } finally {
    restore();
  }
});
