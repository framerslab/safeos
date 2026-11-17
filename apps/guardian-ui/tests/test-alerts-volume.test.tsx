/** @jest-environment jsdom */
/**
 * The Test Alerts page's Preview Volume slider runs from 0 to 100, and so does
 * the sound manager's volume: moving the slider to 80 previews the sounds at
 * 80 of 100, not at a hundredth of that.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import TestAlertsPage from '@/app/settings/test-alerts/page';
import { getSoundManager } from '@/lib/sound-manager';

jest.mock('next/navigation', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({ status: { api: 'disconnected' }, config: { apiUrl: '' } }),
}));

it('previews the volume the slider shows', async () => {
  const setUserVolume = jest.spyOn(getSoundManager(), 'setUserVolume');
  render(<TestAlertsPage />);
  await act(async () => {});

  fireEvent.change(await screen.findByRole('slider'), { target: { value: '80' } });

  expect(setUserVolume).toHaveBeenLastCalledWith(80);
});
