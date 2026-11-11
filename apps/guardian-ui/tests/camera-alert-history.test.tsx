/** @jest-environment jsdom */
import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import MonitorPage from '@/app/monitor/page';
import HistoryPage from '@/app/history/page';
import { useMonitoringStore } from '@/stores/monitoring-store';
import { useSettingsStore } from '@/stores/settings-store';
import { getCachedAlerts } from '@/lib/client-db';
import { BrowserSocket, installCameraBrowser } from './helpers/camera-browser';

require('fake-indexeddb/auto');
Object.defineProperty(global, 'structuredClone', { configurable: true, value: (value: unknown) =>
  require('v8').deserialize(require('v8').serialize(value)),
});
const mockParams = new URLSearchParams();
jest.mock('next/navigation', () => ({ useSearchParams: () => mockParams }));
jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({ config: { wsUrl: 'wss://monitor.example.test' } }),
}));
afterEach(() => { cleanup(); jest.restoreAllMocks(); });

it('writes a received monitor alert to IndexedDB and restores it in History after reload', async () => {
  installCameraBrowser();
  useMonitoringStore.getState().reset();
  useSettingsStore.setState({ globalMute: true });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ alerts: [] }) });
  const view = render(<MonitorPage />);
  await act(async () => {});
  act(() => BrowserSocket.instances.at(-1)!.receive({ type: 'alert', payload: {
    id: 'persistent-camera-alert', streamId: 'camera-session', severity: 'low',
    message: 'Camera motion recorded', timestamp: '2026-11-11T10:00:00.000Z',
  } }));
  expect(screen.getByText('Camera motion recorded')).toBeTruthy();
  await waitFor(async () => {
    expect(await getCachedAlerts()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'persistent-camera-alert', message: 'Camera motion recorded' }),
    ]));
  });
  view.unmount();
  // A fresh document loses the in-memory store, but retains the browser database.
  useMonitoringStore.setState({ alerts: [] });
  render(<HistoryPage />);
  const { fireEvent } = await import('@testing-library/react');
  fireEvent.click(screen.getByRole('button', { name: /Local Timeline/i }));
  expect(await screen.findByText('Camera motion recorded')).toBeTruthy();
});
