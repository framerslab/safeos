/** @jest-environment jsdom */
/**
 * Before React starts
 *
 * A page whose own script files are gone never starts React. The script that
 * runs first in the page reloads it once onto the newest build when one of the
 * app's files fails to load: once for each build within five minutes, by the
 * rule the error pages follow, and never for a file that is not the app's.
 */

import { STALE_BUILD_RECOVERY } from '@/lib/stale-build-script';

const KEY = 'safeos-stale-build-reload';
const saved = () => JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as { at: number; build: string } | null;

function element(tag: 'script' | 'link', address: string, attributes: Record<string, string> = {}): HTMLElement {
  const made = document.createElement(tag);
  made.setAttribute(tag === 'script' ? 'src' : 'href', address);
  for (const [name, value] of Object.entries(attributes)) made.setAttribute(name, value);
  document.body.appendChild(made);
  return made;
}

let runtime: HTMLScriptElement;
beforeAll(() => {
  // Once, as the page runs it: the listener stays for the page's life.
  new Function(STALE_BUILD_RECOVERY)();
  runtime = document.createElement('script');
  runtime.setAttribute('src', '/_next/static/chunks/webpack-aaaa1111.js');
  document.head.appendChild(runtime);
});
beforeEach(() => {
  sessionStorage.clear();
  document.body.innerHTML = '';
});

it('reloads once for a missing app script, for the build the page came from', () => {
  const missing = element('script', '/_next/static/chunks/main-app-old.js');
  missing.dispatchEvent(new Event('error'));
  const first = saved();
  expect(first?.build).toBe('/_next/static/chunks/webpack-aaaa1111.js');
  expect(first?.at).toBeGreaterThan(0);

  // A second missing file of the same build within five minutes: no other reload.
  element('link', '/_next/static/css/old.css', { rel: 'stylesheet' }).dispatchEvent(new Event('error'));
  expect(saved()).toEqual(first);
});

it('reloads once more for a newer build within five minutes', () => {
  sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now() - 60_000, build: '/_next/static/chunks/webpack-0000.js' }));
  element('script', '/_next/static/chunks/main-app-old.js').dispatchEvent(new Event('error'));
  expect(saved()?.build).toBe('/_next/static/chunks/webpack-aaaa1111.js');
});

it('reloads for a missing stylesheet, and never for a font or a picture the page preloads', () => {
  element('link', '/_next/static/media/inter-latin.woff2', { rel: 'preload', as: 'font' }).dispatchEvent(new Event('error'));
  element('link', '/_next/static/media/hero.webp', { rel: 'preload', as: 'image' }).dispatchEvent(new Event('error'));
  expect(sessionStorage.getItem(KEY)).toBeNull();
  element('link', '/_next/static/css/old.css', { rel: 'stylesheet' }).dispatchEvent(new Event('error'));
  expect(saved()?.build).toBe('/_next/static/chunks/webpack-aaaa1111.js');
});

it('never reloads for a file that is not the app\'s, or for an error that is not a file\'s', () => {
  element('script', 'https://example.com/other.js').dispatchEvent(new Event('error'));
  element('script', '/sw.js').dispatchEvent(new Event('error'));
  window.dispatchEvent(new ErrorEvent('error', { message: 'A bug' }));
  expect(sessionStorage.getItem(KEY)).toBeNull();
});
