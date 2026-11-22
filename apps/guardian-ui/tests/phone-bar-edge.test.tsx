/** @jest-environment jsdom */
/**
 * The phone bar's faded edge and its top line
 *
 * With much larger text the three places are wider than the bar, and the bar
 * scrolls inside itself. While places lie past its right edge the bar says so
 * in an attribute, and the stylesheet fades the edge by that attribute, so
 * the fade shows in every browser. At the bar's end, and while the places
 * fit, the attribute is not there. The bar's top line is drawn inside the
 * bar, where a faded edge does not cut it away.
 */

import React from 'react';
import fs from 'fs';
import path from 'path';
import { cleanup, fireEvent, render } from '@testing-library/react';
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

it('says that places lie past its right edge while it scrolls inside itself, and stops at its end', () => {
  barIs(600, 390);
  const { container } = render(<PhoneBar />);
  const bar = theBar(container);
  expect(bar.hasAttribute('data-overflow')).toBe(true);
  scrolled = 210;
  fireEvent.scroll(bar);
  expect(bar.hasAttribute('data-overflow')).toBe(false);
  scrolled = 100;
  fireEvent.scroll(bar);
  expect(bar.hasAttribute('data-overflow')).toBe(true);
});

it('says nothing while its three places fit', () => {
  barIs(390, 390);
  const { container } = render(<PhoneBar />);
  expect(theBar(container).hasAttribute('data-overflow')).toBe(false);
});

it('fades the edge by that attribute in every browser, and draws the top line inside the bar', () => {
  const css = fs
    .readFileSync(path.join(__dirname, '..', 'src', 'styles', 'app.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (selector: string) => {
    const found = css.match(new RegExp(`(?:^|})\\s*${selector.replace(/[.[\]]/g, '\\$&')}\\s*{([^}]*)}`));
    return found ? found[1].replace(/\s+/g, ' ').trim() : '';
  };
  expect(rule('.phone-bar[data-overflow]')).toContain('mask-image: linear-gradient(to right, black calc(100% - 24px), transparent);');
  expect(css).not.toContain('animation-timeline');
  expect(rule('.phone-bar')).toContain('box-shadow: inset 0 1px 0 var(--color-steel-300);');
});
