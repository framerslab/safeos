/** @jest-environment jsdom */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { openDB, type IDBPDatabase } from 'idb';
import { IDBFactory } from 'fake-indexeddb';
import { BrowserSocket } from './helpers/camera-browser';
import {
  checked, heldToken, holdToken, ids, oldTab, refused, server, session, sessionAnswer, stored, storedVersion, unreachable,
} from './helpers/saved-history';
require('fake-indexeddb/auto');
jest.setTimeout(60000);
Object.defineProperty(global, 'structuredClone', { configurable: true, value: (value: unknown) =>
  require('v8').deserialize(require('v8').serialize(value)),
});
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ back: () => undefined, push: () => undefined }),
}));
const UNSAVED = 'Until you reload, new alerts in this tab are shown but not saved, and acknowledging, dismissing or clearing alerts is not saved.';
const RESTORED = 'Everything already saved comes back as it was after you reload.';
const SLOW = { timeout: 5000 };

async function app() {
  const { Providers } = await import('@/components/Providers');
  const { default: Monitor } = await import('@/app/monitor/page');
  const { default: History } = await import('@/app/history/page');
  const { default: Settings } = await import('@/app/settings/page');
  const { default: NotificationSettings } = await import('@/app/settings/notifications/page');
  const { default: Export } = await import('@/app/export/page');
  const { StatusBanner } = await import('@/components/StatusBanner');
  const { useAuthStore: auth } = await import('@/stores/auth-store');
  const { useMonitoringStore: monitoring } = await import('@/stores/monitoring-store');
  const db = await import('@/lib/client-db');
  const { clearLocalData } = await import('@/lib/local-data');
  const { useSettingsStore: settings } = await import('@/stores/settings-store');
  settings.setState({ globalMute: true });
  return { Providers, Monitor, History, Settings, NotificationSettings, Export, StatusBanner, auth, monitoring, db, clearLocalData, settings };
}
async function expectBundle(expected: string[] = ids) {
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
  expect(JSON.parse(text).alerts.map((a: any) => a.id).sort()).toEqual([...expected].sort());
}
/** The live connection of the page and any other socket the app opens. */
function sockets() {
  BrowserSocket.instances = [];
  Object.defineProperty(global, 'WebSocket', { configurable: true, value: BrowserSocket });
  return {
    open: async () => {
      await waitFor(() => expect(BrowserSocket.instances.some((socket) => socket.onopen)).toBe(true), SLOW);
      act(() => { for (const socket of BrowserSocket.instances) socket.onopen?.(); });
    },
    deliver: (id: string, message: string) => act(() => {
      for (const socket of BrowserSocket.instances) socket.receive({ type: 'alert', payload: { id, streamId: 'camera', severity: 'low', message } });
    }),
    authenticatedWith: (token: string) => BrowserSocket.instances.some((socket) =>
      socket.sent.some((sent) => sent.type === 'authenticate' && sent.payload?.token === token)),
  };
}
const listed = (monitoring: { getState: () => { alerts: Array<{ id: string }> } }) => monitoring.getState().alerts.map((a) => a.id).sort();
/** Another tab opens a later database version, which closes this tab's connection. */
async function laterVersion(): Promise<IDBPDatabase> {
  return openDB('safeos-guardian', (await storedVersion()) + 1);
}
beforeEach(() => {
  jest.resetModules();
  // Keep the renderer's React instance while recreating document-scoped stores.
  jest.doMock('react', () => React);
  global.indexedDB = new IDBFactory();
  localStorage.clear();
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  global.fetch = jest.fn().mockRejectedValue(new TypeError('Offline'));
});
afterEach(() => { cleanup(); jest.restoreAllMocks(); });

it.each(['server expiry', 'server 401', 'local guest expiry'])('shows the same history across a session renewal: %s', async (renewal) => {
  (await oldTab()).close();
  let ended = false;
  if (renewal !== 'local guest expiry') server({
    check: (token) => (ended ? refused : sessionAnswer(token)),
    create: () => sessionAnswer('renewed-token', { id: 'renewed-person', displayName: 'Renewed person' }),
  });
  const { Providers, History, auth, monitoring } = await app();
  await act(async () => { await auth.getState().initialize(); });
  const earlier = auth.getState().profile?.id;
  expect(earlier).toBeTruthy();
  render(<Providers><History /></Providers>);
  fireEvent.click(screen.getByRole('button', { name: /Local Timeline/i }));
  for (const id of ids) expect(await screen.findByText(id)).toBeTruthy();
  const copy = await stored('alert_cache');
  if (renewal === 'server 401') ended = true;
  else {
    const db = await openDB('safeos-guardian');
    await db.put('local_session', { ...session, expiresAt: '2026-10-02T00:00:00Z' });
    db.close();
  }
  await act(async () => {
    auth.setState({ isInitialized: false });
    await auth.getState().initialize();
  });
  expect(auth.getState().profile?.id).toBeTruthy();
  expect(auth.getState().profile?.id).not.toBe(earlier);
  expect(await stored('alert_cache')).toEqual(copy);
  for (const id of ids) expect(await screen.findByText(id)).toBeTruthy();
  await expectBundle();
  expect(await stored('alert_cache')).toEqual(copy);
  await act(async () => {
    monitoring.getState().clearAlerts();
    await monitoring.getState().hydrateAlerts();
  });
  expect((await stored('alert_cache')).filter((alert) => alert.monitoring)).toEqual([]);
});

it('shows history and keeps the session in memory when the session write fails', async () => {
  (await oldTab({ sessions: [] })).close();
  server({ create: () => sessionAnswer('server-token', { id: 'server-person', displayName: 'Server person' }) });
  const { Providers, History, auth, monitoring, db } = await app();
  const put = IDBObjectStore.prototype.put;
  const full = new Set(['local_session']);
  const failing = jest.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<typeof put>) {
    if (full.has(this.name)) throw new DOMException('Storage full', 'QuotaExceededError');
    return put.apply(this, args);
  });
  render(<Providers><History /></Providers>);
  fireEvent.click(screen.getByRole('button', { name: /Local Timeline/i }));
  await act(async () => { await auth.getState().initialize(); });
  for (const id of ids) expect(await screen.findByText(id)).toBeTruthy();
  expect(auth.getState().sessionToken).toBe('server-token');
  expect(db.getDatabaseNotice()).toBeNull();
  full.add('alert_cache');
  await act(async () => {
    monitoring.getState().addAlert({ id: 'raised-while-full', streamId: 'camera', severity: 'low', message: 'Raised while storage was full', acknowledged: false });
    await monitoring.getState().hydrateAlerts();
  });
  expect(screen.getByText('Raised while storage was full')).toBeTruthy();
  expect((await stored('alert_cache')).map((alert) => alert.id)).not.toContain('raised-while-full');
  failing.mockRestore();
  await act(async () => { await monitoring.getState().hydrateAlerts(); });
  expect(screen.getByText('Raised while storage was full')).toBeTruthy();
  expect((await stored('alert_cache')).map((alert) => alert.id)).toContain('raised-while-full');
});

it('behind an older tab, keeps the saved token, signs in with that session’s own answer and shows what arrives', async () => {
  const old = await oldTab();
  try {
    holdToken('saved-token');
    const calls = server();
    const live = sockets();
    const { Providers, Monitor, Export, StatusBanner, auth, monitoring, db } = await app();
    const view = render(<Providers><StatusBanner /><Monitor /></Providers>);
    await waitFor(() => expect(db.getDatabaseNotice()).toMatch(/Close other SafeOS tabs/), SLOW);
    await live.open();
    live.deliver('arrived', 'Arrived behind an older tab');
    expect(await screen.findByText('Arrived behind an older tab')).toBeTruthy();
    expect(listed(monitoring)).toEqual(['arrived']);
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(listed(monitoring)).toEqual(['arrived']);
    fireEvent.click(screen.getByRole('button', { name: 'Expand 1 acknowledged alert' }));
    expect(screen.getByText('Arrived behind an older tab')).toBeTruthy();
    await waitFor(() => expect(auth.getState().profile?.id).toBe(checked.id), SLOW);
    expect(auth.getState().isAuthenticated).toBe(true);
    expect(calls.posts()).toHaveLength(0);
    expect(calls.checks().length).toBeGreaterThan(0);
    expect(calls.checks().filter((call) => call.token !== 'saved-token')).toEqual([]);
    expect(heldToken()).toBe('saved-token');
    expect(live.authenticatedWith('saved-token')).toBe(true);
    expect(await old.get('alert_cache', 'arrived')).toBeUndefined();
    expect(screen.getByText((text) => text.includes(UNSAVED) && text.includes(RESTORED))).toBeTruthy();
    view.unmount();
    render(<Providers><Export /></Providers>);
    expect(screen.queryByText('Please log in')).toBeNull();
  } finally {
    old.close();
  }
});

it('behind an older tab, a tab with no token makes a session as before, and the saved row is used after the reload', async () => {
  const old = await oldTab();
  let closed = false;
  try {
    let reachable = true;
    const calls = server({
      check: (token) => (reachable ? sessionAnswer(token) : unreachable()),
      create: () => sessionAnswer('blocked-new', { id: 'blocked-person', displayName: 'Blocked person' }),
    });
    const live = sockets();
    const first = await app();
    const view = render(<first.Providers><first.StatusBanner /><first.Monitor /></first.Providers>);
    await waitFor(() => expect(first.db.getDatabaseNotice()).toMatch(/Close other SafeOS tabs/), SLOW);
    await waitFor(() => expect(calls.posts()).toHaveLength(1), SLOW);
    await waitFor(() => expect(first.auth.getState().sessionToken).toBe('blocked-new'), SLOW);
    expect(heldToken()).toBe('blocked-new');
    await live.open();
    expect(live.authenticatedWith('blocked-new')).toBe(true);
    expect(calls.posts()).toHaveLength(1);
    expect((await old.getAll('local_session')).map((row) => row.id)).toEqual(['saved-session']);
    view.unmount();
    old.close();
    closed = true;
    await waitFor(async () => expect(await storedVersion()).toBe(7), SLOW);
    reachable = false;
    jest.resetModules();
    const next = await app();
    await act(async () => { await next.auth.getState().initialize(); });
    expect(next.auth.getState().sessionToken).toBe('saved-token');
    expect(next.auth.getState().profile?.id).toBe('returning-person');
  } finally {
    if (!closed) old.close();
  }
});

it('keeps the list, the session and server alerts when a later version closes this tab', async () => {
  (await oldTab()).close();
  server();
  const live = sockets();
  const { Providers, Monitor, StatusBanner, auth, monitoring, db } = await app();
  render(<Providers><StatusBanner /><Monitor /></Providers>);
  for (const id of ids) expect(await screen.findByText(id)).toBeTruthy();
  await waitFor(() => expect(auth.getState().profile?.id).toBe(checked.id), SLOW);
  await live.open();
  const held = { profile: auth.getState().profile?.id, token: auth.getState().sessionToken };
  const newer = await laterVersion();
  try {
    await waitFor(() => expect(db.getDatabaseNotice()).toMatch(/updated in another tab/), SLOW);
    for (const id of ids) expect(screen.getByText(id)).toBeTruthy();
    expect({ profile: auth.getState().profile?.id, token: auth.getState().sessionToken }).toEqual(held);
    live.deliver('arrived', 'Arrived after the update');
    expect(await screen.findByText('Arrived after the update')).toBeTruthy();
    await act(async () => {
      monitoring.getState().acknowledgeAlert('saved-one');
      await monitoring.getState().hydrateAlerts();
    });
    expect(listed(monitoring)).toEqual(['arrived', ...ids].sort());
    await act(async () => {
      monitoring.getState().removeAlert('saved-two');
      await monitoring.getState().hydrateAlerts();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Expand 1 acknowledged alert' }));
    expect(screen.getByText('saved-one')).toBeTruthy();
    expect(screen.queryByText('saved-two')).toBeNull();
    expect(await newer.get('alert_cache', 'saved-two')).toBeDefined();
    expect(await newer.get('alert_cache', 'arrived')).toBeUndefined();
  } finally {
    newer.close();
  }
});

it.each([
  'B without a profile', 'U with a restored profile', 'U with a restored profile on Settings → Notifications',
])('says a settings change was not saved under a notice: %s', async (state) => {
  const blocked = state.startsWith('B');
  const notifications = state.endsWith('Notifications');
  let old: IDBPDatabase | undefined;
  let newer: IDBPDatabase | undefined;
  try {
    old = await oldTab();
    if (blocked) holdToken('held-token');
    else { old.close(); old = undefined; }
    const calls = server({ check: blocked ? () => ({ ok: false, status: 500 }) : unreachable });
    const { Providers, Settings, NotificationSettings, StatusBanner, auth, db } = await app();
    const Page = notifications ? NotificationSettings : Settings;
    render(<Providers><StatusBanner /><Page /></Providers>);
    await act(async () => { await auth.getState().initialize(); });
    if (blocked) {
      await waitFor(() => expect(db.getDatabaseNotice()).toMatch(/Close other SafeOS tabs/), SLOW);
      expect(auth.getState().profile).toBeNull();
    } else {
      await waitFor(() => expect(auth.getState().profile?.id).toBe('returning-person'), SLOW);
      newer = await laterVersion();
      await waitFor(() => expect(db.getDatabaseNotice()).toMatch(/updated in another tab/), SLOW);
    }
    if (notifications) {
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(await screen.findByText('Notification settings were not saved to your profile. Reload this page, then save again.')).toBeTruthy();
      expect(screen.queryByText('Notification settings saved.')).toBeNull();
      expect(screen.queryByText('Saved locally. Sync to server failed — will retry next time you connect.')).toBeNull();
      expect(calls.calls.filter((call) => call.method === 'PATCH')).toEqual([]);
    } else {
      const name = screen.getByText('Display Name').parentElement!.querySelector('input')!;
      fireEvent.change(name, { target: { value: 'Changed name' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
      expect(await screen.findByText('Failed to save settings.')).toBeTruthy();
      expect(screen.queryByText('Settings saved!')).toBeNull();
    }
    if (!blocked) expect(auth.getState().profile?.displayName).toBe('Returning person');
  } finally {
    old?.close();
    newer?.close();
  }
});

it('refuses sign-out and Clear All Local Data under a notice', async () => {
  (await oldTab()).close();
  const calls = server();
  const { Providers, Monitor, StatusBanner, auth, monitoring, db, clearLocalData, settings } = await app();
  render(<Providers><StatusBanner /><Monitor /></Providers>);
  for (const id of ids) expect(await screen.findByText(id)).toBeTruthy();
  await waitFor(() => expect(auth.getState().profile?.id).toBe(checked.id), SLOW);
  const newer = await laterVersion();
  try {
    await waitFor(() => expect(db.getDatabaseNotice()).toMatch(/updated in another tab/), SLOW);
    const held = { profile: auth.getState().profile?.id, token: auth.getState().sessionToken };
    await expect(auth.getState().logout()).rejects.toThrow();
    await expect(clearLocalData()).rejects.toThrow();
    expect(calls.calls.filter((call) => call.method === 'DELETE')).toEqual([]);
    // The page muted its sounds, which is not the default; a refused clear leaves that alone.
    expect(settings.getState().globalMute).toBe(true);
    expect({ profile: auth.getState().profile?.id, token: auth.getState().sessionToken }).toEqual(held);
    expect(listed(monitoring)).toEqual([...ids].sort());
  } finally {
    newer.close();
  }
});
