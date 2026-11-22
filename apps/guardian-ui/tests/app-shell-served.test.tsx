/** @jest-environment node */
/**
 * An app page as it is served
 *
 * Renders the shell to the HTML a browser gets before any script runs. Every
 * app page reads before its script runs: the app's header with its links, the
 * phone bar with its three places and the site footer are all in that HTML,
 * none of them hidden and none held to a style a script would lift. The look
 * switch has only its place held. A page built in the readable look is marked
 * on its shell; every other app page marks its header, footer and bar alone.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteShell } from '@/components/layout/SiteShell';
import { bare, served } from './helpers/served-html';

let mockPath = '/history/';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
// The shell's status line reads the server's state from its provider, which
// the root layout mounts.
jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({
    status: { api: 'disconnected', ollama: 'disconnected' },
    isLocalOnly: true,
    retry: jest.fn(),
    config: { apiUrl: '', wsUrl: '' },
  }),
}));

const markupAt = (pathname: string) => {
  mockPath = pathname;
  return renderToStaticMarkup(
    <SiteShell>
      <h1>Page</h1>
    </SiteShell>
  );
};
const pageAt = (pathname: string) => served(markupAt(pathname));

it('serves an app page with its header, its phone bar and its footer, none of them waiting for script', () => {
  const markup = markupAt('/history/');
  const page = served(markup);
  const header = page.querySelector('header.app-header');
  const bar = page.querySelector('nav.phone-bar');
  const footer = page.querySelector('footer nav[aria-label="Site links"]');
  expect(header?.querySelectorAll('a')).toHaveLength(5);
  expect(Array.from(bar?.querySelectorAll('a') || []).map((link) => bare(link.getAttribute('href')))).toEqual([
    '/dashboard',
    '/history',
    '/settings',
  ]);
  expect(footer).not.toBeNull();
  expect(markup).not.toContain('opacity-0');
  for (const part of [header, bar, footer]) {
    for (let node: Element | null = part; node && node !== page.body; node = node.parentElement) {
      expect([node.tagName, node.className, node.hasAttribute('hidden'), node.hasAttribute('style')]).toEqual([
        node.tagName,
        node.className,
        false,
        false,
      ]);
    }
  }
});

it("holds the look switch's place and shows no switch before script", () => {
  const page = pageAt('/history/');
  expect(page.querySelector('header.app-header .look-switch-place')).not.toBeNull();
  expect(page.querySelector('.look-switch')).toBeNull();
});

it('marks a page built in the readable look on its shell, and every other app page on its header, footer and bar alone', () => {
  const dashboard = pageAt('/dashboard/').body.firstElementChild;
  expect(['app-shell', 'app-shell--look', 'look-part'].filter((name) => dashboard?.classList.contains(name))).toEqual([
    'app-shell',
    'app-shell--look',
    'look-part',
  ]);
  const page = pageAt('/history/');
  const shell = page.body.firstElementChild;
  expect(shell?.classList.contains('app-shell')).toBe(true);
  expect(shell?.classList.contains('look-part')).toBe(false);
  for (const selector of ['header.app-header', '.app-shell__footer', 'nav.phone-bar']) {
    expect([selector, page.querySelector(selector)?.classList.contains('look-part')]).toEqual([selector, true]);
  }
});
