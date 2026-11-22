/** @jest-environment jsdom */
/**
 * A link to History's Local Timeline opens it there
 *
 * On a device that uses a server, History opens on the server's Alerts unless
 * the device holds new alerts. A sighting's Open in History link names the
 * Local Timeline, which holds the sighting, so it opens there whether or not
 * the sighting is new.
 */

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';

require('fake-indexeddb/auto');
jest.setTimeout(30000);
Object.defineProperty(global, 'structuredClone', { configurable: true, value: (value: unknown) =>
  require('v8').deserialize(require('v8').serialize(value)),
});
jest.mock('next/navigation', () => ({
  usePathname: () => '/history/',
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ back: () => undefined, push: () => undefined, replace: () => undefined }),
}));

beforeEach(() => {
  global.indexedDB = new IDBFactory();
  localStorage.clear();
  global.fetch = jest.fn().mockRejectedValue(new TypeError('Offline'));
});
afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
});

async function openHistory() {
  const { Providers } = await import('@/components/Providers');
  const { default: History } = await import('@/app/history/page');
  render(<Providers><History /></Providers>);
}

it('opens on the Local Timeline when the link names it, with no new alert on the device', async () => {
  window.history.pushState({}, '', '/history/?view=local');
  await openHistory();
  expect(await screen.findByText('No local events yet', undefined, { timeout: 5000 })).toBeTruthy();
  expect(screen.getByText('Type:')).toBeTruthy();
});

it('opens on the server\'s Alerts from its own link, with no new alert on the device', async () => {
  window.history.pushState({}, '', '/history/');
  await openHistory();
  expect(await screen.findByRole('button', { name: /Analysis Results/ })).toBeTruthy();
  expect(screen.queryByText('Type:')).toBeNull();
});
