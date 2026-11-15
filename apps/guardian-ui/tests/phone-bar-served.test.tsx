/** @jest-environment node */
/**
 * The phone bar as it is served
 *
 * Renders the bar to the HTML a browser gets before any script runs: a
 * navigation named "App" with three places, Dashboard, History and
 * Settings, each a link with its glyph hidden from assistive technology and
 * its word under it. The place being read is marked, and History carries the
 * count of new alerts.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PhoneBar } from '@/components/app/PhoneBar';
import { bare, served, words } from './helpers/served-html';

let mockPath = '/monitor/';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const markup = (pathname = '/monitor/', props: { newAlerts?: number } = {}) => {
  mockPath = pathname;
  return renderToStaticMarkup(<PhoneBar {...props} />);
};
const bar = (pathname?: string, props?: { newAlerts?: number }) => served(markup(pathname, props));
const places = (page: Document) => Array.from(page.querySelectorAll('nav.phone-bar a'));

it('is a navigation named "App" with three places in order, each a link whose glyph is hidden from assistive technology', () => {
  const page = bar();
  const nav = page.querySelector('nav.phone-bar');
  expect(nav?.getAttribute('aria-label')).toBe('App');
  expect(places(page).map((place) => `${words(place)} ${bare(place.getAttribute('href'))}`)).toEqual([
    'Dashboard /dashboard',
    'History /history',
    'Settings /settings',
  ]);
  const glyphs = Array.from(nav?.querySelectorAll('svg') || []);
  expect(glyphs).toHaveLength(3);
  for (const glyph of glyphs) expect(glyph.closest('[aria-hidden="true"]')).not.toBeNull();
});

it('is in the served HTML, so it shows and works before script runs', () => {
  const page = served(markup('/history/'));
  expect(places(page).map((place) => bare(place.getAttribute('href')))).toEqual(['/dashboard', '/history', '/settings']);
});

it('marks the place being read and writes its word like the other two', () => {
  const current = (pathname: string) =>
    places(bar(pathname))
      .filter((place) => place.getAttribute('aria-current') === 'page')
      .map((place) => words(place));
  expect(current('/history/')).toEqual(['History']);
  expect(current('/settings/sounds/')).toEqual(['Settings']);
  expect(current('/monitor/')).toEqual([]);
  const wordClasses = Array.from(bar('/history/').querySelectorAll('.phone-bar__word')).map((word) => word.className);
  expect(wordClasses).toHaveLength(3);
  expect(new Set(wordClasses).size).toBe(1);
});

it("puts the count beside History's word", () => {
  const history = places(bar('/monitor/', { newAlerts: 3 })).find((place) => bare(place.getAttribute('href')) === '/history');
  expect(words(history)).toBe('History 3');
  expect(history?.getAttribute('aria-label')).toBe('History, 3 new alerts');
});
