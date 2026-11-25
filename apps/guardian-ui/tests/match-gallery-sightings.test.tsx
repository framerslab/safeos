/** @jest-environment jsdom */
/**
 * The gallery says what it could not do, and keeps focus
 *
 * A gallery this device cannot read is not an empty one. A kept picture that
 * cannot be read says so in its tile and opened, and a delete the device
 * refuses says so and keeps the picture. Focus goes into an opened picture,
 * comes back to its key, and goes to the heading when the key went with its
 * picture. News that comes while the pictures are read asks for one more
 * read, not one for each word.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MatchGallery } from '@/components/MatchGallery';
import { postPictureNews } from '@/lib/alert-pictures/channel';
import { alertsChanged } from '@/lib/tab-channel';

const PICTURE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const UNREADABLE = 'This picture could not be read on this device.';
const DELETE_FAILED = 'The picture could not be deleted. Press Delete to try again.';
const AT = Date.UTC(2026, 10, 24, 21, 42, 40);

const mockRead = jest.fn();
const mockPicture = jest.fn();
const mockGone = jest.fn();
const mockDeleteFrame = jest.fn();
const mockUpdateAlert = jest.fn();
const mockMarkFrames = jest.fn();
const mockExport = jest.fn();

jest.mock('@/lib/client-db', () => ({
  getSavedSightingPictures: () => mockRead(),
  getAllSubjectProfiles: jest.fn(async () => []),
  getAlertPicture: (...args: unknown[]) => mockPicture(...args),
  goneAlertPicture: (...args: unknown[]) => mockGone(...args),
  countKeptAlertPictures: jest.fn(async () => 1),
  acknowledgeMatchFrame: jest.fn(async () => undefined),
  deleteMatchFrame: (...args: unknown[]) => mockDeleteFrame(...args),
  updateCachedAlert: (...args: unknown[]) => mockUpdateAlert(...args),
  markMatchFramesExported: (...args: unknown[]) => mockMarkFrames(...args),
  exportMatchFrames: (...args: unknown[]) => mockExport(...args),
}));

const frame = (id: string) => ({
  id, subjectId: 'mittens', frameData: PICTURE, thumbnailData: PICTURE, confidence: 80, timestamp: AT,
  details: { colorMatch: 80, dominantMatch: 80, edgeMatch: 80, sizeMatch: 80 },
  region: null, acknowledged: false, notes: '', exported: false, alerted: true,
});

const sighting = (id: string) => ({
  id, alertId: `sighting-${id}`, subjectId: 'mittens', subjectName: 'Mittens', timestamp: AT,
  acknowledged: false, exported: false,
});

const openKey = () => screen.findByRole('button', { name: 'Open this picture' });
const quiet = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });

beforeEach(() => {
  mockRead.mockReset();
  mockPicture.mockReset().mockRejectedValue(new Error('refused'));
  mockGone.mockReset().mockResolvedValue('deleted');
  mockDeleteFrame.mockReset().mockResolvedValue('deleted');
  mockUpdateAlert.mockReset().mockResolvedValue('updated');
  mockMarkFrames.mockReset().mockResolvedValue('updated');
  mockExport.mockReset().mockResolvedValue({ data: '[]', filename: 'pictures.json' });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => '#file') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

it('says the saved pictures could not be read, and reads them again', async () => {
  mockRead.mockRejectedValueOnce(new Error('refused')).mockResolvedValue([frame('frame-1')]);
  render(<MatchGallery />);
  expect(await screen.findByText('The saved pictures could not be read on this device.')).toBeTruthy();
  expect(screen.queryByText('No pictures saved')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('img', { name: /^What the camera saw at / })).toBeTruthy();
  expect(screen.queryByText('The saved pictures could not be read on this device.')).toBeNull();
});

it('says a kept picture could not be read, in its tile and opened', async () => {
  mockRead.mockResolvedValue([sighting('picture-unread')]);
  render(<MatchGallery />);
  expect(await screen.findByText(UNREADABLE)).toBeTruthy();

  fireEvent.click(await openKey());
  const opened = screen.getByRole('dialog', { name: 'Could this be Mittens?' });
  expect(within(opened).getByText(UNREADABLE)).toBeTruthy();
  expect(within(opened).getByRole('button', { name: 'Delete' })).toBeTruthy();
});

it.each([
  ['a sighting’s picture', sighting('picture-refused')],
  ['an earlier version’s frame', frame('frame-refused')],
])('says %s could not be deleted, and keeps it', async (_what, picture) => {
  mockRead.mockResolvedValue([picture]);
  mockGone.mockResolvedValue('failed');
  mockDeleteFrame.mockResolvedValue('failed');
  render(<MatchGallery />);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete this picture' }));
  expect(await screen.findByText(DELETE_FAILED)).toBeTruthy();
  expect(await openKey()).toBeTruthy();
});

it('takes focus into an opened picture, gives it back, and leaves it on the heading once the picture is deleted', async () => {
  mockRead.mockResolvedValue([sighting('picture-focus')]);
  render(<MatchGallery />);
  const key = await openKey();
  key.focus();
  fireEvent.click(key);

  const opened = screen.getByRole('dialog', { name: 'Could this be Mittens?' });
  const close = within(opened).getByRole('button', { name: 'Close' });
  await waitFor(() => expect(document.activeElement).toBe(close));
  expect(within(opened).getByRole('button', { name: 'Previous picture' })).toBeTruthy();
  expect(within(opened).getByRole('button', { name: 'Next picture' })).toBeTruthy();

  // Tab stays in the opened picture, past its last key and before its first.
  const last = within(opened).getByRole('button', { name: 'Delete' });
  last.focus();
  fireEvent.keyDown(last, { key: 'Tab' });
  expect(document.activeElement).toBe(close);
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(last);

  fireEvent.keyDown(last, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const again = await openKey();
  await waitFor(() => expect(document.activeElement).toBe(again));

  fireEvent.click(again);
  mockRead.mockResolvedValue([]);
  const remove = screen.getByRole('button', { name: 'Delete' });
  remove.focus();
  fireEvent.click(remove);
  expect(await screen.findByText('No pictures saved')).toBeTruthy();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Saved pictures' })));
});

it('says which pictures it exported but could not mark, and leaves them chosen for another export', async () => {
  mockRead.mockResolvedValue([sighting('picture-marked'), sighting('picture-unmarked'), frame('frame-unmarked')]);
  mockUpdateAlert.mockImplementation(async ({ id }: { id: string }) => (id === 'sighting-picture-unmarked' ? 'failed' : 'updated'));
  mockMarkFrames.mockResolvedValue('failed');
  render(<MatchGallery />);
  await screen.findByText('Select all (3)');
  fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
  expect(await screen.findByText('2 pictures are in the file but could not be marked as exported. Export again to retry.')).toBeTruthy();
  expect(screen.getByText('2 selected')).toBeTruthy();

  // Only those two are in the next file, and the line goes once they are marked.
  mockUpdateAlert.mockResolvedValue('updated');
  mockMarkFrames.mockResolvedValue('updated');
  fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
  await waitFor(() => expect(mockExport).toHaveBeenCalledTimes(2));
  const [, , earlier, sightings] = mockExport.mock.calls[1];
  expect(earlier).toEqual(['frame-unmarked']);
  expect(sightings.map((picture: { id: string }) => picture.id)).toEqual(['picture-unmarked']);
  await waitFor(() => expect(screen.queryByText(/could not be marked as exported/)).toBeNull());
});

it('leaves focus on the heading when a tile’s own Delete takes the tile away', async () => {
  mockRead.mockResolvedValue([sighting('picture-tile'), sighting('picture-other')]);
  render(<MatchGallery />);
  const [remove] = await screen.findAllByRole('button', { name: 'Delete this picture' });
  mockRead.mockResolvedValue([sighting('picture-other')]);
  remove.focus();
  fireEvent.click(remove);
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Delete this picture' })).toHaveLength(1));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Saved pictures' })));
});

it.each([
  ['a sighting’s picture', sighting('picture-named')],
  ['an earlier version’s frame', frame('frame-named')],
])('names the box that selects %s, and the one that selects all', async (_what, picture) => {
  mockRead.mockResolvedValue([picture]);
  render(<MatchGallery />);
  expect(await screen.findByRole('checkbox', { name: 'Select all (1)' })).toBeTruthy();
  const box = screen.getByRole('checkbox', { name: `Select the picture from ${new Date(AT).toLocaleTimeString()}` });
  fireEvent.click(box);
  expect((box as HTMLInputElement).checked).toBe(true);
  expect(screen.getByText('1 selected')).toBeTruthy();
});

it('reads the pictures once more for all the news that comes during a read', async () => {
  let answer!: (pictures: unknown[]) => void;
  mockRead.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; })).mockResolvedValue([frame('frame-2')]);
  render(<MatchGallery />);
  await quiet();
  for (let i = 0; i < 5; i++) alertsChanged();
  await quiet();
  expect(mockRead).toHaveBeenCalledTimes(1);

  await act(async () => { answer([]); });
  expect(await screen.findByRole('img', { name: /^What the camera saw at / })).toBeTruthy();
  expect(mockRead).toHaveBeenCalledTimes(2);
});

it('lists a picture this tab saves after its watch was left', async () => {
  mockRead.mockResolvedValueOnce([]).mockResolvedValue([sighting('picture-late')]);
  render(<MatchGallery />);
  expect(await screen.findByText('No pictures saved')).toBeTruthy();
  await act(async () => { postPictureNews({ type: 'saved', id: 'picture-late' }); });
  expect(await openKey()).toBeTruthy();
});
