/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { recordSound, fakeCaches } from './helpers/browser-data';
import { saveIntrusionFrame, getAllIntrusionFrames } from '@/lib/client-db';
import { getAllCustomSounds } from '@/lib/custom-sounds-db';
import { useAuthStore } from '@/stores/auth-store';
import { AuthButton } from '@/components/AuthButton';
import HistoryPage from '@/app/history/page';

it('keeps the next account out of the signed-out account’s frames and recordings', async () => {
  process.env.NEXT_PUBLIC_STATIC_MODE = 'true';
  fakeCaches();
  useAuthStore.setState({ isInitialized: true, isAuthenticated: true, isGuest: false, sessionToken: 'local-first' });
  await recordSound();
  await saveIntrusionFrame({ id: 'first-intrusion', frameData: 'data:image/png;base64,AA==', thumbnailData: '', timestamp: Date.now(), personCount: 2, allowedCount: 0, detections: [], acknowledged: false, notes: 'First account only', exported: false });
  const account = render(<AuthButton />);
  fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Log Out' }));
  await waitFor(() => expect(useAuthStore.getState().sessionToken).toBeNull());
  account.unmount();
  await act(() => useAuthStore.getState().login({ id: 'second', displayName: 'Second', preferences: { defaultScenario: 'pet', motionSensitivity: .5, audioSensitivity: .5, alertVolume: .7, theme: 'dark' } }));
  render(<HistoryPage />);
  await waitFor(async () => expect(await getAllIntrusionFrames()).toEqual([]));
  expect(await getAllCustomSounds()).toEqual([]);
  expect(screen.queryByText('First account only')).toBeNull();
  delete process.env.NEXT_PUBLIC_STATIC_MODE;
});
