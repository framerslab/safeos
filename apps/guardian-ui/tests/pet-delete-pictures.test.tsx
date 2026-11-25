/** @jest-environment jsdom */
/**
 * A pet's saved pictures are its own, and deleting the pet deletes them
 *
 * A pet's count and the gallery hold the frames an earlier version saved for
 * it and the pictures kept for its sightings, each once. Deleting the pet
 * deletes them: a picture this tab's watch took leaves this tab's alerts and
 * History at once, another pet's stays, and an alert whose picture was never
 * kept is not said to have had one deleted. A picture of the pet that is saved
 * after the delete, or whose alert is not saved yet, does not stay either.
 */
import './helpers/browser-data';
import React from 'react';
import { openDB } from 'idb';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import LostFoundPage from '@/app/lost-found/page';
import type { PictureSet } from '@/lib/alert-pictures/capture';
import { deletePet, holdPicture, usePicture } from '@/lib/alert-pictures/keeper';
import { countMatchFramesBySubject, getSavedSightingPictures, saveAlertPicture } from '@/lib/client-db';
import { pictureStampNow } from '@/lib/local-data-generation';
import { useAlertPicturesStore } from '@/stores/alert-pictures-store';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/lib/client-db', () => ({
  ...jest.requireActual('@/lib/client-db'),
  // The test's stand-in for structuredClone cannot copy a Blob: the rows below stand for the saves.
  saveAlertPicture: jest.fn(async () => ({ result: 'saved', deleted: [] })),
}));

const db = jest.requireActual<typeof import('@/lib/client-db')>('@/lib/client-db');
const NOW = Date.now();
const MINUTE = 60_000;

const pet = (id: string, name: string) => db.saveSubjectProfile({
  id, name, type: 'pet', description: '', fingerprint: {}, referenceImages: [],
  createdAt: new Date(NOW).toISOString(), lastActiveAt: null, matchCount: 0,
});

const pictureId = (at: number, name: string) => `picture-${at}-${name}`;

/** A sighting's alert as the watch saves it, with its picture's row unless `row` is null. */
async function sighting(petId: string, name: string, at: number, row: 'kept' | 'gone' | null): Promise<string> {
  const id = pictureId(at, name);
  if (row) {
    const record = { id, state: row, kind: 'sighting' as const, takenAt: at, ...(row === 'gone' ? { gone: 'age' as const, goneAfterDays: 3 } : {}) };
    expect(await db.saveAlertPicture(record, pictureStampNow())).toEqual({ result: 'saved', deleted: [] });
  }
  expect(await db.cacheAlert({
    id: `sighting-${at}-${name}`, streamId: 'local', severity: 'info', message: 'Could this be it?', description: '',
    acknowledged: false, monitoring: true, kind: 'sighting', pictureId: id, subjectId: petId, subjectName: petId,
    createdAt: new Date(at).toISOString(), timestamp: new Date(at).toISOString(),
  })).toBe(true);
  return id;
}

const frame = (id: string, petId: string) => db.saveMatchFrame({
  id, subjectId: petId, frameData: 'data:,frame', thumbnailData: 'data:,thumb', confidence: 80, timestamp: NOW - 90 * MINUTE,
  details: { colorMatch: 80, dominantMatch: 80, edgeMatch: 80, sizeMatch: 80 },
  region: null, acknowledged: false, notes: '', exported: false,
});

const setOf = (id: string, at: number): PictureSet => ({
  id, kind: 'sighting', takenAt: at, frame: new Blob([id]), frameWidth: 4, frameHeight: 3,
  box: null, sourceWidth: 4, sourceHeight: 3, sourceBox: null, closeUp: null, closeUpWidth: 0, closeUpHeight: 0, dark: false,
});

function AlertPicture({ id }: { id: string }) {
  const view = usePicture(id);
  return <p data-testid="alert-picture">{view.status}</p>;
}

beforeAll(() => {
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => 'blob:picture') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
  window.confirm = jest.fn(() => true);
});

afterEach(cleanup);

it('counts and lists a pet’s earlier frames and kept sightings once each, and no other pet’s', async () => {
  await frame('frame-miso', 'miso');
  const kept = await sighting('miso', 'miso-kept', NOW - 60 * MINUTE, 'kept');
  await sighting('miso', 'miso-gone', NOW - 61 * MINUTE, 'gone');
  await sighting('miso', 'miso-none', NOW - 62 * MINUTE, null);
  const others = await sighting('tofu', 'tofu-kept', NOW - 63 * MINUTE, 'kept');

  expect(await countMatchFramesBySubject(['miso', 'tofu', 'nori'])).toEqual({ miso: 2, tofu: 1, nori: 0 });
  const ids = async (petId?: string) => (await getSavedSightingPictures(petId)).map((picture) => picture.id).sort();
  expect(await ids('miso')).toEqual(['frame-miso', kept].sort());
  expect(await ids('tofu')).toEqual([others]);
  expect(await ids()).toEqual(['frame-miso', kept, others].sort());
});

it('deletes the pet’s pictures in this tab’s alerts and History too, and no other picture', async () => {
  useAlertPicturesStore.setState({ noticeAnswered: true, keep: true });
  await pet('mittens', 'Mittens');
  await pet('biscuit', 'Biscuit');
  const at = NOW - 30 * MINUTE;
  const kept = await sighting('mittens', 'mittens-kept', at, 'kept');
  const neverKept = await sighting('mittens', 'mittens-none', NOW - 31 * MINUTE, null);
  const others = await sighting('biscuit', 'biscuit-kept', NOW - 32 * MINUTE, 'kept');
  const onItsWay = await sighting('mittens', 'mittens-waiting', Date.now(), null);
  const stamp = pictureStampNow();

  // This tab's watch took the picture, so the tab holds it in memory.
  holdPicture(Promise.resolve(setOf(kept, at)), kept);
  render(<><AlertPicture id={kept} /><LostFoundPage /></>);
  await waitFor(() => expect(screen.getByTestId('alert-picture').textContent).toBe('shown'));

  fireEvent.click(await screen.findByRole('button', { name: 'Delete Mittens' }));
  await waitFor(async () => expect(await db.getAlertPicture(kept)).toMatchObject({ state: 'gone', gone: 'person' }));
  await waitFor(() => expect(screen.getByTestId('alert-picture').textContent).toBe('gone-person'));
  expect(screen.queryByRole('button', { name: 'Delete Mittens' })).toBeNull();

  expect(await db.getAlertPicture(others)).toMatchObject({ state: 'kept' });
  // No picture was kept for this alert, and none was deleted.
  expect(await db.getAlertPicture(neverKept)).toBeNull();
  // A picture on its way as the pet was deleted is not saved after it.
  expect(await db.saveAlertPicture({ id: onItsWay, state: 'kept', kind: 'sighting', takenAt: Date.now() }, stamp))
    .toEqual({ result: 'dropped' });
});

describe('a picture on its way as the pet is deleted', () => {
  /** Its save, with the row's words alone in the real database. */
  const saveRow: typeof db.saveAlertPicture = (record, stamp) =>
    db.saveAlertPicture({ ...record, frame: undefined, closeUp: undefined }, stamp);

  beforeEach(() => {
    useAlertPicturesStore.setState({ noticeAnswered: true, keep: true });
    jest.mocked(saveAlertPicture).mockImplementation(saveRow);
  });
  afterEach(() => { jest.mocked(saveAlertPicture).mockReset().mockResolvedValue({ result: 'saved', deleted: [] }); });

  /** A picture of the pet, held as the watch holds it, that is drawn when `draw` is called. */
  function hold(petId: string, name: string, at: number): { id: string; draw: () => void } {
    const id = pictureId(at, name);
    let draw!: () => void;
    holdPicture(new Promise((resolve) => { draw = () => resolve(setOf(id, at)); }), id, petId);
    return { id, draw };
  }

  const saves = () => Promise.all(jest.mocked(saveAlertPicture).mock.results.map((result) => result.value));

  it('is not kept when it is saved after the delete and its alert is not saved yet', async () => {
    await pet('waffle', 'Waffle');
    const before = hold('waffle', 'waffle-unsaved', Date.now());
    expect(await deletePet('waffle')).toBe('deleted');
    before.draw();
    await waitFor(async () => expect(await saves()).toContainEqual({ result: 'dropped' }));
    expect(await db.getAlertPicture(before.id)).toBeNull();
  });

  it('is not kept when its save comes more than a minute after its alert', async () => {
    await pet('waffle', 'Waffle');
    const at = Date.now() - 5 * MINUTE;
    const id = await sighting('waffle', 'waffle-slow', at, null);
    const { draw } = hold('waffle', 'waffle-slow', at);
    expect(await deletePet('waffle')).toBe('deleted');
    draw();
    await waitFor(async () => expect(await saves()).toContainEqual({ result: 'dropped' }));
    expect(await db.getAlertPicture(id)).toBeNull();
  });

  it('goes when it is saved before the delete and its alert is not', async () => {
    await pet('waffle', 'Waffle');
    const { id, draw } = hold('waffle', 'waffle-first', Date.now());
    draw();
    await waitFor(async () => expect(await db.getAlertPicture(id)).toMatchObject({ state: 'kept' }));
    expect(await deletePet('waffle')).toBe('deleted');
    expect(await db.getAlertPicture(id)).toMatchObject({ state: 'gone', gone: 'person' });
  });

  it('is kept for another pet, and for the pet once it is saved again', async () => {
    await pet('waffle', 'Waffle');
    expect(await deletePet('waffle')).toBe('deleted');
    const others = hold('tofu', 'tofu-after', Date.now());
    others.draw();
    await waitFor(async () => expect(await db.getAlertPicture(others.id)).toMatchObject({ state: 'kept' }));

    await pet('waffle', 'Waffle');
    const again = hold('waffle', 'waffle-again', Date.now());
    again.draw();
    await waitFor(async () => expect(await db.getAlertPicture(again.id)).toMatchObject({ state: 'kept' }));
  });

  it('leaves no note of the deleted pet once all local data is cleared', async () => {
    await pet('crumpet', 'Crumpet');
    expect(await deletePet('crumpet')).toBe('deleted');
    const notes = async () => {
      const reading = await openDB('safeos-guardian');
      const keys = (await reading.getAllKeys('clear_generation')).filter((key) => String(key).includes('crumpet'));
      reading.close();
      return keys.length;
    };
    expect(await notes()).toBe(1);
    await db.clearClientData();
    expect(await notes()).toBe(0);
  });
});
