/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { recordSound, fakeCaches } from './helpers/browser-data';
import { getAllCustomSounds } from '@/lib/custom-sounds-db';
import DataPage from '@/app/settings/data/page';
jest.mock('@/contexts/BackendStatusContext', () => ({ useBackendStatus: () => ({ status: { api: 'disconnected' }, config: { apiUrl: '' } }) }));

const QUESTION = 'Clear all data on this device? Alerts, pictures, pets, sounds and settings leave this device.';

async function openTheQuestion() {
  render(<DataPage />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  fireEvent.click(screen.getByRole('button', { name: 'Clear all data on this device' }));
}

it('clears microphone recordings and cached responses when clearing all local data', async () => {
  await recordSound();
  expect(await getAllCustomSounds()).toHaveLength(1);
  const caches = fakeCaches();
  await openTheQuestion();
  fireEvent.click(screen.getByRole('button', { name: 'Clear all data' }));
  await waitFor(async () => expect(await getAllCustomSounds()).toEqual([]));
  await waitFor(() => expect([...caches]).toEqual([]));
});

describe('the question before clearing', () => {
  // Each case reads the question afresh: the connection is a spy of its own.
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
    const confirmBox = jest.spyOn(window, 'confirm');
    await openTheQuestion();

    expect(screen.getByText(`${QUESTION} SafeOS will not open again until you are back online.`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(confirmBox).not.toHaveBeenCalled();
    expect(await getAllCustomSounds()).toHaveLength(before.length);
  });

  it('asks in the shorter words while the device is online', async () => {
    jest.spyOn(Navigator.prototype, 'onLine', 'get').mockReturnValue(true);
    const confirmBox = jest.spyOn(window, 'confirm');
    await openTheQuestion();

    expect(screen.getByText(QUESTION).textContent).toBe(QUESTION);
    expect(confirmBox).not.toHaveBeenCalled();
  });
});
