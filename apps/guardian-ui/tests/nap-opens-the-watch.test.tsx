/** @jest-environment jsdom */
/**
 * Nap Mode hands the watch to Motion and sound
 *
 * The nap page checks the camera the watch will use (the one saved in
 * safeos-camera), motion that lasts as long as the watch needs before it
 * alerts, and the sound at the volume the nap's alerts will play at, saying
 * before the start when quiet hours will silence them. Start Nap Mode stops the
 * check's camera, applies the infant_sleep preset and opens the monitor with
 * the planned nap in its address, /monitor/?nap=<minutes>.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import NapPage from '@/app/nap/page';
import { useCameraStore } from '@/stores/camera-store';
import { useSettingsStore } from '@/stores/settings-store';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
let mockChangedFrames = Infinity;
jest.mock('@/lib/pixel-detection', () => ({
  getPixelDetectionEngine: () => ({ analyzeCanvas: () => ({ changed: mockChangedFrames-- > 0 }) }),
  resetPixelDetectionEngine: jest.fn(),
}));
const mockSound = {
  stopAll: jest.fn(), play: jest.fn(() => 'check-sound'), stop: jest.fn(), test: jest.fn(() => 'test-sound'), updateVolume: jest.fn(),
};
jest.mock('@/lib/sound-manager', () => ({ useSoundManager: () => mockSound }));

const realQuietHours = useSettingsStore.getState().isQuietHoursActive;
let getUserMedia: jest.Mock;
let stop: jest.Mock;

beforeEach(() => {
  mockPush.mockClear();
  Object.values(mockSound).forEach((fn) => fn.mockClear());
  mockChangedFrames = Infinity;
  useCameraStore.setState({ deviceId: '' });
  useSettingsStore.getState().resetToDefaults();
  useSettingsStore.setState({ isQuietHoursActive: realQuietHours });
  stop = jest.fn();
  getUserMedia = jest.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  // getContext is overloaded; type the spy loosely so the 2D context fake fits.
  (jest.spyOn(HTMLCanvasElement.prototype, 'getContext') as unknown as jest.SpyInstance).mockReturnValue({ drawImage: jest.fn() });
});
afterEach(() => { jest.restoreAllMocks(); });

/** Accepts the notice and passes the camera check; the motion check then starts by itself. */
async function passCamera() {
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Continue to Pre-Nap Test' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Start' })[0]);
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Start' })).toHaveLength(1), { timeout: 3000 });
}

/** Then the motion and sound checks, until the last key reads Start Nap Mode. */
async function passChecks() {
  await passCamera();
  await waitFor(() => expect((screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled).toBe(false), { timeout: 3000 });
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  const start = await screen.findByRole('button', { name: 'Start Nap Mode' }, { timeout: 4000 });
  await waitFor(() => expect((start as HTMLButtonElement).disabled).toBe(false), { timeout: 4000 });
  return start;
}

it('opens the watch with the planned nap in its address and the infant_sleep preset, and stops the check camera', async () => {
  render(<NapPage />);
  await screen.findByRole('checkbox');
  fireEvent.click(await passChecks());

  expect(mockPush).toHaveBeenCalledWith('/monitor/?nap=30');
  expect(useSettingsStore.getState().activePresetId).toBe('infant_sleep');
  expect(stop).toHaveBeenCalled();
});

it('offers a planned nap duration and opens the watch with the one chosen', async () => {
  render(<NapPage />);
  await screen.findByRole('checkbox');
  expect(screen.getByText(/remind you when your planned nap time is up/)).toBeTruthy();
  fireEvent.change(screen.getByRole('slider'), { target: { value: '45' } });
  fireEvent.click(await passChecks());

  expect(mockPush).toHaveBeenCalledWith('/monitor/?nap=45');
});

it('checks the camera the watch will use', async () => {
  useCameraStore.setState({ deviceId: 'usb-camera' });
  render(<NapPage />);
  await screen.findByRole('checkbox');
  await passCamera();

  expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ video: { deviceId: { exact: 'usb-camera' } } }));
});

it('passes the motion check only on movement that lasts as long as the watch needs to alert', async () => {
  mockChangedFrames = 1; // one changed frame, then a still picture
  render(<NapPage />);
  await screen.findByRole('checkbox');
  await passCamera();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1500)); });

  expect((screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled).toBe(true);
});

it('plays the sound check at the volume the nap alerts will use, without changing the shared volume', async () => {
  render(<NapPage />);
  await screen.findByRole('checkbox');
  await passChecks();

  expect(mockSound.play).toHaveBeenCalledWith('alarm', expect.objectContaining({ volume: 100 }));
  expect(mockSound.updateVolume).not.toHaveBeenCalled();
});

it('says before the nap when quiet hours will make its alerts silent', async () => {
  useSettingsStore.setState({
    isQuietHoursActive: () => true,
    quietHoursSettings: { ...useSettingsStore.getState().quietHoursSettings, enabled: true, mode: 'silent' },
  });
  render(<NapPage />);
  await screen.findByRole('checkbox');
  await passChecks();

  expect(screen.getByText(/this nap's alerts will be silent/)).toBeTruthy();
  expect(mockSound.play).toHaveBeenCalledWith('alarm', expect.objectContaining({ volume: 0 }));
});
