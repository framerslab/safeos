/** @jest-environment jsdom */
/**
 * The device's alerts, as every app page reads them
 *
 * One read of the device's four stores says which alerts are new: Motion and
 * sound's records, Lost and Found's and People's frames and Wildlife's
 * sightings, grouped into alerts. Nothing saved before this code first ran
 * counts as new. Mark all as seen marks every record of every new alert in
 * its own store. A tab that saves or marks an alert tells the others, and
 * each reads again, but never while its page is hidden. History carries the
 * count in the header and the phone bar, and a rise is said once.
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { openDB } from 'idb';
import { IDBFactory } from 'fake-indexeddb';
import { stored } from './helpers/saved-history';
import { installTabChannel, type OtherTab } from './helpers/tab-channel-stand-in';

require('fake-indexeddb/auto');
jest.setTimeout(60000);
Object.defineProperty(global, 'structuredClone', { configurable: true, value: (value: unknown) =>
  require('v8').deserialize(require('v8').serialize(value)),
});
jest.mock('next/navigation', () => ({
  usePathname: () => '/settings/',
  useRouter: () => ({ push: () => undefined, replace: () => undefined, back: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({
    status: { api: 'disconnected', ollama: 'disconnected' },
    isLocalOnly: true,
    retry: () => undefined,
    config: { apiUrl: '', wsUrl: '' },
  }),
}));

const SLOW = { timeout: 5000 };
const KEY = 'safeos-history-seen';
const full = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError');

let other: OtherTab;
let clock: number;
/** Each record saved in a case is a second later than the one before. */
const next = () => (clock += 1000);

async function app() {
  const alerts = await import('@/lib/device-alerts');
  const groups = await import('@/lib/alert-groups');
  const db = await import('@/lib/client-db');
  const storageFull = await import('@/lib/storage-full');
  const { SiteShell } = await import('@/components/layout/SiteShell');
  const { useMonitoringStore: monitoring } = await import('@/stores/monitoring-store');
  const { useAnimalAlertStore: animals } = await import('@/stores/animal-alert-store');
  const { useLostFoundStore: lostFound } = await import('@/stores/lost-found-store');

  function Probe() {
    const { status, newAlerts, storageFull: isFull, markAllSeen, readAgain } = alerts.useDeviceAlerts();
    return (
      <section aria-label="probe">
        <p data-testid="status">{status}</p>
        <ul aria-label="new alerts">
          {newAlerts.map((alert) => <li key={alert.id}>{groups.alertLine(alert, () => 'T')}</li>)}
        </ul>
        <p data-testid="full">{String(isFull)}</p>
        <button type="button" onClick={() => void markAllSeen()}>mark</button>
        <button type="button" onClick={readAgain}>again</button>
      </section>
    );
  }

  const save = {
    motion: async (id: string) => {
      monitoring.getState().addAlert({
        id, streamId: 'local', severity: 'low', message: 'Motion detected: 60% (threshold: 40%)',
        acknowledged: false, createdAt: new Date(next()).toISOString(),
      });
      // This read waits for the store's queued writes.
      await monitoring.getState().hydrateAlerts();
    },
    pet: (id: string, name: string, type: 'pet' | 'person' | 'other' = 'pet') => db.saveSubjectProfile({
      id, name, type, description: '', fingerprint: {}, referenceImages: [],
      createdAt: new Date(clock).toISOString(), lastActiveAt: null, matchCount: 0,
    }),
    frame: (id: string, pet: string, extra: Partial<import('@/lib/client-db').MatchFrameDB> = {}) => db.saveMatchFrame(matchFrame(id, pet, extra)),
    person: (id: string, count = 1) => db.saveIntrusionFrame(peopleFrame(id, count)),
    sighting: async (id: string, animal = 'bird') => {
      animals.getState().addDetections([{
        id, type: animal as 'bird', displayName: animal, sizeCategory: 'small', dangerLevel: 'none',
        confidence: 0.9, bbox: [0, 0, 10, 10], timestamp: next(), frameData: `sight:${id}`,
      }]);
    },
  };

  const showProbe = () => render(<alerts.DeviceAlertsProvider><Probe /></alerts.DeviceAlertsProvider>);
  return { alerts, groups, db, storageFull, SiteShell, monitoring, animals, lostFound, Probe, save, showProbe };
}

function matchFrame(id: string, pet: string, extra: object = {}) {
  return {
    id, subjectId: pet, frameData: `frame:${id}`, thumbnailData: `thumb:${id}`, confidence: 80, timestamp: next(),
    details: { colorMatch: 80, dominantMatch: 80, edgeMatch: 80, sizeMatch: 80 },
    region: null, acknowledged: false, notes: '', exported: false, ...extra,
  };
}

function peopleFrame(id: string, count = 1) {
  return {
    id, frameData: `frame:${id}`, thumbnailData: `thumb:${id}`, timestamp: next(), personCount: count, allowedCount: 0,
    detections: [], acknowledged: false, notes: '', exported: false,
  };
}

/** Writes records through a connection of its own, as another tab does. */
async function putOwn(store: string, rows: object[]) {
  const db = await openDB('safeos-guardian');
  try {
    for (const row of rows) await db.put(store, row);
  } finally {
    db.close();
  }
}

const status = () => screen.getByTestId('status').textContent;
const lines = () => within(screen.getByRole('list', { name: 'new alerts' })).queryAllByRole('listitem').map((item) => item.textContent);
const storageFullShown = () => screen.getByTestId('full').textContent;
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));
const ready = () => waitFor(() => expect(status()).toBe('ready'), SLOW);

/** One new alert of each way, saved in this order after a first read on an empty device. */
async function oneOfEach(m: Awaited<ReturnType<typeof app>>) {
  m.showProbe();
  await ready();
  await act(async () => {
    await m.save.motion('motion-1-a');
    await m.save.pet('mittens', 'Mittens');
    await m.save.frame('match-1', 'mittens', { alerted: true });
    await m.save.person('intrusion-1', 1);
    await m.save.sighting('animal-1', 'bird');
  });
  await waitFor(() => expect(lines()).toEqual([
    'Looks like a bird at T', '1 person in view at T', 'Colours like Mittens’s at T', 'Movement at T',
  ]), SLOW);
}

beforeEach(() => {
  jest.resetModules();
  // Keep the renderer's React instance while recreating document-scoped stores.
  jest.doMock('react', () => React);
  global.indexedDB = new IDBFactory();
  localStorage.clear();
  // An hour ago, so no saved time is in the future, where a save would move it to now.
  clock = Date.now() - 60 * 60 * 1000;
  other = installTabChannel().otherTab();
  global.fetch = jest.fn().mockRejectedValue(new TypeError('Offline'));
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  delete (document as unknown as { visibilityState?: string }).visibilityState;
  delete (globalThis as unknown as { BroadcastChannel?: unknown }).BroadcastChannel;
});

it('nothing saved before this code first ran counts as new', async () => {
  const m = await app();
  await m.save.motion('motion-1-a');
  await m.save.motion('motion-2-b');
  await m.save.motion('motion-3-c');
  await m.save.pet('mittens', 'Mittens');
  await m.save.frame('match-1', 'mittens', { alerted: true });
  await m.save.frame('match-2', 'mittens', { alerted: true });

  m.showProbe();
  await ready();
  expect(lines()).toEqual([]);
  expect(JSON.parse(localStorage.getItem(KEY) || 'null')?.sort()).toEqual(['match-1', 'match-2', 'motion-1-a', 'motion-2-b', 'motion-3-c']);

  await act(() => m.save.motion('motion-9-z'));
  await waitFor(() => expect(lines()).toEqual(['Movement at T']), SLOW);
});

it('lists the new alerts of all four ways, newest first', async () => {
  await oneOfEach(await app());
});

it('Mark all as seen marks every record of every way in its own store', async () => {
  const m = await app();
  await oneOfEach(m);
  other.heard.length = 0;

  press('mark');

  await waitFor(() => expect(lines()).toEqual([]), SLOW);
  expect((await stored('alert_cache'))[0].acknowledged).toBe(true);
  const frames = [...(await stored('match_frame')), ...(await stored('intrusion_frame'))];
  expect(frames).toHaveLength(2);
  expect(frames.every((frame) => frame.acknowledged === true)).toBe(true);
  expect(m.animals.getState().detectionHistory[0].acknowledged).toBe(true);
  expect(other.heard).toContainEqual({ type: 'alerts-changed' });
});

it('an alert marked as seen in the alert panel is not new', async () => {
  const m = await app();
  m.showProbe();
  await ready();
  await act(() => m.save.motion('motion-1-a'));
  await waitFor(() => expect(lines()).toEqual(['Movement at T']), SLOW);

  act(() => m.monitoring.getState().acknowledgeAlert('motion-1-a'));

  await waitFor(() => expect(lines()).toEqual([]), SLOW);
});

it("judges a frame saved before the field by Lost and Found's threshold as it is set now", async () => {
  const m = await app();
  m.showProbe();
  await ready();
  await act(() => m.save.pet('mittens', 'Mittens'));
  // Saved before the field: no `alerted`, 80 per cent, 2 seconds apart.
  const first = matchFrame('match-old-1', 'mittens');
  const second = { ...matchFrame('match-old-2', 'mittens'), timestamp: first.timestamp + 2000 };
  await act(() => putOwn('match_frame', [first, second]));

  act(() => m.lostFound.getState().updateSettings({ minConfidenceForAlert: 95 }));
  press('again');
  await wait(1000);
  expect(lines()).toEqual([]);

  act(() => m.lostFound.getState().updateSettings({ minConfidenceForAlert: 70 }));
  press('again');
  await waitFor(() => expect(lines()).toEqual(['Colours like Mittens’s at T']), SLOW);
});

it('takes an alert another tab saved, with no reload', async () => {
  const m = await app();
  m.showProbe();
  await ready();

  await act(() => putOwn('intrusion_frame', [peopleFrame('intrusion-other', 1)]));
  act(() => other.say({ type: 'alerts-changed' }));

  await waitFor(() => expect(lines()).toEqual(['1 person in view at T']), SLOW);
});

it("a mark made in another tab reaches this tab's Motion and sound list", async () => {
  const m = await app();
  m.showProbe();
  await ready();
  await act(() => m.save.motion('motion-1-a'));
  await waitFor(() => expect(lines()).toEqual(['Movement at T']), SLOW);

  const [record] = await stored('alert_cache');
  await act(() => putOwn('alert_cache', [{ ...record, acknowledged: true, acknowledgementOrder: 0 }]));
  act(() => other.say({ type: 'alerts-changed' }));

  await waitFor(() => expect(m.monitoring.getState().alerts[0].acknowledged).toBe(true), SLOW);
  await waitFor(() => expect(lines()).toEqual([]), SLOW);
});

it('does not read while the page is hidden, and reads when it comes back', async () => {
  const m = await app();
  m.showProbe();
  await ready();

  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  await act(() => putOwn('intrusion_frame', [peopleFrame('intrusion-hidden', 1)]));
  act(() => other.say({ type: 'alerts-changed' }));
  await wait(3000);
  expect(lines()).toEqual([]);

  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await waitFor(() => expect(lines()).toEqual(['1 person in view at T']), SLOW);
});

it('says the alerts could not be read, and reads again when asked', async () => {
  const m = await app();
  const refused = jest.spyOn(indexedDB, 'open').mockImplementation(() => {
    throw new Error('refused');
  });

  m.showProbe();
  await waitFor(() => expect(status()).toBe('failed'), SLOW);
  expect(lines()).toEqual([]);
  expect(localStorage.getItem(KEY)).toBeNull();

  refused.mockRestore();
  press('again');
  await ready();
});

it('says when the device is out of room', async () => {
  const m = await app();
  m.showProbe();
  await ready();
  expect(storageFullShown()).toBe('false');

  act(() => m.storageFull.noteStorageFull(full()));

  expect(storageFullShown()).toBe('true');
});

it('keeps a sighting the full device could not store', async () => {
  const m = await app();
  m.showProbe();
  await ready();
  await act(() => m.save.sighting('animal-0', 'deer'));
  await waitFor(() => expect(lines()).toEqual(['Looks like a deer at T']), SLOW);

  // Only Wildlife's list is refused; every other key is written.
  const write = Object.getPrototypeOf(localStorage).setItem as Storage['setItem'];
  jest.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
    if (key === 'safeos-animal-alerts') throw full();
    write.call(localStorage, key, value);
  });
  await act(() => m.save.sighting('animal-1', 'bird'));

  await waitFor(() => {
    expect(lines()).toContain('Looks like a bird at T');
    expect(storageFullShown()).toBe('true');
  }, SLOW);
  press('again');
  await wait(3000);
  expect(lines()).toEqual(['Looks like a bird at T', 'Looks like a deer at T']);
  expect(m.animals.getState().detectionHistory.map((entry) => entry.id)).toEqual(['animal-1', 'animal-0']);
});

it('shows the count on History in the header and the phone bar, and says a rise once', async () => {
  const m = await app();
  const { container } = render(
    <m.SiteShell>
      <h1>Page</h1>
      <m.Probe />
    </m.SiteShell>,
  );
  // The shell's own status region, its last part; the look switch has one of its own.
  const said = () => container.querySelector('.app-shell > [role="status"]')?.textContent;
  const counted = () => screen.queryAllByRole('link', { name: /new alert/ });

  await ready();
  expect(counted()).toHaveLength(0);
  expect(container.querySelector('.app-shell > [role="status"]')).not.toBeNull();
  expect(said()).toBe('');

  await act(() => m.save.motion('motion-1-a'));
  await waitFor(() => expect(screen.queryAllByRole('link', { name: 'History, 1 new alert' })).toHaveLength(2), SLOW);
  for (const link of screen.getAllByRole('link', { name: 'History, 1 new alert' })) expect(link.textContent).toBe('History 1');
  expect(said()).toBe('1 new alert');

  await act(() => m.save.motion('motion-2-b'));
  await waitFor(() => expect(screen.queryAllByRole('link', { name: 'History, 2 new alerts' })).toHaveLength(2), SLOW);
  for (const link of screen.getAllByRole('link', { name: 'History, 2 new alerts' })) expect(link.textContent).toBe('History 2');
  expect(said()).toBe('2 new alerts');

  const both = m.groups.groupAlerts(await m.alerts.readSavedRecords());
  expect(both).toHaveLength(2);
  await act(() => m.alerts.markSeen(both));

  await waitFor(() => expect(counted()).toHaveLength(0), SLOW);
  expect(screen.getAllByRole('link', { name: 'History' })).toHaveLength(2);
  expect(said()).not.toBe('0 new alerts');
});
