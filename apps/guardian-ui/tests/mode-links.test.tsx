/** @jest-environment jsdom */
/**
 * Lost & Found, Security and Wildlife can be reached from inside the app: the
 * dashboard's Quick Actions link each of them after Nap Mode.
 */
import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import './helpers/browser-data';
import DashboardPage from '@/app/dashboard/page';
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
