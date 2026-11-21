/** @jest-environment jsdom */
/**
 * The four ways to watch can be reached from the dashboard, in one order:
 * Motion and sound, Lost and Found, People and Wildlife, each a link to its
 * page; before setup each opens setup with its way named.
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

// An address without its closing slash; a query stays as it is.
const path = (link: HTMLElement) => (link.getAttribute('href') || '').replace(/\/$/, '');
const words = (element: Element | null) => (element?.textContent || '').replace(/\s+/g, ' ').trim();

/** Each way's name and the address its link opens, in the order the dashboard lists them. */
async function ways(readKey: string): Promise<Array<[string, string]>> {
  const section = await screen.findByRole('region', { name: 'Ways to watch' });
  // The rows open setup once the device is read; its key shows then.
  await screen.findByRole(readKey === 'Start setup' ? 'link' : 'button', { name: readKey });
  return within(section).getAllByRole('link').map((link): [string, string] => [words(link.querySelector('.way__name')), path(link)]);
}

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    media: query,
    matches: false,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => true,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  replace.mockClear();
  global.fetch = jest.fn().mockRejectedValue(new TypeError('Offline'));
});
afterEach(cleanup);

it('lists the four ways on a dashboard opened after setup, each a link to its page', async () => {
  useOnboardingStore.setState({
    isComplete: true,
    selectedScenario: 'pet',
    acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
  });
  render(<DashboardPage />);
  expect(await ways('Start watching')).toEqual([
    ['Motion and sound', '/monitor'],
    ['Lost and Found', '/lost-found'],
    ['People', '/security'],
    ['Wildlife', '/wildlife'],
  ]);
  expect(replace).not.toHaveBeenCalled();
});

it('before setup each way opens setup with its way named', async () => {
  useOnboardingStore.getState().reset();
  render(<DashboardPage />);
  expect(await ways('Start setup')).toEqual([
    ['Motion and sound', '/setup?next=monitor'],
    ['Lost and Found', '/setup?next=lost-found'],
    ['People', '/setup?next=security'],
    ['Wildlife', '/setup?next=wildlife'],
  ]);
  expect(replace).not.toHaveBeenCalled();
});
