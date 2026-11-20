/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { fakeCaches } from './helpers/browser-data';
import { BrowserTrack } from './helpers/camera-browser';
import MonitorPage from '@/app/monitor/page';
import SettingsPage from '@/app/settings/page';
import { useLostFoundStore, DEFAULT_SETTINGS } from '@/stores/lost-found-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { getAllMatchFrames, saveSubjectProfile } from '@/lib/client-db';
import { extractColorHistogram, extractDominantColors, calculateAverageColor, extractEdgeSignature, estimateSizeRatio } from '@/lib/visual-fingerprint';
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/contexts/BackendStatusContext', () => ({ useBackendStatus: () => ({ status: { api: 'disconnected' }, config: { apiUrl: '', wsUrl: '' } }) }));

it('a comparison keeps no frame of its own, in memory or in the store, also after Clear All', async () => {
  localStorage.clear();
  // The device has answered the notice about alert pictures, so a watch starts at its key.
  localStorage.setItem('safeos-alert-pictures', JSON.stringify({ state: { keep: true, deleteAfterDays: 3, noticeAnswered: true, inNotifications: false }, version: 0 }));
  const cached = fakeCaches();
  const pixels = new ImageData(new Uint8ClampedArray(8 * 8 * 4).fill(255), 8, 8);
  const context = { drawImage: jest.fn(), getImageData: () => pixels, putImageData: jest.fn() };
  // getContext is overloaded; type the spy loosely so the 2D context fake fits.
  (jest.spyOn(HTMLCanvasElement.prototype, 'getContext') as unknown as jest.SpyInstance).mockReturnValue(context);
  jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,AA==');
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 8 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 8 });
  const videoTrack = new BrowserTrack('video');
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: Object.assign(new EventTarget(), {
    enumerateDevices: jest.fn().mockResolvedValue([]),
    getUserMedia: jest.fn().mockResolvedValue({
      getTracks: () => [videoTrack], getVideoTracks: () => [videoTrack], getAudioTracks: () => [],
    }),
  }) });
  Object.defineProperty(window, 'AudioContext', { configurable: true, value: class {
    createMediaStreamSource() { return { connect: jest.fn() }; }
    createAnalyser() { return { fftSize: 256, frequencyBinCount: 128, getByteFrequencyData: jest.fn(), context: { sampleRate: 44100 } }; }
    close() { return Promise.resolve(); }
  } });
  const fingerprint = { id: 'subject', name: 'Subject', colorHistogram: extractColorHistogram(pixels, 16), dominantColors: extractDominantColors(pixels, 3), averageColor: calculateAverageColor(pixels), colorVariance: 0, estimatedSizeRatio: estimateSizeRatio(pixels), edgeSignature: extractEdgeSignature(pixels, 4), referenceImages: [], createdAt: new Date().toISOString() };
  useSettingsStore.getState().updateGlobalSettings({ pixelDetectionEnabled: false });
  // The watch compares while it runs with Lost and Found chosen and the subject saved.
  const subject = { id: 'subject', name: 'Subject', type: 'other' as const, description: '', fingerprint, referenceImages: [], createdAt: fingerprint.createdAt, lastActiveAt: null, matchCount: 0 };
  await saveSubjectProfile(subject);
  useOnboardingStore.setState({ lostFoundChosen: true });
  useLostFoundStore.setState({ activeSubject: subject, chosenPetId: subject.id, settings: { ...DEFAULT_SETTINGS, scanGridSize: 2, minConfidenceForRecord: 0, alertSound: false, alertNotification: false, adaptiveLighting: false, motionPriority: false } });
  const camera = render(<MonitorPage />);
  await screen.findByRole('radio', { name: 'Lost and Found', checked: true });
  fireEvent.click(screen.getByRole('button', { name: 'Start Monitoring' }));
  await waitFor(() => expect(useLostFoundStore.getState().isWatching).toBe(true));
  // A check that scores is reported; the watch keeps no frame for it. A sighting's picture is the alert's own.
  await waitFor(() => expect(useLostFoundStore.getState().recentMatches.length).toBeGreaterThan(0), { timeout: 4000 });
  expect(useLostFoundStore.getState().matchFrames).toEqual([]);
  render(<SettingsPage />);
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: 'Privacy' }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear All Local Data' }));
  await waitFor(() => expect([...cached]).toEqual([]));
  camera.unmount();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(await getAllMatchFrames()).toEqual([]);
  expect(useLostFoundStore.getState().matchFrames).toEqual([]);
});
