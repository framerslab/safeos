/** @jest-environment jsdom */
/**
 * The dashboard's start of a Lost and Found watch, answered with Go back
 *
 * On a device that has not answered the notice about alert pictures, the
 * dashboard's start opens the notice before the watch. Go back closes the
 * camera the dashboard opened for the start and ends the pet's watch the
 * start began, also when that pet was the one the watch held already.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import './helpers/browser-data';
import MonitorPage from '@/app/monitor/page';
import { useLostFoundStore } from '@/stores/lost-found-store';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useAlertPicturesStore } from '@/stores/alert-pictures-store';
import { saveSubjectProfile } from '@/lib/client-db';
import { extractColorHistogram, extractDominantColors, calculateAverageColor, extractEdgeSignature, estimateSizeRatio } from '@/lib/visual-fingerprint';

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/contexts/BackendStatusContext', () => ({ useBackendStatus: () => ({ status: { api: 'disconnected' }, config: { apiUrl: '', wsUrl: '' } }) }));

// The dashboard held a Lost and Found start for the pet, with its camera open.
const mockDropStart = jest.fn();
let mockStart: { way: 'lost-found'; pet: string } | null = null;
jest.mock('@/lib/camera-handoff', () => ({
  ...jest.requireActual('@/lib/camera-handoff'),
  takeStart: () => {
    const start = mockStart;
    mockStart = null;
    return start;
  },
  startHeld: () => true,
  dropStart: () => mockDropStart(),
}));

it('Go back on the notice ends the Lost and Found watch the dashboard\'s start began', async () => {
  const pixels = new ImageData(new Uint8ClampedArray(8 * 8 * 4).fill(255), 8, 8);
  // getContext is overloaded; type the spy loosely so the 2D context fake fits.
  (jest.spyOn(HTMLCanvasElement.prototype, 'getContext') as unknown as jest.SpyInstance)
    .mockReturnValue({ drawImage: jest.fn(), getImageData: () => pixels, putImageData: jest.fn() });
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: Object.assign(new EventTarget(), {
    enumerateDevices: jest.fn().mockResolvedValue([]),
    getUserMedia: jest.fn().mockRejectedValue(new Error('the dashboard holds the camera')),
  }) });
  Object.defineProperty(window, 'AudioContext', { configurable: true, value: class {
    createMediaStreamSource() { return { connect: jest.fn() }; }
    createAnalyser() { return { fftSize: 256, frequencyBinCount: 128, getByteFrequencyData: jest.fn(), context: { sampleRate: 44100 } }; }
    close() { return Promise.resolve(); }
  } });

  const createdAt = new Date(0).toISOString();
  const fingerprint = {
    id: 'pet-stripes', name: 'Stripes', colorHistogram: extractColorHistogram(pixels, 16), dominantColors: extractDominantColors(pixels, 3),
    averageColor: calculateAverageColor(pixels), colorVariance: 0, estimatedSizeRatio: estimateSizeRatio(pixels),
    edgeSignature: extractEdgeSignature(pixels, 4), referenceImages: [], createdAt,
  };
  const pet = {
    id: 'pet-stripes', name: 'Stripes', type: 'pet' as const, description: '', fingerprint, referenceImages: [],
    createdAt, lastActiveAt: null, matchCount: 0,
  };
  await saveSubjectProfile(pet);
  // The watch holds Stripes from an earlier visit, and Lost and Found is the way chosen.
  useLostFoundStore.setState({ activeSubject: pet, chosenPetId: pet.id, isWatching: false });
  useOnboardingStore.setState({ lostFoundChosen: true });
  // The device has not answered the notice about alert pictures.
  useAlertPicturesStore.setState({ noticeAnswered: false });
  mockStart = { way: 'lost-found', pet: pet.id };

  render(<MonitorPage />);
  const notice = await screen.findByRole('dialog', { name: 'Each alert keeps a picture' }, { timeout: 5000 });
  // The start began the pet's watch before the notice opened.
  expect(useLostFoundStore.getState().isWatching).toBe(true);

  fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
  await waitFor(() => expect(notice.isConnected).toBe(false));
  expect(mockDropStart).toHaveBeenCalled();
  expect(useLostFoundStore.getState().isWatching).toBe(false);
});
