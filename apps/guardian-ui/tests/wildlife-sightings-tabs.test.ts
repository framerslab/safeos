/** @jest-environment jsdom */
/**
 * Wildlife's sightings in two tabs
 *
 * Wildlife's sightings live in one stored list that every open tab writes:
 * the watching tab saves a sighting each second an animal stays in view, and
 * any tab marks them seen when History opens. Each tab here is the store
 * loaded afresh over the one storage, as two tabs of a browser are, so a
 * write that starts from a tab's own copy alone takes back the other's.
 */

import type * as AnimalAlerts from '@/stores/animal-alert-store';
import type { AnimalDetection } from '@/lib/animal-detection';

type Store = typeof AnimalAlerts.useAnimalAlertStore;

function openTab(): Store {
  const loaded: Store[] = [];
  jest.isolateModules(() => {
    loaded.push((require('../src/stores/animal-alert-store') as typeof AnimalAlerts).useAnimalAlertStore);
  });
  return loaded[0];
}

const sighting = (id: string, timestamp: number): AnimalDetection => ({
  id,
  type: 'bird',
  displayName: 'Bird',
  sizeCategory: 'small',
  dangerLevel: 'none',
  confidence: 0.9,
  bbox: [0, 0, 10, 10],
  timestamp,
});

/** The list as the last write left it in storage, newest first. */
function stored(): { id: string; acknowledged: boolean }[] {
  const saved = JSON.parse(localStorage.getItem('safeos-animal-alerts') ?? 'null') as {
    state?: { detectionHistory?: { id: string; acknowledged: boolean }[] };
  } | null;
  return (saved?.state?.detectionHistory ?? []).map(({ id, acknowledged }) => ({ id, acknowledged }));
}

beforeEach(() => {
  localStorage.clear();
});

it('keeps a sighting marked seen in another tab when the watching tab saves its next one', async () => {
  const watching = openTab();
  const other = openTab();
  watching.getState().addDetections([sighting('bird', 1000)]);
  await other.persist.rehydrate();

  other.getState().acknowledgeDetections(['bird']);
  watching.getState().addDetections([sighting('deer', 2000)]);

  expect(stored()).toEqual([
    { id: 'deer', acknowledged: false },
    { id: 'bird', acknowledged: true },
  ]);
  expect(watching.getState().detectionHistory.find((entry) => entry.id === 'bird')?.acknowledged).toBe(true);
});

it('keeps the sightings the watching tab saved since another tab read the list, when that tab marks them seen', async () => {
  const watching = openTab();
  const other = openTab();
  watching.getState().addDetections([sighting('bird', 1000)]);
  await other.persist.rehydrate();
  watching.getState().addDetections([sighting('deer', 2000)]);

  other.getState().acknowledgeDetections(['bird']);

  expect(stored()).toEqual([
    { id: 'deer', acknowledged: false },
    { id: 'bird', acknowledged: true },
  ]);
});

it("keeps them too when History's own key marks one sighting seen", async () => {
  const watching = openTab();
  const other = openTab();
  watching.getState().addDetections([sighting('bird', 1000)]);
  await other.persist.rehydrate();
  watching.getState().addDetections([sighting('deer', 2000)]);

  other.getState().acknowledgeDetection('bird');

  expect(stored()).toEqual([
    { id: 'deer', acknowledged: false },
    { id: 'bird', acknowledged: true },
  ]);
});

it('a sighting deleted in another tab stays deleted when the watching tab saves its next one', async () => {
  const watching = openTab();
  const other = openTab();
  watching.getState().addDetections([sighting('bird', 1000)]);
  await other.persist.rehydrate();

  other.getState().deleteDetection('bird');
  watching.getState().addDetections([sighting('deer', 2000)]);

  expect(stored()).toEqual([{ id: 'deer', acknowledged: false }]);
  expect(watching.getState().detectionHistory.map((entry) => entry.id)).toEqual(['deer']);
});

it('History cleared in another tab stays cleared when the watching tab saves its next sighting', async () => {
  const watching = openTab();
  const other = openTab();
  watching.getState().addDetection(sighting('bird', 1000));
  watching.getState().addDetection(sighting('fox', 1500));
  await other.persist.rehydrate();

  other.getState().clearHistory();
  watching.getState().addDetection(sighting('deer', 2000));

  expect(stored()).toEqual([{ id: 'deer', acknowledged: false }]);
});

it('keeps a sighting storage refused on a device out of room when the next one is saved', () => {
  const watching = openTab();
  const write = localStorage.setItem.bind(localStorage);
  const refused = jest.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
    if (key === 'safeos-animal-alerts') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    write(key, value);
  });
  try {
    watching.getState().addDetections([sighting('bird', 1000)]);
  } finally {
    refused.mockRestore();
  }
  watching.getState().addDetections([sighting('deer', 2000)]);

  expect(stored()).toEqual([
    { id: 'deer', acknowledged: false },
    { id: 'bird', acknowledged: false },
  ]);
});

it('a sighting storage refused stays gone once another tab clears History, when the watching tab saves its next one', async () => {
  const watching = openTab();
  const other = openTab();
  const write = localStorage.setItem.bind(localStorage);
  const refused = jest.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
    if (key === 'safeos-animal-alerts') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    write(key, value);
  });
  try {
    watching.getState().addDetections([sighting('bird', 1000)]);
  } finally {
    refused.mockRestore();
  }
  await other.persist.rehydrate();

  other.getState().clearHistory();
  watching.getState().addDetections([sighting('deer', 2000)]);

  expect(stored()).toEqual([{ id: 'deer', acknowledged: false }]);
  expect(watching.getState().detectionHistory.map((entry) => entry.id)).toEqual(['deer']);
});

it.each([
  ['clears its live sightings', (store: Store) => store.getState().clearCurrentDetections()],
  ['stops its watch', (store: Store) => store.getState().setMonitoring(false)],
  ['resets', (store: Store) => store.getState().reset()],
])('keeps a sighting marked seen in another tab when the watching tab %s', async (_action, act) => {
  const watching = openTab();
  const other = openTab();
  watching.getState().addDetections([sighting('bird', 1000)]);
  await other.persist.rehydrate();

  other.getState().acknowledgeDetections(['bird']);
  act(watching);

  expect(stored()).toEqual([{ id: 'bird', acknowledged: true }]);
});

it('keeps a sighting deleted in another tab deleted when the watching tab clears its live sightings', async () => {
  const watching = openTab();
  const other = openTab();
  watching.getState().addDetections([sighting('bird', 1000)]);
  await other.persist.rehydrate();

  other.getState().deleteDetection('bird');
  watching.getState().clearCurrentDetections();

  expect(stored()).toEqual([]);
});
