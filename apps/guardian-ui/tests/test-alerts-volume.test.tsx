/** @jest-environment jsdom */
/**
 * The Test Alerts page's Preview Volume slider sets the volume of the sound
 * buttons under it, from 0 to 100, without changing the alert volume the
 * watch uses. The slider and its labels show the preview value, and the shared
 * sound manager's volume stays where the person's setting put it.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import TestAlertsPage from '@/app/settings/test-alerts/page';
import { getSoundManager } from '@/lib/sound-manager';
import { useSettingsStore } from '@/stores/settings-store';

jest.mock('next/navigation', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({ status: { api: 'disconnected' }, config: { apiUrl: '' } }),
}));

afterEach(() => { jest.restoreAllMocks(); });

it('keeps the slider and its label at the preview value', async () => {
  render(<TestAlertsPage />);
  await act(async () => {});

  fireEvent.change(await screen.findByRole('slider'), { target: { value: '80' } });

  expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('80');
  expect(screen.getByText('Preview Volume: 80%')).toBeTruthy();
});

it('plays the sound buttons at the preview volume and leaves the alert volume alone', async () => {
  const manager = getSoundManager();
  const setUserVolume = jest.spyOn(manager, 'setUserVolume');
  const play = jest.spyOn(manager, 'play').mockReturnValue('preview');
  render(<TestAlertsPage />);
  await act(async () => {});

  fireEvent.change(await screen.findByRole('slider'), { target: { value: '80' } });
  fireEvent.click(screen.getByRole('button', { name: /^warning$/i }));

  expect(play).toHaveBeenLastCalledWith('warning', expect.objectContaining({ volume: 80 }));
  expect(setUserVolume).not.toHaveBeenCalled();
});

it('plays the sound buttons at the effective volume until the slider moves', async () => {
  const realQuietHours = useSettingsStore.getState().isQuietHoursActive;
  useSettingsStore.setState({
    isQuietHoursActive: () => true,
    quietHoursSettings: { ...useSettingsStore.getState().quietHoursSettings, enabled: true, mode: 'reduced', reducedVolume: 20 },
  });
  const play = jest.spyOn(getSoundManager(), 'play').mockReturnValue('preview');
  render(<TestAlertsPage />);
  await act(async () => {});

  fireEvent.click(screen.getByRole('button', { name: /^warning$/i }));

  expect(play).toHaveBeenLastCalledWith('warning', expect.objectContaining({ volume: 20 }));
  useSettingsStore.setState({ isQuietHoursActive: realQuietHours });
});
