/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { fakeCaches } from './helpers/browser-data';
import { saveAlertPicture, type AlertPictureDB } from '@/lib/client-db';
import { pictureStampNow } from '@/lib/local-data-generation';
import { useAuthStore } from '@/stores/auth-store';
import { useAlertPicturesStore } from '@/stores/alert-pictures-store';
import { AuthButton } from '@/components/AuthButton';
import { AlertPicturesGroup } from '@/components/alert-pictures/AlertPicturesGroup';

it('a sign-out leaves the alert pictures group counting no picture', async () => {
  process.env.NEXT_PUBLIC_STATIC_MODE = 'true';
  fakeCaches();
  useAuthStore.setState({ isInitialized: true, isAuthenticated: true, isGuest: false, sessionToken: 'local-first' });
  useAlertPicturesStore.setState({ noticeAnswered: true, keep: true });
  // Kept rows with no Blob in them: the test's stand-in for structuredClone cannot copy a Blob.
  for (const id of ['picture-a', 'picture-b', 'picture-c']) {
    const row: AlertPictureDB = { id, state: 'kept', kind: 'motion', takenAt: Date.now() };
    expect(await saveAlertPicture(row, pictureStampNow())).toEqual({ result: 'saved', deleted: [] });
  }
  render(<AlertPicturesGroup place="settings" />);
  expect(await screen.findByText('3 pictures kept on this device')).toBeTruthy();

  render(<AuthButton />);
  fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Log Out' }));
  await waitFor(() => expect(useAuthStore.getState().sessionToken).toBeNull());
  // The count is read once the sign-out's clear is done, not before it.
  await waitFor(() => expect(screen.getByText('No pictures kept on this device')).toBeTruthy());
  expect(screen.queryByText('3 pictures kept on this device')).toBeNull();
  delete process.env.NEXT_PUBLIC_STATIC_MODE;
});
