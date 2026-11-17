/** @jest-environment jsdom */
/**
 * Nap Mode hands the watch to Motion and sound
 *
 * After its check, Start Nap Mode applies the infant_sleep preset, stops the
 * check's camera and opens the monitor, which does the watching. The page
 * itself runs no detector once the check is done, and it offers no planned
 * duration, since nothing would use one.
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

beforeEach(() => {
  mockPush.mockClear();
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  // getContext is overloaded; type the spy loosely so the 2D context fake fits.
  (jest.spyOn(HTMLCanvasElement.prototype, 'getContext') as unknown as jest.SpyInstance).mockReturnValue({ drawImage: jest.fn() });
});

it('offers no planned nap duration, since the watch keeps no nap timer', async () => {
  render(<NapPage />);
  await screen.findByRole('checkbox');
  expect(screen.queryByRole('slider')).toBeNull();
  expect(screen.queryByText(/Planned nap duration/)).toBeNull();
});

it('opens Motion and sound with the infant_sleep preset after the check, and stops the check camera', async () => {
  const stop = jest.fn();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: jest.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) },
  });
  render(<NapPage />);
  fireEvent.click(await screen.findByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Continue to Pre-Nap Test' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Start' })[0]);
  // The camera passes, the motion check starts half a second later and passes on its first changed frame.
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Start' })).toHaveLength(1), { timeout: 3000 });
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  const start = await screen.findByRole('button', { name: 'Start Nap Mode' }, { timeout: 4000 });
  await waitFor(() => expect((start as HTMLButtonElement).disabled).toBe(false), { timeout: 4000 });
  fireEvent.click(start);

  expect(mockPush).toHaveBeenCalledWith('/monitor/');
  expect(useSettingsStore.getState().activePresetId).toBe('infant_sleep');
  expect(stop).toHaveBeenCalled();
  expect(screen.queryByText('Nap Mode Active')).toBeNull();
});
