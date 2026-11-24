/** @jest-environment jsdom */
/**
 * Start watching on the notice, after another tab started a watch
 *
 * The notice about alert pictures opens on a device that has not answered
 * it, after the start key asked the other tabs. A tab that started a watch
 * while the notice stood open is asked about again when the person presses
 * Start watching: this tab asks whether to watch here, and its camera is not
 * asked for until the person says so.
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import './helpers/browser-data';
import MonitorPage from '@/app/monitor/page';
import { useAlertPicturesStore } from '@/stores/alert-pictures-store';
import { useMonitoringStore } from '@/stores/monitoring-store';
import { installCameraBrowser, startMonitoring } from './helpers/camera-browser';

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({ config: { wsUrl: 'wss://monitor.example.test' } }),
}));

// What the other tabs answer a start key: no watch at the press; then one started meanwhile.
let mockOtherTabWatches = false;
jest.mock('@/lib/tab-channel', () => ({
  ...jest.requireActual('@/lib/tab-channel'),
  askOtherTabs: jest.fn(async () => (mockOtherTabWatches ? { watching: true, way: 'monitor' } : { watching: false })),
}));

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

it('Start watching on the notice asks first when another tab started a watch while it stood open', async () => {
  useMonitoringStore.getState().reset();
  const { getUserMedia } = installCameraBrowser();
  // The device has not answered the notice about alert pictures.
  useAlertPicturesStore.setState({ noticeAnswered: false });

  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  const notice = await screen.findByRole('dialog', { name: 'Each alert keeps a picture' }, { timeout: 5000 });

  // Another tab starts a watch while the notice stands open.
  mockOtherTabWatches = true;
  fireEvent.click(within(notice).getByRole('button', { name: 'Start watching' }));
  await act(async () => {});

  expect(await screen.findByRole('dialog', { name: 'Watch here instead? The other tab stops.' })).toBeTruthy();
  expect(getUserMedia).not.toHaveBeenCalled();
});
