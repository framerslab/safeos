/** @jest-environment jsdom */
/**
 * History lists the alerts of all four ways and marks them as seen
 *
 * Wildlife's sightings join Motion and sound's alerts and the frames of Lost
 * and Found and People in History's list. Opening History marks every new
 * alert as seen, once for each opening, so an alert that arrives while it is
 * open stays new. History takes what another tab saved without its loading
 * wheel, and a record whose dates do not parse is listed, last, with no time.
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
  usePathname: () => '/history/',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ back: () => undefined, push: () => undefined, replace: () => undefined }),
}));

const SLOW = { timeout: 5000 };
const KEY = 'safeos-history-seen';
const PICTURE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

let other: OtherTab;
let clock: number;
const next = () => (clock += 1000);

async function app() {
  const alerts = await import('@/lib/device-alerts');
  const groups = await import('@/lib/alert-groups');
  const db = await import('@/lib/client-db');
  const { Providers } = await import('@/components/Providers');
  const { default: History } = await import('@/app/history/page');
  const { useMonitoringStore: monitoring } = await import('@/stores/monitoring-store');
  const { useAnimalAlertStore: animals } = await import('@/stores/animal-alert-store');
  const { useSettingsStore: settings } = await import('@/stores/settings-store');
  settings.setState({ globalMute: true });

  function Probe() {
    const { status, newAlerts } = alerts.useDeviceAlerts();
    return (
      <section aria-label="probe">
        <p data-testid="status">{status}</p>
        <ul aria-label="new alerts">
          {newAlerts.map((alert) => <li key={alert.id}>{groups.alertLine(alert, () => 'T')}</li>)}
        </ul>
      </section>
    );
  }

  const save = {
    motion: async (id: string) => {
      monitoring.getState().addAlert({
        id, streamId: 'local', severity: 'low', message: 'Motion detected: 60% (threshold: 40%)',
        acknowledged: false, createdAt: new Date(next()).toISOString(),
      });
      await monitoring.getState().hydrateAlerts();
    },
    pet: (id: string, name: string) => db.saveSubjectProfile({
      id, name, type: 'pet', description: '', fingerprint: {}, referenceImages: [],
      createdAt: new Date(clock).toISOString(), lastActiveAt: null, matchCount: 0,
    }),
    frame: (id: string, pet: string) => db.saveMatchFrame({
      id, subjectId: pet, frameData: PICTURE, thumbnailData: PICTURE, confidence: 80, timestamp: next(),
      details: { colorMatch: 80, dominantMatch: 80, edgeMatch: 80, sizeMatch: 80 },
      region: null, acknowledged: false, notes: '', exported: false, alerted: true,
    }),
    person: (id: string) => db.saveIntrusionFrame(peopleFrame(id)),
    sighting: async (id: string) => {
      animals.getState().addDetections([{
        id, type: 'bird', displayName: 'Bird', sizeCategory: 'small', dangerLevel: 'none',
        confidence: 0.9, bbox: [0, 0, 10, 10], timestamp: next(), frameData: PICTURE,
      }]);
    },
  };

  /** History as the app mounts it, with a probe of the same alerts beside it; Local Timeline pressed. */
  const openHistory = () => {
    render(
      <Providers>
        <alerts.DeviceAlertsProvider>
          <History />
          <Probe />
        </alerts.DeviceAlertsProvider>
      </Providers>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Local Timeline/i }));
  };

  /** This code has run once on the device: what it held then is written. */
  const firstRun = async () => {
    const shown = render(<alerts.DeviceAlertsProvider><Probe /></alerts.DeviceAlertsProvider>);
    await waitFor(() => expect(localStorage.getItem(KEY)).not.toBeNull(), SLOW);
    shown.unmount();
  };

  return { alerts, groups, db, monitoring, animals, save, openHistory, firstRun };
}

function peopleFrame(id: string) {
  return {
    id, frameData: PICTURE, thumbnailData: PICTURE, timestamp: next(), personCount: 1, allowedCount: 0,
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

const probeLines = () => within(screen.getByRole('list', { name: 'new alerts' })).queryAllByRole('listitem').map((item) => item.textContent);
/** The entry in History's list that holds these words. */
const entryOf = (words: string) => screen.getByText(words).closest('div.rounded-xl') as HTMLElement;
/** The time an entry shows, at its top right. */
const timeOf = (entry: HTMLElement) => entry.querySelector('.whitespace-nowrap')?.textContent ?? '';

/** History opened on a device that holds one new alert of each way; it marks them. */
async function openedOnFourNew(m: Awaited<ReturnType<typeof app>>) {
  await m.firstRun();
  await act(async () => {
    await m.save.motion('motion-1-a');
    await m.save.pet('mittens', 'Mittens');
    await m.save.frame('match-1', 'mittens');
    await m.save.person('intrusion-1');
    await m.save.sighting('animal-1');
  });

  m.openHistory();

  await waitFor(async () => {
    expect((await stored('alert_cache')).map((record) => record.acknowledged)).toEqual([true]);
    expect((await stored('match_frame')).map((record) => record.acknowledged)).toEqual([true]);
    expect((await stored('intrusion_frame')).map((record) => record.acknowledged)).toEqual([true]);
    expect(m.animals.getState().detectionHistory.map((entry) => entry.acknowledged)).toEqual([true]);
  }, SLOW);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Unacknowledged only' }));
  await waitFor(() => expect(screen.getByText('No local events yet')).toBeTruthy(), SLOW);
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
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  global.fetch = jest.fn().mockRejectedValue(new TypeError('Offline'));
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  delete (globalThis as unknown as { BroadcastChannel?: unknown }).BroadcastChannel;
});

it('lists a Wildlife sighting with its picture and its time', async () => {
  const m = await app();
  await act(() => m.save.sighting('animal-1'));

  m.openHistory();

  const entry = await waitFor(() => entryOf('Looks like a bird'), SLOW);
  expect(within(entry).getByText('Wildlife')).toBeTruthy();
  expect(entry.querySelector('img')?.getAttribute('src')).toBe(PICTURE);
  expect(timeOf(entry)).not.toBe('');
});

it('marks every new alert as seen when it opens', async () => {
  await openedOnFourNew(await app());
  await waitFor(() => expect(probeLines()).toEqual([]), SLOW);
});

it('does not mark an alert that arrives while it is open', async () => {
  const m = await app();
  await openedOnFourNew(m);

  // A minute later, so the frame starts an alert of its own and joins no run that was marked.
  clock += 60_000;
  await act(() => m.save.person('intrusion-late'));

  const entry = await waitFor(() => entryOf('Security Intrusion'), SLOW);
  expect(within(entry).getByText('Unacknowledged')).toBeTruthy();
  await waitFor(() => expect(probeLines()).toEqual(['1 person in view at T']), SLOW);
  const late = (await stored('intrusion_frame')).find((record) => record.id === 'intrusion-late');
  expect(late?.acknowledged).toBe(false);
});

it('takes an alert another tab saved without its loading wheel', async () => {
  const m = await app();
  await m.firstRun();
  m.openHistory();
  await waitFor(() => expect(screen.getByText('No local events yet')).toBeTruthy(), SLOW);

  // Whether the loading wheel shows at any moment between the word and the entry.
  let wheel = false;
  const watch = new MutationObserver(() => {
    if (document.querySelector('.animate-spin')) wheel = true;
  });
  watch.observe(document.body, { childList: true, subtree: true });
  await act(() => putOwn('intrusion_frame', [peopleFrame('intrusion-other')]));
  act(() => other.say({ type: 'alerts-changed' }));

  await waitFor(() => expect(entryOf('Security Intrusion')).toBeTruthy(), SLOW);
  watch.disconnect();
  expect(wheel).toBe(false);
  expect(document.querySelector('.animate-spin')).toBeNull();
});

it("a press on a sighting's key marks it as seen and tells the other tabs", async () => {
  const m = await app();
  // Saved before this code first ran, so History does not mark it when it opens.
  await act(() => m.save.sighting('animal-1'));
  m.openHistory();
  const entry = await waitFor(() => entryOf('Looks like a bird'), SLOW);
  await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'), SLOW);
  other.heard.length = 0;

  fireEvent.click(within(entry).getByRole('button', { name: 'Acknowledge' }));

  await waitFor(() => expect(m.animals.getState().detectionHistory.find((sighting) => sighting.id === 'animal-1')?.acknowledged).toBe(true), SLOW);
  await waitFor(() => expect(other.heard).toContainEqual({ type: 'alerts-changed' }), SLOW);
});

it('lists an alert whose dates do not parse, with no error', async () => {
  const m = await app();
  // The database is made as the app makes it; the records are put in as an older version or a server left them.
  await m.db.getAllMatchFrames();
  const record = {
    monitoring: true, producer: 'monitoring', savedBeforeUpgrade: false, retentionClass: 'new', acknowledgementOrder: 1,
    streamId: 'local', severity: 'low', acknowledged: false, syncedAt: new Date().toISOString(),
  };
  await putOwn('alert_cache', [
    { ...record, id: 'motion-1731600000000-abc', message: 'Dated by its id', createdAt: 'not a date' },
    { ...record, id: 'server-x-y', message: 'With no date', createdAt: 'nor this', timestamp: 'nor this' },
  ]);
  await act(() => m.monitoring.getState().hydrateAlerts());

  m.openHistory();

  const dated = await waitFor(() => entryOf('Dated by its id'), SLOW);
  const undated = entryOf('With no date');
  expect(timeOf(dated)).not.toBe('');
  expect(timeOf(undated)).toBe('');
  expect(dated.compareDocumentPosition(undated) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(undated.nextElementSibling).toBeNull();
});
