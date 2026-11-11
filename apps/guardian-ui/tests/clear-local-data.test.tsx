/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { recordSound, fakeCaches } from './helpers/browser-data';
import { getAllCustomSounds } from '@/lib/custom-sounds-db';
import SettingsPage from '@/app/settings/page';
jest.mock('@/contexts/BackendStatusContext', () => ({ useBackendStatus: () => ({ status: { api: 'disconnected' }, config: { apiUrl: '' } }) }));

it('clears microphone recordings and cached responses when clearing all local data', async () => {
  await recordSound();
  expect(await getAllCustomSounds()).toHaveLength(1);
  const caches = fakeCaches();
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  render(<SettingsPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Privacy' }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear All Local Data' }));
  await waitFor(async () => expect(await getAllCustomSounds()).toEqual([]));
  expect([...caches]).toEqual([]);
});
