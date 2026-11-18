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
