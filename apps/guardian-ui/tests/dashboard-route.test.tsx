/** @jest-environment jsdom */
/**
 * The dashboard's address
 *
 * /dashboard/ shows the dashboard itself on every device. A device whose
 * setup is not done sees it at its own address, with Start setup as its one
 * key, and is never sent to setup; a device that has finished setup sees it
 * with nothing opened over it. The device's alerts, the browser's answers,
 * the server's status and its socket are stand-ins.
 */

import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import DashboardPage from '@/app/dashboard/page';
import { forgetVisit } from '@/lib/visit-store';
import { useOnboardingStore } from '@/stores/onboarding-store';

// An element's words as a reader takes them.
const words = (element: Element | null | undefined) =>
  (element?.textContent || '').replace(/’/g, "'").replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => '/dashboard/',
}));

jest.mock('@/lib/client-db', () => ({
  ...jest.requireActual('@/lib/client-db'),
  getAllSubjectProfiles: jest.fn(async () => []),
}));

jest.mock('@/lib/device-alerts', () => ({
  useDeviceAlerts: jest.fn(() => ({
    status: 'ready',
    newAlerts: [],
    storageFull: false,
    markAllSeen: async () => undefined,
    readAgain: () => undefined,
  })),
}));

jest.mock('@/lib/browser-asks', () => ({
  useCameraAsk: () => 'granted',
  useNotificationAsk: () => ({ ask: 'granted', request: async () => undefined }),
}));

jest.mock('@/lib/short-lived-storage', () => ({
  ...jest.requireActual('@/lib/short-lived-storage'),
  useStorageEnds: () => false,
}));

jest.mock('@/lib/model-on-device', () => ({
  ...jest.requireActual('@/lib/model-on-device'),
  useModelOnDevice: () => true,
}));

jest.mock('@/lib/tab-channel', () => ({
  ...jest.requireActual('@/lib/tab-channel'),
  useOtherTabWatch: () => false,
}));

jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({ status: { api: 'disconnected', ollama: 'disconnected' }, config: { apiUrl: '', wsUrl: '' } }),
}));

jest.mock('@/lib/websocket', () => ({
  useWebSocket: jest.fn(() => ({ isConnected: false, sendMessage: jest.fn() })),
}));

async function shown() {
  render(<DashboardPage />);
  await act(async () => {});
}

const firstHeadings = () => screen.getAllByRole('heading', { level: 1 }).map((heading) => words(heading));

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
  forgetVisit();
  useOnboardingStore.getState().reset();
  mockPush.mockReset();
  mockReplace.mockReset();
});
afterEach(cleanup);

it('shows the dashboard to a device whose setup is not done, at its own address', async () => {
  await shown();
  expect(mockReplace).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
  expect(firstHeadings()).toEqual(['Not watching']);
  expect(screen.getByRole('link', { name: 'Start setup' })).toBeTruthy();
  expect(words(document.body)).not.toContain('Loading dashboard...');
});

it('shows the dashboard after setup with nothing over it', async () => {
  useOnboardingStore.setState({
    isComplete: true,
    selectedScenario: 'pet',
    acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
  });
  expect(localStorage.getItem('guardian-onboarding-complete')).toBeNull();
  await shown();
  expect(firstHeadings()).toEqual(['Not watching']);
  expect(screen.getByRole('button', { name: 'Start watching' })).toBeTruthy();
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0);
  const page = words(document.body);
  for (const gone of ['Quick Actions', 'Welcome to SafeOS', 'Get Started', 'Active Streams']) {
    expect(page).not.toContain(gone);
  }
});
