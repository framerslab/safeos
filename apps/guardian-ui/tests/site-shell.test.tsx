/** @jest-environment jsdom */
/**
 * The shell picks the frame by route
 *
 * The home page and the other pages a visitor reads carry the visitor header
 * (the navigation named "Site") and the site footer, and no phone bar. Every
 * app page carries the app's header (the navigation named "App"), the same
 * site footer and, on every app page but Setup, the phone bar (a second
 * navigation named "App"). A page built in the readable look marks its whole
 * body, so it follows the device's light or dark setting before script runs;
 * on the other app pages the header, the footer's wrapper and the phone bar
 * carry the look themselves. No page shows a notification card or an install
 * sheet, whatever the visitor's state, and the skip link moves focus to the
 * main content. Once its script has started the shell marks the document,
 * which hides the line for a page whose script did not start.
 */

import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import './helpers/browser-data';
import { SiteShell } from '@/components/layout/SiteShell';
import { useOnboardingStore } from '@/stores/onboarding-store';

let mockPath = '/';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({
    status: { api: 'disconnected', ollama: 'disconnected' },
    isLocalOnly: true,
    retry: jest.fn(),
    config: { apiUrl: '', wsUrl: '' },
  }),
}));

beforeEach(() => {
  localStorage.clear();
  useOnboardingStore.getState().reset();
  document.documentElement.removeAttribute('data-app-started');
  global.fetch = jest.fn().mockRejectedValue(new TypeError('Offline'));
});
afterEach(() => {
  cleanup();
  jest.useRealTimers();
});

function open(pathname: string) {
  mockPath = pathname;
  return render(
    <SiteShell>
      <main>
        <h1>Page</h1>
      </main>
    </SiteShell>
  );
}

const navigations = (container: HTMLElement) => Array.from(container.querySelectorAll('nav')).map((nav) => nav.getAttribute('aria-label'));

it('gives the home page the visitor header and footer, a skip link to the main content and the device-following look', () => {
  const { container } = open('/');
  expect(navigations(container)).toEqual(['Site', 'Site links']);
  expect(container.querySelector('.visitor-shell.device-look')).not.toBeNull();
  const skip = screen.getByRole('link', { name: 'Skip to content' });
  expect(skip.getAttribute('href')).toBe('#main-content');
  // The skip link is the first control of the page, and its target takes focus.
  expect(container.querySelector('a, button')).toBe(skip);
  const target = container.querySelector('#main-content') as HTMLElement;
  expect(target.getAttribute('tabindex')).toBe('-1');
  expect(target.contains(screen.getByRole('heading', { name: 'Page' }))).toBe(true);
  expect(container.querySelectorAll('main')).toHaveLength(1);
});

it.each(['/faq/', '/privacy', '/about/', '/blog/how-safeos-guardian-works/', '/no-such-page/'])(
  'gives the reading page %s the visitor header and footer and no phone bar',
  (pathname) => {
    const { container } = open(pathname);
    expect(navigations(container)).toEqual(['Site', 'Site links']);
    expect(container.querySelector('.phone-bar')).toBeNull();
    // Only the home page follows the device through CSS with scripts off.
    expect(container.querySelector('.device-look')).toBeNull();
  }
);

it.each(['/dashboard/', '/monitor', '/settings/', '/help/integrations/telegram/', '/tutorial/'])(
  'gives the app page %s the app header, the site footer and the phone bar',
  (pathname) => {
    const { container } = open(pathname);
    expect(navigations(container)).toEqual(['App', 'Site links', 'App']);
    expect(navigations(container)).not.toContain('Site');
    expect(navigations(container)).not.toContain('Main');
    expect(container.querySelectorAll('header.app-header')).toHaveLength(1);
    expect(container.querySelectorAll('footer')).toHaveLength(1);
    // The skip link is the first control of the page, and its target takes focus.
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip.getAttribute('href')).toBe('#main-content');
    expect(container.querySelector('a, button')).toBe(skip);
    const target = container.querySelector('#main-content') as HTMLElement;
    expect(target.getAttribute('tabindex')).toBe('-1');
    expect(target.contains(screen.getByRole('heading', { name: 'Page' }))).toBe(true);
    expect(container.querySelector('.visitor-shell')).toBeNull();
  }
);

it('gives Setup the app header and no phone bar', () => {
  const { container } = open('/setup/');
  expect(navigations(container)).toEqual(['App', 'Site links']);
});

it('marks a page built in the readable look, so its whole body follows the device before script', () => {
  for (const pathname of ['/dashboard/', '/tutorial/', '/monitor/']) {
    const { container } = open(pathname);
    expect([pathname, container.querySelector('.app-shell--look.look-part') !== null]).toEqual([pathname, true]);
    cleanup();
  }
  const { container } = open('/history/');
  expect(container.querySelector('.app-shell--look.look-part')).toBeNull();
  // The parts of the frame carry the look themselves.
  expect(container.querySelector('header.app-header')?.classList.contains('look-part')).toBe(true);
  expect(container.querySelector('.app-shell__footer')?.classList.contains('look-part')).toBe(true);
  expect(container.querySelector('nav.phone-bar')?.classList.contains('look-part')).toBe(true);
  cleanup();
  // Nap Mode's page keeps its own build, outside the look.
  expect(open('/nap/').container.querySelector('.app-shell--look.look-part')).toBeNull();
});

it('marks the document once its script has started', () => {
  expect(document.documentElement.hasAttribute('data-app-started')).toBe(false);
  open('/');
  expect(document.documentElement.getAttribute('data-app-started')).toBe('true');
});

it('notes each address it shows, so a page knows the page before it', async () => {
  const { pathBefore } = await import('@/lib/visit-trail');
  open('/');
  cleanup();
  open('/setup/');
  expect(pathBefore('/setup')).toBe('/');
});

it('shows no notification card and no install sheet on any page, however long a person stays', () => {
  jest.useFakeTimers();
  // A browser that can notify and has not been asked yet.
  const constructor = jest.fn();
  Object.assign(constructor, { permission: 'default', requestPermission: jest.fn() });
  Object.defineProperty(window, 'Notification', { configurable: true, value: constructor });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: new Promise(() => undefined) } });
  act(() => {
    useOnboardingStore.setState({
      isComplete: true,
      selectedScenario: 'pet',
      acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
    });
  });
  for (const pathname of ['/', '/faq/', '/dashboard/', '/history/']) {
    open(pathname);
    act(() => {
      window.dispatchEvent(new Event('beforeinstallprompt'));
      jest.advanceTimersByTime(15_000);
    });
    expect([pathname, screen.queryByText('Enable notifications'), screen.queryByText('Install SafeOS')]).toEqual([pathname, null, null]);
    cleanup();
  }
});
