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

it('shows the volume the buttons will play at until the slider moves', async () => {
  const { isQuietHoursActive: realQuietHours, quietHoursSettings: realSettings } = useSettingsStore.getState();
  useSettingsStore.setState({
    isQuietHoursActive: () => true,
    quietHoursSettings: { ...realSettings, enabled: true, mode: 'silent' },
  });
  render(<TestAlertsPage />);
  await act(async () => {});

  expect(((await screen.findByRole('slider')) as HTMLInputElement).value).toBe('0');
  expect(screen.getByText('Preview Volume: 0%')).toBeTruthy();
  useSettingsStore.setState({ isQuietHoursActive: realQuietHours, quietHoursSettings: realSettings });
});

it('says the Emergency sound plays at full volume whatever the slider shows', async () => {
  render(<TestAlertsPage />);
  await act(async () => {});

  expect(screen.getByRole('button', { name: /emergency.*full volume/i })).toBeTruthy();
});

it('keeps the slider in step with quiet hours as they begin while the page is open', async () => {
  jest.useFakeTimers();
  const { isQuietHoursActive: realQuietHours, quietHoursSettings: realSettings, globalMute: realMute } = useSettingsStore.getState();
  let quiet = false;
  useSettingsStore.setState({
    globalMute: false,
    isQuietHoursActive: () => quiet,
    quietHoursSettings: { ...realSettings, enabled: true, mode: 'silent' },
  });
  try {
    render(<TestAlertsPage />);
    await act(async () => {});
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe(String(useSettingsStore.getState().globalSettings.alertVolume));

    // Quiet hours begin with no change to the settings: only the clock moves.
    quiet = true;
    await act(async () => { jest.advanceTimersByTime(30_000); });
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('0');
  } finally {
    useSettingsStore.setState({ isQuietHoursActive: realQuietHours, quietHoursSettings: realSettings, globalMute: realMute });
    jest.useRealTimers();
  }
});
