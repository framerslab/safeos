/** @jest-environment jsdom */
/**
 * The shell picks the header and footer by route
 *
 * The home page and the other public pages carry the visitor header (the
 * navigation named "Site") and footer; app screens keep the app's own header
 * (the navigation named "Main"). The home page shows no notification card and
 * no install sheet, whatever the visitor's state, and its skip link moves
 * focus to the main content. Once its script has started the
 * shell marks the document, which hides the home page's line for a page
 * whose script did not start.
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

it.each(['/faq/', '/privacy', '/about/', '/blog/how-safeos-guardian-works/', '/help/integrations/telegram/'])(
  'gives the public page %s the same header and footer',
  (pathname) => {
    const { container } = open(pathname);
    expect(navigations(container).slice(0, 1)).toEqual(['Site']);
    expect(navigations(container)).toContain('Site links');
    expect(navigations(container)).not.toContain('Main');
    // Only the home page follows the device through CSS with scripts off.
    expect(container.querySelector('.device-look')).toBeNull();
  }
);

it.each(['/dashboard/', '/monitor', '/settings/', '/setup/'])('leaves the app screen %s its own header', (pathname) => {
  const { container } = open(pathname);
  expect(navigations(container)).toContain('Main');
  expect(navigations(container)).not.toContain('Site');
  expect(container.querySelector('.visitor-shell')).toBeNull();
});

it('marks the document once its script has started', () => {
  expect(document.documentElement.hasAttribute('data-app-started')).toBe(false);
  open('/');
  expect(document.documentElement.getAttribute('data-app-started')).toBe('true');
});

it('shows no notification card and no install sheet on the home page, before setup or after it, however long the visitor stays', () => {
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
  open('/');
  act(() => {
    window.dispatchEvent(new Event('beforeinstallprompt'));
    jest.advanceTimersByTime(15_000);
  });
  expect(screen.queryByText('Enable notifications')).toBeNull();
  expect(screen.queryByText('Install SafeOS')).toBeNull();
  cleanup();

  // The same visitor on an app screen is asked: the card belongs to the app.
  open('/dashboard/');
  act(() => {
    jest.advanceTimersByTime(15_000);
  });
  expect(screen.queryByText('Enable notifications')).not.toBeNull();
  jest.useRealTimers();
});
