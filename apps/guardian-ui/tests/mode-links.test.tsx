/** @jest-environment jsdom */
/**
 * Lost & Found, Security and Wildlife can be reached from inside the app: the
 * dashboard's Quick Actions link each of them after Nap Mode, and the header's
 * menu lists them under its four page links. The header row (the page links
 * that show from 1280 px) does not gain them.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import './helpers/browser-data';
import DashboardPage from '@/app/dashboard/page';
import { Nav } from '@/components/layout/Nav';
import { useOnboardingStore } from '@/stores/onboarding-store';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ replace, push: jest.fn(), back: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({ status: { api: 'disconnected', ollama: 'disconnected' }, config: { apiUrl: '', wsUrl: '' } }),
}));

const MODES = [
  { name: 'Lost & Found', href: '/lost-found' },
  { name: 'Security', href: '/security' },
  { name: 'Wildlife', href: '/wildlife' },
];
const path = (link: HTMLElement) => (link.getAttribute('href') || '').replace(/\/$/, '');

beforeEach(() => {
  localStorage.clear();
  replace.mockClear();
  global.fetch = jest.fn().mockRejectedValue(new TypeError('Offline'));
});
afterEach(cleanup);

it('links Lost & Found, Security and Wildlife from the Quick Actions of a dashboard opened after setup', async () => {
  // A person who has finished setup: the page shows the dashboard, not the setup redirect.
  localStorage.setItem('guardian-onboarding-complete', 'true');
  useOnboardingStore.setState({
    isComplete: true,
    selectedScenario: 'pet',
    acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
  });
  render(<DashboardPage />);
  const heading = await screen.findByRole('heading', { name: 'Quick Actions' });
  expect(replace).not.toHaveBeenCalled();
  const panel = within(heading.closest('.panel') as HTMLElement);
  for (const mode of MODES) {
    // The link's name, as a screen reader reads it, starts with the page's name.
    const link = panel.getByRole('link', { name: new RegExp(`^${mode.name}`) });
    expect(path(link)).toBe(mode.href);
  }
  // After Nap Mode, in this order; the cards that were there keep their places.
  expect(panel.getAllByRole('link').map(path)).toEqual(
    ['/monitor', '/nap', '/lost-found', '/security', '/wildlife', '/history', '/settings'],
  );
});

it.each([
  ['a phone', 390],
  ['a desktop', 1024],
])('lists Lost & Found, Security and Wildlife under the four page links in the open header menu at %s width (%i px)', (_, width) => {
  act(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    window.dispatchEvent(new Event('resize'));
  });
  const { container } = render(<Nav />);
  fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
  const menu = container.querySelector('#nav-menu') as HTMLElement;
  expect(menu).not.toBeNull();
  for (const mode of MODES) {
    const link = within(menu).getByRole('link', { name: mode.name });
    expect(path(link)).toBe(mode.href);
  }
  const pages = within(menu).getAllByRole('link').map(path).filter((href) => href.startsWith('/'));
  expect(pages.slice(0, 7)).toEqual(
    ['/dashboard', '/monitor', '/history', '/settings', '/lost-found', '/security', '/wildlife'],
  );
  // The header row itself does not gain them.
  const row = container.querySelector('nav[aria-label="Main"] > div') as HTMLElement;
  for (const mode of MODES) {
    expect(row.querySelector(`a[href="${mode.href}"], a[href="${mode.href}/"]`)).toBeNull();
  }
});
