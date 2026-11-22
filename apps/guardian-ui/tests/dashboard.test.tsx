/** @jest-environment jsdom */
/**
 * The dashboard
 *
 * One main holds whether this device is watching and its one key, the four
 * ways to watch and the alerts since the person last looked, in that order.
 * A device whose setup is not done sees the same page, with Start setup as
 * its one key and rows that open setup with their way named; a setup record
 * that cannot be read counts as no setup. The saved pets are read once and
 * given to the line and the rows, and the key's place is held until they
 * are. Nothing opens over the page, and a browser that refuses this site's
 * storage gets a new device's state. On a device with its own server
 * connected, the dashboard keeps that server's socket open and adds the
 * alerts it sends; with no server it asks none. The device's alerts, the
 * browser's answers, the server's status, its socket and the window's width
 * are stand-ins.
 */

import React from 'react';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { WaysToWatch } from '@/components/dashboard/WaysToWatch';
import { useBackendStatus } from '@/contexts/BackendStatusContext';
import type { DeviceAlert } from '@/lib/alert-groups';
import { getAllSubjectProfiles, type SubjectProfileDB } from '@/lib/client-db';
import { useDeviceAlerts, type DeviceAlerts } from '@/lib/device-alerts';
import { forgetVisit } from '@/lib/visit-store';
import { rememberWay } from '@/lib/watch-session';
import { useWebSocket } from '@/lib/websocket';
import { useMonitoringStore } from '@/stores/monitoring-store';
import { canSkipOnboarding, useOnboardingStore } from '@/stores/onboarding-store';

// The served-html helpers load jsdom themselves, which this environment
// cannot, so their two readers are written here as they are there: an
// element's words as a reader takes them, with a straight and a curly
// apostrophe as one; an address without its closing slash, which next/link
// drops outside a build.
const words = (element: Element | null | undefined) =>
  (element?.textContent || '').replace(/’/g, "'").replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const bare = (address: string | null | undefined) => (address || '').replace(/(?<=[^/])\/(?=$|[?#])/, '');

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => '/dashboard/',
}));

jest.mock('@/lib/client-db', () => ({
  ...jest.requireActual('@/lib/client-db'),
  getAllSubjectProfiles: jest.fn(),
}));

jest.mock('@/lib/device-alerts', () => ({
  useDeviceAlerts: jest.fn(),
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

// The server this device has connected, if any: none unless a case says so.
jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: jest.fn(),
}));

jest.mock('@/lib/websocket', () => ({
  useWebSocket: jest.fn(() => ({ isConnected: false, sendMessage: jest.fn() })),
}));

// The store's own reading of a setup record, which a case can make throw as
// a damaged record does. The module's exports cannot be spied on in place,
// so the reading is a stand-in that calls the store's own.
jest.mock('@/stores/onboarding-store', () => {
  const actual = jest.requireActual('@/stores/onboarding-store');
  return { ...actual, canSkipOnboarding: jest.fn(actual.canSkipOnboarding) };
});

const { canSkipOnboarding: storeReading } = jest.requireActual<typeof import('@/stores/onboarding-store')>('@/stores/onboarding-store');

const BEFORE_SETUP = 'Set up this device first. Setup asks for the camera and the microphone.';

const savedSubjects = jest.mocked(getAllSubjectProfiles);
const deviceAlerts = jest.mocked(useDeviceAlerts);
const setupReading = jest.mocked(canSkipOnboarding);
const backend = jest.mocked(useBackendStatus);
const socket = jest.mocked(useWebSocket);

type Backend = ReturnType<typeof useBackendStatus>;
const NO_SERVER = { status: { api: 'disconnected', ollama: 'disconnected' }, config: { apiUrl: '', wsUrl: '' } } as unknown as Backend;
const CONNECTED = {
  status: { api: 'connected', ollama: 'disconnected' },
  config: { apiUrl: 'https://server.test', wsUrl: 'wss://server.test/ws' },
} as unknown as Backend;

function finishSetup() {
  useOnboardingStore.setState({
    isComplete: true,
    selectedScenario: 'pet',
    acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
  });
}

/** This device has not finished setup. */
function newDevice() {
  useOnboardingStore.getState().reset();
}

function alertsRead(partial: Partial<DeviceAlerts> = {}): DeviceAlerts {
  return {
    status: 'ready',
    newAlerts: [],
    storageFull: false,
    markAllSeen: jest.fn(async (): Promise<void> => undefined),
    readAgain: jest.fn(),
    ...partial,
  };
}

const minute = (n: number) => new Date(2026, 10, 18, 14, n).getTime();

function movement(id: string, at: number): DeviceAlert {
  return { id, way: 'monitor', at, recordIds: [id], seen: false, what: 'Movement' };
}

const mittens: SubjectProfileDB = {
  id: 'pet-1',
  name: 'Mittens',
  type: 'pet',
  description: '',
  fingerprint: null,
  referenceImages: ['data:image/png;base64,bWl0dGVucw=='],
  createdAt: '2026-11-01T10:00:00.000Z',
  lastActiveAt: null,
  matchCount: 0,
};

async function shown() {
  const view = render(<Dashboard />);
  await act(async () => {});
  return view;
}

const state = () => document.querySelector('section.dash-state') as HTMLElement;
const line = () => document.getElementById('dash-line');
const rows = () => within(document.querySelector('section.ways') as HTMLElement).getAllByRole('link');

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
  setupReading.mockImplementation(storeReading);
  useOnboardingStore.getState().reset();
  finishSetup();
  mockPush.mockReset();
  mockReplace.mockReset();
  // The dashboard reads the saved subjects on every render; a case that
  // holds, fills or refuses the read says so.
  savedSubjects.mockReset();
  savedSubjects.mockResolvedValue([]);
  deviceAlerts.mockReset();
  deviceAlerts.mockReturnValue(alertsRead());
  backend.mockReset();
  backend.mockReturnValue(NO_SERVER);
  socket.mockClear();
  useMonitoringStore.setState({ alerts: [] });
});
afterEach(cleanup);

it('puts the watching state, the ways and the alerts in that order inside one main', async () => {
  await shown();
  const mains = document.querySelectorAll('main');
  expect(mains).toHaveLength(1);
  expect(mains[0].classList.contains('dash')).toBe(true);
  const parts = Array.from(mains[0].children);
  expect(parts.map((part) => ['dash-state', 'ways', 'since'].find((name) => part.classList.contains(name)) ?? part.className)).toEqual([
    'dash-state',
    'ways',
    'since',
  ]);
  expect(screen.getAllByRole('heading', { level: 1 }).map((heading) => words(heading))).toEqual(['Not watching']);
  expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => words(heading))).toEqual(['Ways to watch', 'Since you last looked']);
});

it('shows a new device the dashboard itself, with Start setup and rows that open setup', async () => {
  newDevice();
  await shown();
  expect(words(line())).toBe(BEFORE_SETUP);
  expect(bare(screen.getByRole('link', { name: 'Start setup' }).getAttribute('href'))).toBe('/setup');
  expect(rows().map((row) => bare(row.getAttribute('href')))).toEqual([
    '/setup?next=monitor',
    '/setup?next=lost-found',
    '/setup?next=security',
    '/setup?next=wildlife',
  ]);
  expect(words(document.querySelector('section.since .since__empty'))).toBe('Nothing new since you last looked.');
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
});

it('counts a setup record that cannot be read as no setup', async () => {
  setupReading.mockImplementation(() => {
    throw new Error('damaged');
  });
  await shown();
  expect(screen.getByRole('link', { name: 'Start setup' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Start watching' })).toBeNull();
  expect(words(line())).toBe(BEFORE_SETUP);
});

it("holds the key's place until the device is read", async () => {
  let answer!: (saved: SubjectProfileDB[]) => void;
  savedSubjects.mockReturnValue(
    new Promise<SubjectProfileDB[]>((resolve) => {
      answer = resolve;
    })
  );
  await shown();
  expect(state().getAttribute('data-read')).toBe('no');
  const place = state().querySelector('.dash-key-place') as HTMLElement;
  expect(place).not.toBeNull();
  expect(place.querySelectorAll('button, a')).toHaveLength(0);

  await act(async () => {
    answer([]);
  });
  expect(state().getAttribute('data-read')).toBe('yes');
  expect(within(place).getByRole('button', { name: 'Start watching' })).toBeTruthy();
});

it('reads the saved pets once and gives them to the line and the rows', async () => {
  savedSubjects.mockResolvedValue([mittens]);
  rememberWay('lost-found', 'pet-1');
  await shown();
  expect(words(line())).toBe('Start watching uses Lost and Found, for Mittens.');
  const row = rows().find((link) => words(link.querySelector('.way__name')) === 'Lost and Found') as HTMLElement;
  expect(within(row).getByRole('img', { name: 'Photo of Mittens' })).toBeTruthy();
  expect(savedSubjects).toHaveBeenCalledTimes(1);
});

it('reads the saved pets again when the person comes back to the tab, so a pet another tab deleted is not offered', async () => {
  savedSubjects.mockResolvedValueOnce([mittens]).mockResolvedValue([]);
  rememberWay('lost-found', 'pet-1');
  await shown();
  expect(words(line())).toBe('Start watching uses Lost and Found, for Mittens.');

  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });

  expect(words(line())).toBe('Start watching uses Motion and sound.');
});

it('sends a row opened before setup is read through setup, with the way named', () => {
  render(<WaysToWatch setUp={null} subjects={null} />);
  expect(rows().map((row) => bare(row.getAttribute('href')))).toEqual([
    '/setup?next=monitor',
    '/setup?next=lost-found',
    '/setup?next=security',
    '/setup?next=wildlife',
  ]);
});

it('a pet list that cannot be read counts as none', async () => {
  savedSubjects.mockRejectedValue(new Error('refused'));
  await shown();
  expect(state().getAttribute('data-read')).toBe('yes');
  expect(words(line())).toBe('Start watching uses Motion and sound.');
});

it('passes the number of new alerts to the first screen once they are read', async () => {
  const two = [movement('alert-2', minute(20)), movement('alert-1', minute(10))];
  deviceAlerts.mockReturnValue(alertsRead({ newAlerts: two }));
  await shown();
  expect(words(document.querySelector('p.dash-new'))).toBe('2 new alerts since you last looked.');

  cleanup();
  deviceAlerts.mockReturnValue(alertsRead({ status: 'reading', newAlerts: two }));
  await shown();
  expect(document.querySelector('p.dash-new')).toBeNull();
});

it('opens nothing over the page', async () => {
  expect(localStorage.getItem('guardian-onboarding-complete')).toBeNull();
  await shown();
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0);
  expect(screen.queryByRole('button', { name: 'Get Started' })).toBeNull();
});

it("shows a new device's state, with no error, when the browser refuses its storage", async () => {
  // tests/setup.ts gives the page a storage object of its own, not a
  // Storage, so the refusal is put on that object.
  newDevice();
  const refuse = (): never => {
    throw new DOMException('denied', 'SecurityError');
  };
  const refusals = [
    jest.spyOn(window.localStorage, 'getItem').mockImplementation(refuse),
    jest.spyOn(window.localStorage, 'setItem').mockImplementation(refuse),
    jest.spyOn(window.localStorage, 'removeItem').mockImplementation(refuse),
  ];
  try {
    expect(() => localStorage.getItem('safeos-last-way')).toThrow();
    expect(() => render(<Dashboard />)).not.toThrow();
    await act(async () => {});
    expect(screen.getByRole('link', { name: 'Start setup' })).toBeTruthy();
    expect(words(line())).toBe(BEFORE_SETUP);
    expect(rows().map((row) => words(row.querySelector('.way__name')))).toEqual(['Motion and sound', 'Lost and Found', 'People', 'Wildlife']);
  } finally {
    for (const refusal of refusals) refusal.mockRestore();
  }
});

it("keeps a connected server's socket open and adds the alerts it sends", async () => {
  backend.mockReturnValue(CONNECTED);
  await shown();
  expect(socket).toHaveBeenCalled();
  const [url, options] = socket.mock.calls[socket.mock.calls.length - 1];
  expect(url).toBe('wss://server.test/ws');

  act(() => {
    options?.onMessage?.({ type: 'alert', payload: { id: 'server-1-a', streamId: 's', severity: 'low', message: 'x', acknowledged: false } });
  });
  expect(useMonitoringStore.getState().alerts.map((alert) => alert.id)).toContain('server-1-a');

  const before = document.body.innerHTML;
  act(() => {
    options?.onMessage?.({ type: 'stats', payload: { activeStreams: 4, alertsToday: 9 } });
  });
  expect(document.body.innerHTML).toBe(before);
});

it('asks no server for anything on a device without one', async () => {
  await shown();
  expect(socket).toHaveBeenCalled();
  expect(socket.mock.calls.map(([url]) => url).filter((url) => url !== '')).toEqual([]);
});
