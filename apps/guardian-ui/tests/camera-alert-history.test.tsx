/** @jest-environment jsdom */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MonitorPage from '@/app/monitor/page';
import HistoryPage from '@/app/history/page';
import { NotificationDropdown } from '@/components/NotificationDropdown';
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
    message: 'Camera motion recorded', timestamp: new Date().toISOString(),
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

it('clears monitoring notifications without deleting another producers cached alerts', async () => {
  await cacheAlert({ id: 'engine-owned', streamId: 'engine', severity: 'low',
    message: 'Engine-owned alert', acknowledged: true, createdAt: new Date().toISOString() });
  const view = render(<MonitorPage />);
  await act(async () => {});
  act(() => BrowserSocket.instances.at(-1)!.receive({ type: 'alert', payload: {
    id: 'monitor-owned', message: 'Monitor-owned alert', severity: 'low',
  } }));
  await act(async () => { await useMonitoringStore.getState().hydrateAlerts(); });
  view.unmount();
  render(<NotificationDropdown />);
  fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
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

it('bounds persisted monitoring history and expires old records from other producers', async () => {
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
  expect(await db.count('alert_cache')).toBe(100);
  expect(await db.get('alert_cache', 'retained-engine-alert')).toBeUndefined();
  db.close();
  expect(screen.getByText('Motion 104')).toBeTruthy();
});
