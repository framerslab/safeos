/** @jest-environment jsdom */
/**
 * The app's header once its script runs
 *
 * When the row runs short (a narrow window or larger text) it folds: the
 * wordmark leaves first, then Help moves into More, then Settings, and only
 * when nothing else is left does the row scroll inside itself. More opens a
 * panel under the bar that closes on Escape or a press outside, with focus
 * back on More. The header and the phone bar ask no other host for anything.
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AppHeader, foldFor } from '@/components/app/AppHeader';
import { PhoneBar } from '@/components/app/PhoneBar';

let mockPath = '/dashboard/';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const spies: { mockRestore: () => void }[] = [];

// jsdom lays nothing out: the row is made 1000 px wide in a 500 px bar until
// Help leaves it, and 400 px from then on.
function rowFitsFromFoldTwo() {
  spies.push(
    jest.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(() =>
      Number(document.querySelector('header.app-header')?.getAttribute('data-fold') ?? 0) < 2 ? 1000 : 400
    ),
    jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
  );
}

afterEach(() => {
  cleanup();
  while (spies.length) spies.pop()?.mockRestore();
});

it('folds in the order the wordmark, Help, Settings, and scrolls only when nothing else is left', () => {
  expect(foldFor(() => false)).toBe(0);
  expect(foldFor((f) => f < 1)).toBe(1);
  expect(foldFor((f) => f < 2)).toBe(2);
  expect(foldFor((f) => f < 3)).toBe(3);
  expect(foldFor(() => true)).toBe(4);
});

it('moves Help into More when the row runs short, and Escape or a press outside closes More and puts focus back on it', () => {
  mockPath = '/dashboard/';
  rowFitsFromFoldTwo();
  const { container } = render(<AppHeader />);
  const header = container.querySelector('header.app-header') as HTMLElement;
  const more = screen.getByRole('button', { name: 'More' });
  expect(more.getAttribute('aria-expanded')).toBe('false');
  expect(more.getAttribute('aria-controls')).toBe('app-more');
  // jsdom loads no stylesheet, so the row's Help link stays in the document;
  // the stylesheet hides it at this fold.
  expect(header.getAttribute('data-fold')).toBe('2');

  // The panel is the header's own child, outside the bar that scrolls.
  const panel = container.querySelector('#app-more') as HTMLElement;
  expect(panel.parentElement).toBe(header);
  expect(header.querySelector('.app-header__bar')?.contains(panel)).toBe(false);
  expect(screen.getByRole('navigation', { name: 'App' }).contains(panel)).toBe(false);
  expect(panel.hidden).toBe(true);

  fireEvent.click(more);
  expect(panel.hidden).toBe(false);
  expect(more.getAttribute('aria-expanded')).toBe('true');
  expect(within(panel).getAllByRole('link').map((row) => row.textContent)).toEqual(['Help']);

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(panel.hidden).toBe(true);
  expect(more.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(more);

  fireEvent.click(more);
  expect(panel.hidden).toBe(false);
  (document.activeElement as HTMLElement).blur();
  fireEvent.pointerDown(document.body);
  expect(panel.hidden).toBe(true);
  expect(document.activeElement).toBe(more);
});

it('keeps the mark of the page being read on a link that moved into More', () => {
  mockPath = '/help/';
  rowFitsFromFoldTwo();
  const { container } = render(<AppHeader />);
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  const panel = container.querySelector('#app-more') as HTMLElement;
  expect(panel.hidden).toBe(false);
  expect(within(panel).getByRole('link', { name: 'Help' }).getAttribute('aria-current')).toBe('page');
});

it('puts focus back on Settings in the row when the window widens until Settings leaves More', () => {
  mockPath = '/dashboard/';
  // The row's width at each fold, in a bar as wide as room: Settings leaves
  // More at fold 2, in a bar of 800 px; at 500 px both links are in More.
  const widths = [1000, 900, 700, 400, 400];
  let room = 500;
  spies.push(
    jest.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(() =>
      widths[Number(document.querySelector('header.app-header')?.getAttribute('data-fold') ?? 0)]
    ),
    jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => room)
  );
  const { container } = render(<AppHeader />);
  const header = container.querySelector('header.app-header') as HTMLElement;
  expect(header.getAttribute('data-fold')).toBe('3');
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  const panel = container.querySelector('#app-more') as HTMLElement;
  within(panel).getByRole('link', { name: 'Settings' }).focus();

  room = 800;
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
  expect(header.getAttribute('data-fold')).toBe('2');
  expect(within(panel).getAllByRole('link').map((row) => row.textContent)).toEqual(['Help']);
  expect(document.activeElement).toBe(header.querySelector('.app-header__link[data-section="/settings"]'));
});

it('contacts no other host', () => {
  const before = global.fetch;
  const fetch = jest.fn();
  global.fetch = fetch;
  try {
    mockPath = '/dashboard/';
    render(
      <>
        <AppHeader />
        <PhoneBar />
      </>
    );
    expect(fetch).toHaveBeenCalledTimes(0);
  } finally {
    global.fetch = before;
  }
});
