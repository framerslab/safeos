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
 * and opens the monitor. While another tab watches, it asks first, and the nap
 * starts only once the person chose to watch here and that tab has stopped.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import NapPage from '@/app/nap/page';
import { askOtherTabs, takeOverWatch } from '@/lib/tab-channel';
import { useCameraStore } from '@/stores/camera-store';
import { useSettingsStore } from '@/stores/settings-store';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
let mockChangedFrames = Infinity;
let mockSamples = 0;
jest.mock('@/lib/pixel-detection', () => ({
  getPixelDetectionEngine: () => ({ analyzeCanvas: () => { mockSamples += 1; return { changed: mockChangedFrames-- > 0 }; } }),
  resetPixelDetectionEngine: jest.fn(),
}));
const mockSound = {
  stopAll: jest.fn(), play: jest.fn(() => 'check-sound'), stop: jest.fn(), test: jest.fn(() => 'test-sound'), updateVolume: jest.fn(),
  unlockAudio: jest.fn(),
};
jest.mock('@/lib/sound-manager', () => ({ useSoundManager: () => mockSound, getSoundManager: () => mockSound }));
jest.mock('@/lib/tab-channel', () => ({
  ...jest.requireActual('@/lib/tab-channel'),
  askOtherTabs: jest.fn(),
  takeOverWatch: jest.fn(),
}));

const QUESTION = 'Watch here instead? The other tab stops.';

const realQuietHours = useSettingsStore.getState().isQuietHoursActive;
let getUserMedia: jest.Mock;
let stop: jest.Mock;

beforeEach(() => {
  mockPush.mockClear();
  sessionStorage.clear();
  Object.values(mockSound).forEach((fn) => fn.mockClear());
  jest.mocked(askOtherTabs).mockReset().mockResolvedValue({ watching: false });
  jest.mocked(takeOverWatch).mockReset().mockResolvedValue(true);
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
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

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

  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/monitor/'));
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

  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/monitor/'));
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

it("samples the camera for the motion check every 200 ms, the watch's own pace, not on every screen frame", async () => {
  jest.useFakeTimers();
  mockChangedFrames = 0; // a still picture, so the check keeps sampling
  render(<NapPage />);
  await screen.findByRole('checkbox');
  startCameraCheck();
  await act(async () => {}); // the camera opens
  await act(async () => { jest.advanceTimersByTime(500); }); // the motion check starts with its first sample
  mockSamples = 0;

  await act(async () => { jest.advanceTimersByTime(199); });
  expect(mockSamples).toBe(0);
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(mockSamples).toBe(1);
  await act(async () => { jest.advanceTimersByTime(200); });
  expect(mockSamples).toBe(2);
});

/** Holds the check camera's picture before it plays, until the returned call. */
function holdPlay(): () => void {
  let release: () => void = () => {};
  (HTMLMediaElement.prototype.play as unknown as jest.Mock).mockImplementationOnce(
    () => new Promise<void>((resolve) => { release = resolve; }),
  );
  return () => release();
}

it('keeps a camera that starts playing after the person went back out of the new check', async () => {
  const play = holdPlay();
  render(<NapPage />);
  await screen.findByRole('checkbox');
  startCameraCheck();
  await act(async () => {}); // the camera opens; its picture waits to play
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  await act(async () => { play(); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 700)); });

  fireEvent.click(screen.getByRole('button', { name: 'Continue to Pre-Nap Test' }));
  expect(screen.getAllByRole('button', { name: 'Start' })).toHaveLength(2);
});

it('schedules nothing for a camera that starts playing after the page closed', async () => {
  jest.useFakeTimers();
  const play = holdPlay();
  const view = render(<NapPage />);
  await screen.findByRole('checkbox');
  startCameraCheck();
  await act(async () => {});
  view.unmount();
  await act(async () => { play(); });

  expect(jest.getTimerCount()).toBe(0);
});

it('starts no motion check for a page that closed before it began', async () => {
  jest.useFakeTimers();
  const view = render(<NapPage />);
  await screen.findByRole('checkbox');
  startCameraCheck();
  await act(async () => {}); // the camera opens; the motion check would start 500 ms later
  view.unmount();
  await act(async () => { jest.advanceTimersByTime(1_000); });

  expect(jest.getTimerCount()).toBe(0);
});

it('reads the clock again for the quiet-hours warning when the check opens', async () => {
  jest.useFakeTimers({ advanceTimers: true });
  useSettingsStore.setState({
    quietHoursSettings: {
      ...useSettingsStore.getState().quietHoursSettings,
      enabled: true, mode: 'silent', startTime: clock(45), endTime: clock(100), days: [0, 1, 2, 3, 4, 5, 6],
    },
  });
  render(<NapPage />);
  await screen.findByRole('checkbox');
  fireEvent.click(screen.getByRole('checkbox'));

  // Forty minutes on the warning step: the planned 30 minutes now reach quiet hours.
  jest.setSystemTime(Date.now() + 40 * 60_000);
  fireEvent.click(screen.getByRole('button', { name: 'Continue to Pre-Nap Test' }));
  await act(async () => {});

  expect(screen.getByText(/Quiet hours start during this nap/)).toBeTruthy();
});

it('stops the check camera and its sampling when the person goes back, and checks again from the start', async () => {
  mockChangedFrames = 0;
  render(<NapPage />);
  await screen.findByRole('checkbox');
  await passCamera();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 600)); });

  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(stop).toHaveBeenCalled();
  mockSamples = 0;
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1000)); });
  expect(mockSamples).toBe(0);

  fireEvent.click(screen.getByRole('button', { name: 'Continue to Pre-Nap Test' }));
  expect(screen.getAllByRole('button', { name: 'Start' })).toHaveLength(2);
  // No sampling until the camera check runs again.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1000)); });
  expect(mockSamples).toBe(0);
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

it('shows the warning once the clock brings quiet hours into the planned nap', async () => {
  jest.useFakeTimers({ advanceTimers: true });
  useSettingsStore.setState({
    quietHoursSettings: {
      ...useSettingsStore.getState().quietHoursSettings,
      enabled: true, mode: 'silent', startTime: clock(32), endTime: clock(90), days: [0, 1, 2, 3, 4, 5, 6],
    },
  });
  render(<NapPage />);
  await screen.findByRole('checkbox');
  await passChecks();
  expect(screen.queryByText(/Quiet hours start during this nap/)).toBeNull();

  // Three minutes on, quiet hours begin inside the 30-minute nap.
  await act(async () => { jest.setSystemTime(Date.now() + 3 * 60_000); jest.advanceTimersByTime(30_000); });
  expect(screen.getByText(/Quiet hours start during this nap/)).toBeTruthy();
  jest.useRealTimers();
});

it('checks quiet hours again on Start, and shows a warning that has come to apply before the nap starts', async () => {
  jest.useFakeTimers({ advanceTimers: true });
  useSettingsStore.setState({
    quietHoursSettings: {
      ...useSettingsStore.getState().quietHoursSettings,
      enabled: true, mode: 'silent', startTime: clock(32), endTime: clock(90), days: [0, 1, 2, 3, 4, 5, 6],
    },
  });
  render(<NapPage />);
  await screen.findByRole('checkbox');
  const start = await passChecks();

  jest.setSystemTime(Date.now() + 3 * 60_000);
  fireEvent.click(start);
  await act(async () => {});

  expect(mockPush).not.toHaveBeenCalled();
  expect(screen.getByText(/Quiet hours start during this nap/)).toBeTruthy();
  jest.useRealTimers();
});

it('asks first while another tab watches, and starts the nap only once that tab has stopped', async () => {
  jest.mocked(askOtherTabs).mockResolvedValue({ watching: true, way: 'monitor' });
  render(<NapPage />);
  await screen.findByRole('checkbox');
  const start = await passChecks();

  fireEvent.click(start);
  const asked = await screen.findByRole('dialog', { name: QUESTION });
  // The press turns the sound on before the other tabs answer.
  expect(mockSound.unlockAudio).toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
  expect(handoff()).toBeNull();

  // Cancel starts nothing and gives focus back to the key.
  fireEvent.click(within(asked).getByRole('button', { name: 'Cancel' }));
  await act(async () => {});
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(start);
  expect(mockPush).not.toHaveBeenCalled();
  expect(handoff()).toBeNull();
  expect(takeOverWatch).not.toHaveBeenCalled();

  // Watch here stops the other tab; then the nap starts.
  fireEvent.click(start);
  fireEvent.click(within(await screen.findByRole('dialog', { name: QUESTION })).getByRole('button', { name: 'Watch here' }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/monitor/'));
  expect(takeOverWatch).toHaveBeenCalledTimes(1);
  expect(handoff()).toMatchObject({ minutes: 30 });
  expect(useSettingsStore.getState().activePresetId).toBe('infant_sleep');
});
