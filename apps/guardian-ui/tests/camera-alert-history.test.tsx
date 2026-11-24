/** @jest-environment jsdom */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MonitorPage from '@/app/monitor/page';
import HistoryPage from '@/app/history/page';
import { AlertPanel } from '@/components/AlertPanel';
import { openDB } from 'idb';
import { useMonitoringStore } from '@/stores/monitoring-store';
import { useSettingsStore } from '@/stores/settings-store';
import { cacheAlert, getCachedAlerts } from '@/lib/client-db';
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
beforeEach(async () => {
  installCameraBrowser();
  useMonitoringStore.getState().reset();
  await useMonitoringStore.getState().hydrateAlerts();
  const db = await openDB('safeos-guardian');
  await db.clear('alert_cache');
  db.close();
  useSettingsStore.setState({ globalMute: true });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ alerts: [] }) });
});
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
    message: 'Camera motion recorded', timestamp: '2026-10-01T10:00:00.000Z',
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


it('does not import other alert producers into the monitoring timeline', async () => {
  for (const severity of ['warning', 'emergency']) {
    await cacheAlert({ id: severity, streamId: 'engine', severity,
      message: `Engine ${severity}`, acknowledged: true, createdAt: new Date().toISOString() });
  }
  render(<HistoryPage />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: /Local Timeline/i }));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'History' })).toBeTruthy());
  expect(useMonitoringStore.getState().alerts).toEqual([]);
});

it('clearing the monitor\'s alerts leaves another producer\'s cached alerts', async () => {
  await cacheAlert({ id: 'engine-owned', streamId: 'engine', severity: 'low',
    message: 'Engine-owned alert', acknowledged: true, createdAt: new Date().toISOString() });
  const view = render(<MonitorPage />);
  await act(async () => {});
  act(() => BrowserSocket.instances.at(-1)!.receive({ type: 'alert', payload: {
    id: 'monitor-owned', message: 'Monitor-owned alert', severity: 'low',
  } }));
  await act(async () => { await useMonitoringStore.getState().hydrateAlerts(); });
  view.unmount();
  act(() => { useMonitoringStore.getState().clearAlerts(); });
  await act(async () => { await useMonitoringStore.getState().hydrateAlerts(); });
  expect(await getCachedAlerts()).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'engine-owned' })]));
  expect((await getCachedAlerts()).some(alert => alert.id === 'monitor-owned')).toBe(false);
});

it('restores alert type in the rendered History details', async () => {
  const view = render(<MonitorPage />);
  await act(async () => {});
  act(() => BrowserSocket.instances.at(-1)!.receive({ type: 'alert', payload: {
    id: 'typed-alert', alertType: 'motion', message: 'Typed motion alert', severity: 'low',
  } }));
  await act(async () => { await useMonitoringStore.getState().hydrateAlerts(); });
  view.unmount();
  useMonitoringStore.setState({ alerts: [] });
  render(<HistoryPage />);
  fireEvent.click(screen.getByRole('button', { name: /Local Timeline/i }));
  await screen.findByText('Typed motion alert');
  fireEvent.click(screen.getByRole('button', { name: 'Details' }));
  expect(screen.getByText('Alert Type:').parentElement?.textContent).toContain('motion');
});

it('keeps an alert acknowledged on Monitor in History after reload', async () => {
  const view = render(<MonitorPage />);
  await act(async () => {});
  act(() => BrowserSocket.instances.at(-1)!.receive({ type: 'alert', payload: {
    id: 'acknowledged-alert', message: 'Acknowledged motion alert', severity: 'low',
  } }));
  await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Acknowledge' })[0]); });
  await act(async () => { await useMonitoringStore.getState().hydrateAlerts(); });
  view.unmount();
  useMonitoringStore.setState({ alerts: [] });
  render(<HistoryPage />);
  fireEvent.click(screen.getByRole('button', { name: /Local Timeline/i }));
  expect(await screen.findByText('Acknowledged motion alert')).toBeTruthy();
  expect(useMonitoringStore.getState().alerts.find(a => a.id === 'acknowledged-alert')?.acknowledged).toBe(true);
});

it('acknowledges an alert on this device when the server cannot be reached', async () => {
  localStorage.setItem('safeos_backend_config', JSON.stringify({ apiUrl: 'https://monitor.example.test' }));
  global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  try {
    useMonitoringStore.getState().addAlert({ id: 'offline-ack', streamId: 'camera', severity: 'low',
      message: 'Offline acknowledgement', timestamp: new Date().toISOString(), acknowledged: false });
    render(<AlertPanel />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' })); });
    expect(useMonitoringStore.getState().alerts.find(a => a.id === 'offline-ack')?.acknowledged).toBe(true);
  } finally {
    localStorage.removeItem('safeos_backend_config');
  }
});

it('renders saved and received alerts whose severity the alert panel does not define', async () => {
  await cacheAlert({ id: 'saved-unknown', monitoring: true, streamId: 'camera', severity: 'warning',
    message: 'Saved unknown severity', acknowledged: false, createdAt: new Date().toISOString() });
  render(<MonitorPage />);
  expect(await screen.findByText('Saved unknown severity')).toBeTruthy();
  act(() => BrowserSocket.instances.at(-1)!.receive({ type: 'alert', payload: {
    id: 'received-unknown', message: 'Received unknown severity', severity: 'emergency',
  } }));
  expect(screen.getByText('Received unknown severity')).toBeTruthy();
});

it('bounds persisted monitoring history without pruning other alert producers', async () => {
  await cacheAlert({ id: 'retained-engine-alert', streamId: 'engine', severity: 'low',
    message: 'Engine record', acknowledged: true, createdAt: '2020-01-01T00:00:00.000Z' });
  render(<MonitorPage />);
  await act(async () => {});
  act(() => {
    for (let i = 0; i < 105; i++) {
      BrowserSocket.instances.at(-1)!.receive({ type: 'alert', payload: {
        id: `bounded-${i}`, message: `Motion ${i}`, severity: 'low',
        timestamp: new Date(Date.now() + i).toISOString(),
      } });
    }
  });
  await act(async () => { await useMonitoringStore.getState().hydrateAlerts(); });
  const db = await openDB('safeos-guardian');
  expect(await db.count('alert_cache')).toBe(101);
  expect(await db.get('alert_cache', 'retained-engine-alert')).toBeTruthy();
  db.close();
  expect(screen.getByText('Motion 104')).toBeTruthy();
});

it('keeps an early unacknowledged critical alert on screen while later acknowledged alerts are bounded', async () => {
  useMonitoringStore.getState().addAlert({ id: 'early-critical', streamId: 'camera', severity: 'critical',
    message: 'Early critical alert', acknowledged: false, createdAt: '2026-10-01T10:00:00.000Z' });
  for (let i = 0; i < 100; i++) useMonitoringStore.getState().addAlert({
    id: `later-${i}`, streamId: 'camera', severity: 'low', message: `Later ${i}`, acknowledged: true,
    createdAt: new Date(Date.now() - 1000 + i).toISOString(),
  });
  render(<AlertPanel />);
  expect(screen.getByText('Early critical alert')).toBeTruthy();
  await act(async () => { await useMonitoringStore.getState().hydrateAlerts(); });
  expect(screen.getByText('Early critical alert')).toBeTruthy();
});

it("keeps an alert of a watch that has ended silent, and lets the running watch's alerts sound", async () => {
  const { raisedByThisWatch } = await import('@/lib/watch-sound');
  const { startMonitoring } = await import('./helpers/camera-browser');
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  // The watch runs, its picture seen: the alerts of the watch before it are forgotten by now.
  await waitFor(() => expect(screen.getByText('Stop watching')).toBeTruthy());
  await act(async () => {});
  act(() => useMonitoringStore.getState().setStreamId('stream-b'));

  act(() => BrowserSocket.instances.at(-1)!.receive({ type: 'alert', payload: {
    id: 'late-from-a', streamId: 'stream-a', severity: 'high',
    message: 'Late alert of the ended watch', timestamp: '2026-10-01T10:00:00.000Z',
  } }));
  act(() => BrowserSocket.instances.at(-1)!.receive({ type: 'alert', payload: {
    id: 'from-b', streamId: 'stream-b', severity: 'high',
    message: 'Alert of the running watch', timestamp: '2026-10-01T10:00:01.000Z',
  } }));

  // Both are listed; only the running watch's alert sounds.
  expect(screen.getByText('Late alert of the ended watch')).toBeTruthy();
  expect(screen.getByText('Alert of the running watch')).toBeTruthy();
  expect(raisedByThisWatch('late-from-a')).toBe(false);
  expect(raisedByThisWatch('from-b')).toBe(true);
});
