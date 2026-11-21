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
  await waitFor(() => expect([...caches]).toEqual([]));
});

describe('the question before clearing', () => {
  // Each case reads the question afresh: the confirm and the connection are
  // spies of its own.
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('says SafeOS will not open again until the device is back online, and clears nothing until the person accepts', async () => {
    await recordSound();
    const before = await getAllCustomSounds();
    expect(before.length).toBeGreaterThan(0);
    jest.spyOn(Navigator.prototype, 'onLine', 'get').mockReturnValue(false);
    const ask = jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Privacy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear All Local Data' }));

    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith(
      'This will delete all local data. Are you sure? SafeOS will not open again until you are back online.',
    );
    expect(await getAllCustomSounds()).toHaveLength(before.length);
  });

  it('asks in the shorter words while the device is online', () => {
    jest.spyOn(Navigator.prototype, 'onLine', 'get').mockReturnValue(true);
    const ask = jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Privacy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear All Local Data' }));

    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith('This will delete all local data. Are you sure?');
  });
});
