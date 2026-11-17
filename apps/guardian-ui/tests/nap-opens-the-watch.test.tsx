/** @jest-environment jsdom */
/**
 * Nap Mode hands the watch to Motion and sound
 *
 * The nap page offers a planned duration. After its check, Start Nap Mode
 * stops the check's camera, applies the infant_sleep preset, records the nap
 * for this tab under safeos-nap (when it began, its planned minutes, and that
 * the watch starts on arrival) and opens the monitor, which does the watching.
 * The sound check plays at the Nap preset's alert volume, 100 of 100, and
 * nothing on the page sets the volume to 1.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NapPage from '@/app/nap/page';
import { useSettingsStore } from '@/stores/settings-store';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
jest.mock('@/lib/pixel-detection', () => ({
  getPixelDetectionEngine: () => ({ analyzeCanvas: () => ({ changed: true }) }),
  resetPixelDetectionEngine: jest.fn(),
}));
const mockSound = { stopAll: jest.fn(), play: jest.fn(), stop: jest.fn(), test: jest.fn(() => 'test-sound'), updateVolume: jest.fn() };
jest.mock('@/lib/sound-manager', () => ({ useSoundManager: () => mockSound }));

let stop: jest.Mock;

beforeEach(() => {
  mockPush.mockClear();
  mockSound.updateVolume.mockClear();
  sessionStorage.clear();
  stop = jest.fn();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: jest.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) },
  });
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  // getContext is overloaded; type the spy loosely so the 2D context fake fits.
  (jest.spyOn(HTMLCanvasElement.prototype, 'getContext') as unknown as jest.SpyInstance).mockReturnValue({ drawImage: jest.fn() });
});

/** Accepts the notice, passes the camera, motion and sound checks and presses Start Nap Mode. */
async function startNap() {
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Continue to Pre-Nap Test' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Start' })[0]);
  // The camera passes; the motion check starts half a second later and passes on its first changed frame,
  // which enables the sound check's Start.
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Start' })).toHaveLength(1), { timeout: 3000 });
  await waitFor(() => expect((screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled).toBe(false), { timeout: 3000 });
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  // The sound check passes after two seconds, and the last key reads Start Nap Mode.
  const start = await screen.findByRole('button', { name: 'Start Nap Mode' }, { timeout: 4000 });
  await waitFor(() => expect((start as HTMLButtonElement).disabled).toBe(false), { timeout: 4000 });
  fireEvent.click(start);
}

it('opens Motion and sound with the infant_sleep preset, records the nap and keeps the volume', async () => {
  render(<NapPage />);
  await screen.findByRole('checkbox');
  await startNap();

  expect(mockPush).toHaveBeenCalledWith('/monitor/');
  expect(useSettingsStore.getState().activePresetId).toBe('infant_sleep');
  expect(stop).toHaveBeenCalled();
  // The sound check plays at the Nap preset's alert volume; 1 would be one hundredth of it.
  expect(mockSound.updateVolume).toHaveBeenCalledWith(100);
  expect(mockSound.updateVolume).not.toHaveBeenCalledWith(1);
  const nap = JSON.parse(sessionStorage.getItem('safeos-nap') || 'null');
  expect(nap).toMatchObject({ minutes: 30, start: true });
  expect(typeof nap.startedAt).toBe('number');
});

it('offers a planned nap duration and records the one chosen, for the reminder on the watch', async () => {
  render(<NapPage />);
  await screen.findByRole('checkbox');
  expect(screen.getByText(/remind you when your planned nap time is up/)).toBeTruthy();
  fireEvent.change(screen.getByRole('slider'), { target: { value: '45' } });
  await startNap();

  expect(JSON.parse(sessionStorage.getItem('safeos-nap') || 'null')).toMatchObject({ minutes: 45, start: true });
});
