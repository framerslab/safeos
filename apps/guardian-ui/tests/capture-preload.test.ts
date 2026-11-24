/** @jest-environment jsdom */

import { dashboardPreloadScript } from '@/lib/capture-preload';
import type { HomeRun } from '@/lib/home-runs';
import recording from '../public/home/runs/runs.json';

const script = dashboardPreloadScript(recording.runs[0] as unknown as HomeRun);
const original = window.matchMedia;

afterEach(() => {
  window.matchMedia = original;
  document.head.innerHTML = '';
  document.documentElement.className = '';
  delete document.documentElement.dataset.homeOffline;
  jest.restoreAllMocks();
});

function asked(width: number, dark: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query === '(min-width: 1280px)' ? width >= 1280 : dark,
  })) as typeof window.matchMedia;
  new Function(script)();
  return Array.from(document.head.querySelectorAll('link[rel="preload"][as="image"]'), (link) => [
    link.getAttribute('href'), link.getAttribute('type'), link.getAttribute('fetchpriority'),
  ]);
}

it.each([
  [1279, true, '', 'square-dark'],
  [1279, false, '', 'square-light'],
  [1280, true, '', 'wide-dark'],
  [1280, false, '', 'wide-light'],
  [390, true, 'light', 'square-light'],
  [1440, false, 'dark', 'wide-dark'],
])('preloads one poster at %d px with OS dark=%s and site look %s', (width, dark, look, variant) => {
  document.documentElement.className = look;
  expect(asked(width, dark)).toEqual([['/home/runs/dashboard-' + variant + '.webp', 'image/webp', 'high']]);
});

it('preloads the square of the selected look offline at desktop width', () => {
  jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
  document.documentElement.className = 'light';
  expect(asked(1440, true)).toEqual([['/home/runs/dashboard-square-light.webp', 'image/webp', 'high']]);
  expect(document.documentElement.dataset.homeOffline).toBe('true');
});
