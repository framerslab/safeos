/** @jest-environment jsdom */
/**
 * The opened picture as a repeat changes it, and Delete picture while Save
 * picture is drawing its file
 *
 * A repeat that puts a newer picture in the panel takes away the controls
 * the earlier one had: focus that stood on one goes to Close, and a
 * brightened view of the earlier picture is never shown over the newer one.
 * Delete picture confirmed while Save picture draws its file deletes the
 * picture once the file is made.
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { PictureView } from '@/lib/alert-pictures/keeper';
import type { PictureSet } from '@/lib/alert-pictures/capture';
import type { Alert } from '@/stores/monitoring-store';

// The keeper's views, by picture id, as the test sets them.
const mockViews = new Map<string, PictureView>();
const mockDelete = jest.fn(async (id: string) => (id ? 'deleted' as const : 'failed' as const));
jest.mock('@/lib/alert-pictures/keeper', () => ({
  ...jest.requireActual('@/lib/alert-pictures/keeper'),
  usePicture: (id: string | undefined) => (id ? mockViews.get(id) ?? { status: 'loading' } : { status: 'none' }),
  usePictureStoreState: () => 'usable',
  deletePicture: (id: string) => mockDelete(id),
}));
// Save picture's file is handed back by the test; the brightened view is named for its picture.
let mockFileMade: ((file: Blob) => void) | null = null;
jest.mock('@/lib/alert-pictures/capture', () => ({
  ...jest.requireActual('@/lib/alert-pictures/capture'),
  savedFile: () => new Promise<Blob>((resolve) => { mockFileMade = resolve; }),
  brightenedUrl: async (set: { id: string }) => ({ frame: `blob:bright-${set.id}`, closeUp: null }),
}));

import { PictureDialogHost, openPicture } from '@/components/alert-pictures/PictureDialog';
import { useMonitoringStore } from '@/stores/monitoring-store';
import { BRIGHTEN, BRIGHTENED_VIEW, CLOSE, DELETE_PICTURE, SAVE_PICTURE } from '@/lib/alert-pictures/words';

const AT = Date.UTC(2026, 10, 22, 21, 42, 40);

function pictureOf(id: string, dark: boolean): PictureView {
  const set: PictureSet = {
    id, kind: 'motion', takenAt: AT, frame: new Blob([id]), frameWidth: 320, frameHeight: 240,
    box: { x: 40, y: 40, width: 80, height: 60 }, sourceWidth: 320, sourceHeight: 240,
    sourceBox: { x: 40, y: 40, width: 80, height: 60 }, closeUp: null, closeUpWidth: 0, closeUpHeight: 0, dark,
  };
  return { status: 'shown', set, frameUrl: `blob:frame-${id}`, closeUpUrl: null, kept: 'saved' };
}

const card = (pictureId: string) => ({
  id: `motion-${AT}-card`, streamId: 'local', severity: 'medium', message: 'Motion', acknowledged: false,
  monitoring: true, kind: 'motion', createdAt: new Date(AT).toISOString(), timestamp: new Date(AT).toISOString(), pictureId,
}) as unknown as Alert;

/** The watch's card and its picture, opened. */
function open(pictureId: string): Alert {
  const alert = card(pictureId);
  useMonitoringStore.setState({ alerts: [alert] });
  render(<PictureDialogHost />);
  act(() => openPicture(alert, null));
  return alert;
}

/** A repeat: the card shows a newer picture. */
function repeat(alert: Alert, pictureId: string) {
  act(() => useMonitoringStore.setState({ alerts: [{ ...alert, pictureId }] }));
}

const frameImage = () => document.querySelector<HTMLImageElement>('.alert-picture-dialog .alert-picture__frame img');

beforeEach(() => {
  mockViews.clear();
  mockDelete.mockClear();
  mockFileMade = null;
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => 'blob:file') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

it('focus that stood on Brighten goes to Close when a newer picture takes the switch away', () => {
  mockViews.set('picture-a', pictureOf('picture-a', true));
  mockViews.set('picture-b', pictureOf('picture-b', false));
  const alert = open('picture-a');
  const brighten = screen.getByRole('switch', { name: BRIGHTEN });
  act(() => brighten.focus());
  expect(document.activeElement).toBe(brighten);

  repeat(alert, 'picture-b');
  expect(screen.queryByRole('switch', { name: BRIGHTEN })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: CLOSE }));
});

it('a brightened view of the earlier picture is never shown over a newer one', async () => {
  mockViews.set('picture-a', pictureOf('picture-a', true));
  mockViews.set('picture-b', pictureOf('picture-b', false));
  const alert = open('picture-a');
  await act(async () => { fireEvent.click(screen.getByRole('switch', { name: BRIGHTEN })); });
  expect(frameImage()?.getAttribute('src')).toBe('blob:bright-picture-a');
  expect(screen.getByText(BRIGHTENED_VIEW)).toBeTruthy();

  // The newer picture is not dark: it shows as it is, with no Brighten switch and no brightened plate.
  await act(async () => { repeat(alert, 'picture-b'); });
  expect(frameImage()?.getAttribute('src')).toBe('blob:frame-picture-b');
  expect(screen.queryByText(BRIGHTENED_VIEW)).toBeNull();
  expect(screen.queryByRole('switch', { name: BRIGHTEN })).toBeNull();
});

it('Delete picture confirmed while Save picture draws its file deletes the picture once the file is made', async () => {
  mockViews.set('picture-a', pictureOf('picture-a', false));
  open('picture-a');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: SAVE_PICTURE })); });
  expect(mockFileMade).not.toBeNull();

  fireEvent.click(screen.getByRole('button', { name: DELETE_PICTURE }));
  await act(async () => {
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: DELETE_PICTURE }));
  });
  // The file is made, and then the picture is deleted.
  await act(async () => { mockFileMade!(new Blob(['file'])); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(mockDelete).toHaveBeenCalledWith('picture-a');
});
