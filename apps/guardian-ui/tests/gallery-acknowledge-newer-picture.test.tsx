/** @jest-environment jsdom */
/**
 * Acknowledge in the gallery is for the picture it shows
 *
 * A repeat of a sighting puts its newer picture on the same card. A gallery
 * that has not read it yet acknowledges nothing: the card, with the picture
 * nobody has looked at, stays new.
 */
import './helpers/browser-data';
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MatchGallery } from '@/components/MatchGallery';
import { getSavedSightingPictures, type KeptSightingPicture } from '@/lib/client-db';
import { pictureStampNow } from '@/lib/local-data-generation';

jest.mock('@/lib/client-db', () => ({
  ...jest.requireActual('@/lib/client-db'),
  getSavedSightingPictures: jest.fn(),
}));

const db = jest.requireActual<typeof import('@/lib/client-db')>('@/lib/client-db');
const read = jest.mocked(getSavedSightingPictures);
const AT = Date.now() - 60_000;
const FIRST = `picture-${AT}-first`;
const SECOND = `picture-${AT + 10_000}-second`;

const alert = (pictureId: string) => ({
  id: 'sighting-repeated', streamId: 'local', severity: 'info', message: 'Could this be Mittens?', description: '',
  acknowledged: false, monitoring: true, kind: 'sighting', pictureId, subjectId: 'mittens', subjectName: 'Mittens',
  createdAt: new Date(AT).toISOString(), timestamp: new Date(AT).toISOString(),
});

const keep = (id: string, takenAt: number) => db.saveAlertPicture({ id, state: 'kept', kind: 'sighting', takenAt }, pictureStampNow());
const stored = async () => (await db.getCachedMonitoringAlerts()).find((saved) => saved.id === 'sighting-repeated');

beforeEach(async () => {
  expect(await keep(FIRST, AT)).toEqual({ result: 'saved', deleted: [] });
  expect(await db.cacheAlert(alert(FIRST))).toBe(true);
});

afterEach(cleanup);

it('acknowledges a sighting only while its card has the picture shown', async () => {
  const [shown] = (await db.getSavedSightingPictures()) as KeptSightingPicture[];
  expect(shown.id).toBe(FIRST);
  // The gallery's reads end with the first picture until it has read the second.
  read.mockResolvedValue([shown]);
  render(<MatchGallery />);
  const acknowledge = await screen.findByRole('button', { name: 'Acknowledge this picture' });

  expect(await keep(SECOND, AT + 10_000)).toEqual({ result: 'saved', deleted: [] });
  expect(await db.repeatCachedAlert(alert(SECOND))).toEqual({ kind: 'updated', repeats: 1 });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });

  const reads = read.mock.calls.length;
  read.mockImplementation(db.getSavedSightingPictures);
  fireEvent.click(acknowledge);
  await waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(reads));
  await waitFor(async () => expect(await stored()).toMatchObject({ pictureId: SECOND, acknowledged: false }));

  // Read again, the gallery shows the second picture, and Acknowledge is for it.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  fireEvent.click(screen.getByRole('button', { name: 'Acknowledge this picture' }));
  await waitFor(async () => expect(await stored()).toMatchObject({ pictureId: SECOND, acknowledged: true }));
});
