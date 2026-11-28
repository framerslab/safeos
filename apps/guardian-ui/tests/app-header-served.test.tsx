/** @jest-environment node */
/**
 * The app's header as it is served
 *
 * Renders the header to the HTML a browser gets before any script runs. It is
 * a banner whose row holds the mark as a link to the dashboard and a
 * navigation named "App" with the four destinations; on a phone the brand
 * shows plain, with its name as text. The page being read is marked, the look
 * switch has only its place held, and History carries the count of new
 * alerts beside the problem glyph.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppHeader } from '@/components/app/AppHeader';
import { bare, served, words } from './helpers/served-html';

let mockPath = '/monitor/';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const header = (pathname = '/monitor/', props: { newAlerts?: number } = {}) => {
  mockPath = pathname;
  return served(renderToStaticMarkup(<AppHeader {...props} />));
};

const historyLink = (props: { newAlerts?: number } = {}) =>
  Array.from(header('/monitor/', props).querySelectorAll('.app-header__bar a')).find(
    (link) => bare(link.getAttribute('href')) === '/history'
  );

it('is a banner whose row holds the mark as a link to the dashboard and a navigation named "App" with the four destinations in order', () => {
  const page = header();
  expect(page.querySelectorAll('header.app-header')).toHaveLength(1);
  expect(page.querySelector('header nav')?.getAttribute('aria-label')).toBe('App');
  const row = Array.from(page.querySelectorAll('.app-header__bar a[data-section], .app-header__brand--link'));
  expect(row.map((item) => `${item.getAttribute('aria-label') || words(item)} ${bare(item.getAttribute('href'))}`)).toEqual([
    'SafeOS Guardian, dashboard /dashboard',
    'Dashboard /dashboard',
    'History /history',
    'Settings /settings',
    'Help /help',
  ]);
  const github = page.querySelector('.app-header__github');
  expect(github?.getAttribute('href')).toBe('https://github.com/framerslab/safeos');
  expect(github?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  expect(page.querySelectorAll('.app-header__bar button')).toHaveLength(0);
});

it('opens GitHub in a new tab, so a watch running on the page goes on, and its name says so', () => {
  for (const pathname of ['/monitor/', '/security/', '/wildlife/', '/dashboard/']) {
    const github = header(pathname).querySelector('.app-header__github');
    expect([pathname, github?.getAttribute('target'), github?.getAttribute('rel')]).toEqual([pathname, '_blank', 'noopener noreferrer']);
    expect(github?.getAttribute('aria-label')).toMatch(/^SafeOS on GitHub(?:, [\d,]+ stars?)? \(opens in a new tab\)$/);
  }
});

it('shows the brand plain for a phone, with its name as text', () => {
  const page = header();
  const plain = page.querySelector('.app-header__brand--plain');
  expect(plain?.tagName).toBe('SPAN');
  expect(plain?.querySelector('a')).toBeNull();
  expect(words(plain?.querySelector('.sr-only'))).toBe('SafeOS Guardian');
  expect(plain?.querySelector('.sr-only')?.getAttribute('translate')).toBe('no');
  const brands = Array.from(page.querySelectorAll('.app-header__brand'));
  expect(brands).toHaveLength(2);
  for (const brand of brands) {
    expect(Array.from(brand.querySelectorAll('.wordmark span')).map(words)).toEqual(['SafeOS', 'Guardian']);
    expect(brand.querySelector('.wordmark')?.getAttribute('translate')).toBe('no');
    expect(brand.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  }
});

it('marks the destination being read', () => {
  const current = (pathname: string) =>
    Array.from(header(pathname).querySelectorAll('header [aria-current="page"]')).map(
      (item) => item.getAttribute('aria-label') || words(item)
    );
  expect(current('/history/')).toEqual(['History']);
  expect(current('/settings/detection/')).toEqual(['Settings']);
  expect(current('/dashboard')).toEqual(['Dashboard']);
  expect(current('/monitor/')).toEqual([]);
});

it('holds the look switch\'s place empty before script, so nothing moves when it arrives', () => {
  const page = header();
  const place = page.querySelector('header .look-switch-place');
  expect(place?.getAttribute('aria-hidden')).toBe('true');
  expect(page.querySelector('.look-switch')).toBeNull();
});

it('holds no bell, no keyboard key, no reading page and no way to watch', () => {
  const page = header();
  const banner = page.querySelector('header.app-header');
  expect(words(banner)).not.toMatch(/Monitor|About|FAQ|Blog|GitHub|Star|Lost|Security|Wildlife|People|Sign in/);
  expect(banner?.querySelector('[aria-label="Help"], [aria-label*="otification"]')).toBeNull();
});

it('shows History alone while nothing is new, and the count as words beside the problem glyph when alerts are new', () => {
  const alone = historyLink();
  expect(words(alone)).toBe('History');
  expect(alone?.hasAttribute('aria-label')).toBe(false);
  expect(alone?.querySelector('svg')).toBeNull();

  const three = historyLink({ newAlerts: 3 });
  expect(words(three)).toBe('History 3');
  expect(three?.getAttribute('aria-label')).toBe('History, 3 new alerts');
  const glyph = three?.querySelector('svg');
  expect(glyph).not.toBeNull();
  expect(glyph?.getAttribute('aria-hidden')).toBe('true');

  expect(historyLink({ newAlerts: 1 })?.getAttribute('aria-label')).toBe('History, 1 new alert');

  const many = historyLink({ newAlerts: 120 });
  expect(words(many)).toBe('History 99+');
  expect(many?.getAttribute('aria-label')).toBe('History, 120 new alerts');
});
