/** @jest-environment jsdom */
/**
 * Nap Mode hands the watch to Motion and sound
 *
 * The nap page checks the camera the watch will use (the one saved in
 * safeos-camera), motion that lasts as long as the watch needs before it
 * alerts, and the sound at the volume the nap's alerts will play at, saying
 * before the start when quiet hours will silence them, now or during the nap.
 * Start Nap Mode stops the check's camera, applies the infant_sleep preset,
 * leaves the planned minutes for the monitor as a one-use hand-off in this tab
 * and opens the monitor.
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
  sessionStorage.clear();
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

const handoff = () => JSON.parse(sessionStorage.getItem('safeos-nap-handoff') || 'null');

/** A time of day, HH:MM, this many minutes from now. */
function clock(minutes: number) {
  const at = new Date(Date.now() + minutes * 60_000);
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

/** Accepts the notice and starts the camera check. */
function startCameraCheck() {
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Continue to Pre-Nap Test' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Start' })[0]);
}

/** Accepts the notice and passes the camera check; the motion check then starts by itself. */
async function passCamera() {
  startCameraCheck();
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

it('opens the watch with the infant_sleep preset, hands it the planned nap and stops the check camera', async () => {
  render(<NapPage />);
  await screen.findByRole('checkbox');
  fireEvent.click(await passChecks());

  expect(mockPush).toHaveBeenCalledWith('/monitor/');
  expect(handoff()).toMatchObject({ minutes: 30 });
  expect(useSettingsStore.getState().activePresetId).toBe('infant_sleep');
  expect(stop).toHaveBeenCalled();
});

it('offers a planned nap duration and hands the watch the one chosen', async () => {
  render(<NapPage />);
  await screen.findByRole('checkbox');
  expect(screen.getByText(/remind you when your planned nap time is up/)).toBeTruthy();
  fireEvent.change(screen.getByRole('slider'), { target: { value: '45' } });
  fireEvent.click(await passChecks());

  expect(mockPush).toHaveBeenCalledWith('/monitor/');
  expect(handoff()).toMatchObject({ minutes: 45 });
});

it('checks the camera the watch will use', async () => {
  useCameraStore.setState({ deviceId: 'usb-camera' });
  render(<NapPage />);
  await screen.findByRole('checkbox');
  await passCamera();

  expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ video: { deviceId: { exact: 'usb-camera' } } }));
});

it('passes the camera check on a camera with no microphone, as the watch does', async () => {
  getUserMedia.mockRejectedValueOnce(Object.assign(new Error('No microphone'), { name: 'NotFoundError' }));
  render(<NapPage />);
  await screen.findByRole('checkbox');
  await passCamera();

  expect(getUserMedia).toHaveBeenLastCalledWith(expect.objectContaining({ audio: false }));
});

it('asks for no camera again when the page closes while the check waits for one', async () => {
  let refuse: (error: Error) => void = () => {};
  getUserMedia.mockImplementationOnce(() => new Promise((_, reject) => { refuse = reject; }));
  const view = render(<NapPage />);
  await screen.findByRole('checkbox');
  startCameraCheck();
  view.unmount();
  await act(async () => { refuse(Object.assign(new Error('No microphone'), { name: 'NotFoundError' })); });

  expect(getUserMedia).toHaveBeenCalledTimes(1);
});

it('stops a camera that opens after the page has closed', async () => {
  let open: (stream: unknown) => void = () => {};
  getUserMedia.mockImplementationOnce(() => new Promise((resolve) => { open = resolve; }));
  const view = render(<NapPage />);
  await screen.findByRole('checkbox');
  startCameraCheck();
  view.unmount();
  await act(async () => { open({ getTracks: () => [{ stop }] }); });

  expect(stop).toHaveBeenCalled();
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

it('says when quiet hours will begin during the nap and silence its alerts', async () => {
  useSettingsStore.setState({
    quietHoursSettings: {
      ...useSettingsStore.getState().quietHoursSettings,
      enabled: true, mode: 'silent', startTime: clock(10), endTime: clock(70), days: [0, 1, 2, 3, 4, 5, 6],
    },
  });
  render(<NapPage />);
  await screen.findByRole('checkbox');
  await passChecks();

  expect(screen.getByText(/Quiet hours start during this nap/)).toBeTruthy();
});
