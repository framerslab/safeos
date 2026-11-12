/** @jest-environment jsdom */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { openDB } from 'idb';
import { IDBFactory } from 'fake-indexeddb';
require('fake-indexeddb/auto');
jest.setTimeout(60000);
Object.defineProperty(global, 'structuredClone', { configurable: true, value: (value: unknown) =>
  require('v8').deserialize(require('v8').serialize(value)),
});
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
const profile = { id: 'returning-person', displayName: 'Returning person', preferences: {}, notificationSettings: {} };
const session = { id: 'saved-session', token: 'saved-token', deviceId: 'browser-device', profile,
  createdAt: '2026-10-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z', syncedAt: null };
const ids = ['saved-one', 'saved-two', 'saved-three'];

async function app() {
  const { Providers } = await import('@/components/Providers');
  const { default: Monitor } = await import('@/app/monitor/page');
  const { default: History } = await import('@/app/history/page');
  const { StatusBanner } = await import('@/components/StatusBanner');
  const { useAuthStore: auth } = await import('@/stores/auth-store');
  const { useMonitoringStore: monitoring } = await import('@/stores/monitoring-store');
  const db = await import('@/lib/client-db');
  const { useSettingsStore } = await import('@/stores/settings-store');
  useSettingsStore.setState({ globalMute: true });
  return { Providers, Monitor, History, StatusBanner, auth, monitoring, db };
}
async function oldTab() {
  const db = await openDB('safeos-guardian', 4, { upgrade(db) {
    db.createObjectStore('local_session', { keyPath: 'id' });
    const alerts = db.createObjectStore('alert_cache', { keyPath: 'id' });
    alerts.createIndex('by-stream', 'streamId');
    alerts.createIndex('by-created', 'createdAt');
  } });
  await db.put('local_session', session);
  for (const id of ids) await db.put('alert_cache', { id, monitoring: true, streamId: 'camera',
    severity: 'low', message: id, createdAt: '2026-10-01T00:00:00Z', acknowledged: false });
  return db;
}
async function expectBundle() {
  let bundle: Blob | undefined;
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn((blob: Blob) => { bundle = blob; return 'blob:bundle'; }) });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  fireEvent.click(screen.getByRole('button', { name: 'Download Bundle (.json)' }));
  await waitFor(() => expect(bundle).toBeDefined());
  const text = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsText(bundle!);
  });
  expect(JSON.parse(text).alerts.map((a: any) => a.id).sort()).toEqual([...ids].sort());
}
beforeEach(() => {
  jest.resetModules();
  // Keep the renderer's React instance while recreating document-scoped stores.
  jest.doMock('react', () => React);
  global.indexedDB = new IDBFactory();
  localStorage.clear();
  global.fetch = jest.fn().mockRejectedValue(new TypeError('Offline'));
});
afterEach(() => { cleanup(); jest.restoreAllMocks(); });

it('does not create or persist a profile while an older tab blocks the database', async () => {
  const old = await oldTab();
  const { Providers, Monitor, StatusBanner, auth, monitoring, db } = await app();
  try {
    render(<Providers><StatusBanner /><Monitor /></Providers>);
    await waitFor(() => expect(db.getDatabaseNotice()).toMatch(/Close other SafeOS tabs/));
    await act(async () => { await auth.getState().initialize(); });
    expect(auth.getState().profile).toBeNull();
    expect(auth.getState().isAuthenticated).toBe(false);
    expect(JSON.parse(localStorage.getItem('safeos-auth')!).state.profile).toBeNull();
    act(() => monitoring.getState().addAlert({ id: 'blocked-live', streamId: 'camera', severity: 'low', message: 'Live only', acknowledged: false }));
    await act(async () => { await monitoring.getState().hydrateAlerts(); });
    expect(screen.getByText(/New alerts in this tab are not saved until you reload/i)).toBeTruthy();
    expect(await old.get('alert_cache', 'blocked-live')).toBeUndefined();
  } finally { old.close(); }
});

it('restores the database profile after a blocked tab reload and shows all old alerts in Monitor, History and offline export', async () => {
  const old = await oldTab();
  const first = await app();
  const blocked = render(<first.Providers><first.Monitor /></first.Providers>);
  await waitFor(() => expect(first.db.getDatabaseNotice()).not.toBeNull());
  await act(async () => { await first.auth.getState().initialize(); });
  blocked.unmount();
  old.close();
  // Wait for the previously blocked upgrade to finish before simulating reload.
  const upgraded = await openDB('safeos-guardian');
  upgraded.close();
  jest.resetModules();
  const next = await app();
  const monitor = render(<next.Providers><next.Monitor /></next.Providers>);
  for (const id of ids) expect(await screen.findByText(id)).toBeTruthy();
  expect(next.auth.getState().profile?.id).toBe(profile.id);
  expect(next.monitoring.getState().alerts.every(a => a.ownerId === profile.id)).toBe(true);
  monitor.unmount();
  render(<next.Providers><next.History /></next.Providers>);
  fireEvent.click(screen.getByRole('button', { name: /Local Timeline/i }));
  for (const id of ids) expect(await screen.findByText(id)).toBeTruthy();
  await expectBundle();
});

it('waits for database session restoration before claiming ownerless history', async () => {
  const old = await oldTab();
  old.close();
  localStorage.setItem('safeos-auth', JSON.stringify({ state: { profile: { ...profile, id: 'unverified-profile' } }, version: 0 }));
  const { Providers, History, auth, monitoring } = await app();
  render(<Providers><History /></Providers>);
  fireEvent.click(screen.getByRole('button', { name: /Local Timeline/i }));
  for (const id of ids) expect(await screen.findByText(id)).toBeTruthy();
  expect(auth.getState().profile?.id).toBe(profile.id);
  expect(monitoring.getState().alerts.every(a => a.ownerId === profile.id)).toBe(true);
});

it('keeps history visible, exportable and clearable after session expiry changes the profile', async () => {
  const old = await oldTab();
  old.close();
  const { Providers, History, auth, monitoring } = await app();
  const first = render(<Providers><History /></Providers>);
  await waitFor(() => expect(monitoring.getState().alerts).toHaveLength(ids.length));
  first.unmount();
  const db = await openDB('safeos-guardian');
  await db.put('local_session', { ...session, expiresAt: '2026-10-02T00:00:00Z' });
  db.close();
  auth.setState({ isInitialized: false });
  monitoring.setState({ alerts: [] });
  render(<Providers><History /></Providers>);
  fireEvent.click(screen.getByRole('button', { name: /Local Timeline/i }));
  await waitFor(() => expect(auth.getState().profile?.id).not.toBe(profile.id));
  await waitFor(() => expect(monitoring.getState().alerts).toHaveLength(ids.length));
  for (const id of ids) expect(await screen.findByText(id)).toBeTruthy();
  await expectBundle();
  await act(async () => { monitoring.getState().clearAlerts(); await monitoring.getState().hydrateAlerts(); });
  expect(monitoring.getState().alerts).toEqual([]);
  const stored = await openDB('safeos-guardian');
  expect(await stored.count('alert_cache')).toBe(0);
  stored.close();
});

it('does not give the next person history after an explicit sign-out', async () => {
  const old = await oldTab();
  old.close();
  const { Providers, History, auth, monitoring } = await app();
  const first = render(<Providers><History /></Providers>);
  await waitFor(() => expect(monitoring.getState().alerts).toHaveLength(ids.length));
  first.unmount();
  await act(async () => { await auth.getState().logout(); await auth.getState().createSession('Next person'); });
  render(<Providers><History /></Providers>);
  fireEvent.click(screen.getByRole('button', { name: /Local Timeline/i }));
  await act(async () => { await monitoring.getState().hydrateAlerts(); });
  expect(auth.getState().profile?.id).not.toBe(profile.id);
  expect(monitoring.getState().alerts).toEqual([]);
  for (const id of ids) expect(screen.queryByText(id)).toBeNull();
});
