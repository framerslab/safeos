/** @jest-environment jsdom */
/**
 * The phone bar's faded edge and its top line
 *
 * The fixed phone bar carries a scrollable row when the places are wider
 * than it. The row fades its clipped edges and the top line stays across
 * the fixed bar.
 */

import React from 'react';
import fs from 'fs';
import path from 'path';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { PhoneBar } from '@/components/app/PhoneBar';

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const spies: { mockRestore: () => void }[] = [];
let scrolled = 0;

// jsdom lays nothing out: the bar is given its widths and its scroll here.
function barIs(scrollWidth: number, clientWidth: number) {
  scrolled = 0;
  spies.push(
    jest.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(scrollWidth),
    jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(clientWidth),
    jest.spyOn(HTMLElement.prototype, 'scrollLeft', 'get').mockImplementation(() => scrolled)
  );
}

const theBar = (container: HTMLElement) => container.querySelector('nav.phone-bar') as HTMLElement;

afterEach(() => {
  cleanup();
  while (spies.length) spies.pop()?.mockRestore();
});

it('uses the shared arrows and fades only the edge with more places', () => {
  barIs(600, 390);
  const { container } = render(<PhoneBar />);
  const row = theBar(container).querySelector('.key-row') as HTMLElement;
  const keys = row.querySelector('.key-row__keys') as HTMLElement;
  const { getByRole } = within(row);
  expect(row.getAttribute('data-more')).toBe('end');
  expect(getByRole('button', { name: 'Scroll left' }).getAttribute('aria-disabled')).toBe('true');
  scrolled = 210;
  fireEvent.scroll(keys);
  expect(row.getAttribute('data-more')).toBe('start');
  expect(getByRole('button', { name: 'Scroll right' }).getAttribute('aria-disabled')).toBe('true');
  scrolled = 100;
  fireEvent.scroll(keys);
  expect(row.getAttribute('data-more')).toBe('both');
});

it('shows the three places without arrows when they fit', () => {
  barIs(390, 390);
  const { container } = render(<PhoneBar />);
  const bar = within(theBar(container));
  expect(bar.getAllByRole('link')).toHaveLength(3);
  expect(bar.queryByRole('button', { name: 'Scroll right' })).toBeNull();
});

it('draws the top line across the fixed bar', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles', 'app.css'), 'utf8');
  const bar = css.match(/\.phone-bar\s*\{([^}]*)}/)?.[1];
  expect(bar).toContain('position: fixed;');
  expect(bar).toContain('box-shadow: inset 0 1px 0 var(--color-steel-300);');
});
