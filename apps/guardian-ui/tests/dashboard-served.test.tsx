/** @jest-environment node */
/**
 * The dashboard as it is served
 *
 * Renders the dashboard to the HTML a browser gets before any script runs,
 * before this device is read: its heading, the four ways as working links
 * and the part below, with no key that would do nothing and nothing drawn
 * see-through to wait for the script.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { bare, served, words } from './helpers/served-html';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
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

// No server is connected to this device.
jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({ status: { api: 'disconnected', ollama: 'disconnected' }, config: { apiUrl: '', wsUrl: '' } }),
}));

jest.mock('@/lib/websocket', () => ({
  useWebSocket: jest.fn(() => ({ isConnected: false, sendMessage: jest.fn() })),
}));

it('serves the heading, the four ways and the part below before script runs', () => {
  const html = renderToStaticMarkup(<Dashboard />);
  const page = served(html);

  expect(Array.from(page.querySelectorAll('h1'), (heading) => words(heading))).toEqual(['Not watching']);

  expect(page.querySelectorAll('section.ways')).toHaveLength(1);
  expect(Array.from(page.querySelectorAll('section.ways a'), (link) => bare(link.getAttribute('href')))).toEqual([
    '/setup?next=monitor',
    '/setup?next=lost-found',
    '/setup?next=security',
    '/setup?next=wildlife',
  ]);

  expect(Array.from(page.querySelectorAll('h2'), (heading) => words(heading)).filter((name) => name === 'Since you last looked')).toHaveLength(1);

  expect(page.querySelectorAll('button')).toHaveLength(0);
  expect(html).not.toContain('opacity-0');
});
