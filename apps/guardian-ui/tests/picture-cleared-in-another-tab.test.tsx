/** @jest-environment jsdom */
/**
 * Clear all in another tab, while a saved alert's picture is open here
 *
 * Clear all deletes every watch alert and every kept picture, in every tab's
 * database, and writes the clear marker that the other tabs hear. A tab that
 * shows a saved alert's picture lets it go then: its open picture closes, and
 * the card that stands says no picture was kept.
 */

import './helpers/browser-data';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { AlertPictureDB } from '@/lib/client-db';
import type { Alert } from '@/stores/monitoring-store';

const mockAt = Date.now() - 60_000;
const mockPictureId = `picture-${mockAt}-saved`;

// The saved row this tab reads for the card.
jest.mock('@/lib/client-db', () => ({
  ...jest.requireActual('@/lib/client-db'),
  getAlertPicture: jest.fn(async (id: string): Promise<AlertPictureDB | null> => ({
    id, state: 'kept', kind: 'motion', takenAt: mockAt, frame: new Blob(['frame']), frameWidth: 64, frameHeight: 48,
  })),
}));

import { PictureBlock } from '@/components/alert-pictures/PictureBlock';
import { PictureDialogHost, openPicture } from '@/components/alert-pictures/PictureDialog';
import { LOCAL_CLEAR_MARKER_KEY } from '@/lib/local-data-generation';
import { SAVE_PICTURE } from '@/lib/alert-pictures/words';

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => 'blob:picture') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
});

it('Clear all in another tab closes the open picture of a saved alert and leaves its card with no picture', async () => {
  const alert = {
    id: `motion-${mockAt}-saved`, streamId: 'local', severity: 'medium', message: 'Motion', acknowledged: false,
    createdAt: new Date(mockAt).toISOString(), timestamp: new Date(mockAt).toISOString(), kind: 'motion', pictureId: mockPictureId,
  } as unknown as Alert;
  const { container } = render(
    <>
      <PictureBlock alert={alert} form="small" />
      <PictureDialogHost />
    </>,
  );
  await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
  act(() => openPicture(alert, null));
  expect(await screen.findByRole('button', { name: SAVE_PICTURE })).toBeTruthy();

  // Another tab's Clear all commits: this tab hears its clear marker.
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: LOCAL_CLEAR_MARKER_KEY, newValue: 'cleared-in-another-tab' }));
  });

  await waitFor(() => expect(document.querySelector('.alert-picture-dialog')).toBeNull());
  expect(screen.queryByRole('button', { name: SAVE_PICTURE })).toBeNull();
  expect(screen.getByText('No picture was kept for this alert.')).toBeTruthy();
  expect(container.querySelector('img')).toBeNull();
});
