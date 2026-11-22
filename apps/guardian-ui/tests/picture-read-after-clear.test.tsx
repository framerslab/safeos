/** @jest-environment jsdom */
import 'fake-indexeddb/auto';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import type { AlertPictureDB } from '@/lib/client-db';
import type { Alert } from '@/stores/monitoring-store';

// The store's answer to the card's picture read waits until the test hands it back.
let mockAnswer: ((row: AlertPictureDB | null) => void) | null = null;
jest.mock('@/lib/client-db', () => ({
  ...jest.requireActual('@/lib/client-db'),
  getAlertPicture: jest.fn(() => new Promise<AlertPictureDB | null>((resolve) => { mockAnswer = resolve; })),
}));

import { PictureBlock } from '@/components/alert-pictures/PictureBlock';
import { forgetAllPictures } from '@/lib/alert-pictures/keeper';

it('a picture read that answers after Clear All Local Data or a sign-out shows nothing of what it read', async () => {
  const at = Date.now() - 60_000;
  const alert = {
    id: `motion-${at}-held`, streamId: 'local', severity: 'medium', message: 'Motion', acknowledged: false,
    createdAt: new Date(at).toISOString(), timestamp: new Date(at).toISOString(), kind: 'motion', pictureId: `picture-${at}-held`,
  } as unknown as Alert;
  render(<PictureBlock alert={alert} form="small" />);
  expect(mockAnswer).not.toBeNull();

  // The clear lets go of every picture while the card's read waits: the card that stands says none was kept.
  act(() => forgetAllPictures());
  expect(await screen.findByText('No picture was kept for this alert.')).toBeTruthy();

  // The read answers with the row as it stood before the clear.
  await act(async () => {
    mockAnswer!({ id: `picture-${at}-held`, state: 'gone', kind: 'motion', takenAt: at, gone: 'person' });
  });
  expect(screen.queryByText('You deleted its picture.')).toBeNull();
  expect(screen.getByText('No picture was kept for this alert.')).toBeTruthy();
});
