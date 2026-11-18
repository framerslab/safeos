/** @jest-environment jsdom */
/**
 * What a running watch writes on this device: the way it runs with, its
 * start, the time each minute and its end; and the word it gives the other
 * tabs, from the press that starts it until it ends.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import MonitorPage from '@/app/monitor/page';
import SecurityPage from '@/app/security/page';
import WildlifePage from '@/app/wildlife/page';
import { announceWatch } from '@/lib/tab-channel';
import { getTTSManager } from '@/lib/tts-alerts';
import { forgetVisit } from '@/lib/visit-store';
import { readLastWay, readWatchSession } from '@/lib/watch-session';
import { raisedByThisWatch } from '@/lib/watch-sound';
import type { AnimalDetection } from '@/lib/animal-detection';
import {
  calculateAverageColor,
  estimateSizeRatio,
  extractColorHistogram,
  extractDominantColors,
  extractEdgeSignature,
} from '@/lib/visual-fingerprint';
import { useMonitoringStore } from '@/stores/monitoring-store';
import { useLostFoundStore, type SubjectProfile } from '@/stores/lost-found-store';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { DEFAULT_SECURITY_SETTINGS, useSecurityStore } from '@/stores/security-store';
import { DEFAULT_ANIMAL_SETTINGS, useAnimalAlertStore } from '@/stores/animal-alert-store';
import { useSettingsStore } from '@/stores/settings-store';
import { installCameraBrowser, startMonitoring } from './helpers/camera-browser';

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));
const mockBackendConfig = { wsUrl: 'wss://monitor.example.test' };
jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({ config: mockBackendConfig }),
}));
const mockEndAnnounce = jest.fn();
jest.mock('@/lib/tab-channel', () => ({
  ...jest.requireActual('@/lib/tab-channel'),
  announceWatch: jest.fn(() => mockEndAnnounce),
}));

// People's and Wildlife's pages with a model that is ready and detectors that
// see nothing; their camera feed is the real one, on the stand-in camera.
const mockModel = { status: 'ready', setupComplete: true };
jest.mock('@/lib/detection-model', () => ({
  ...jest.requireActual('@/lib/detection-model'),
  useDetectionModel: () => mockModel,
}));
jest.mock('@/components/ModelDownloadProgress', () => ({ ModelDownloadProgress: () => null }));
jest.mock('@/lib/person-detection', () => {
  const detector = {
    initialize: async () => {},
    dispose() {},
    updateConfig() {},
    processFrame: async () => null,
    forceDetection: async () => null,
  };
  return { ...jest.requireActual('@/lib/person-detection'), getPersonDetector: () => detector };
});
jest.mock('@/lib/animal-detection', () => {
  const detector = {
    initialize: async () => {},
    dispose() {},
    updateConfig() {},
    processFrame: async () => null,
    forceDetection: async () => null,
  };
  return { ...jest.requireActual('@/lib/animal-detection'), getAnimalDetector: () => detector };
});
jest.mock('@/lib/client-db', () => ({
  ...jest.requireActual('@/lib/client-db'),
  saveIntrusionFrame: jest.fn(),
}));
jest.mock('@/lib/tts-alerts', () => {
  const manager = { initialize: async () => {}, setCustomMessages() {}, speak: jest.fn(), stop: jest.fn() };
  return {
    ...jest.requireActual('@/lib/tts-alerts'),
    getTTSManager: () => manager,
    startSecurityAlert: jest.fn(),
    stopSecurityAlert: jest.fn(),
  };
});

const speech = () => getTTSManager() as unknown as { speak: jest.Mock; stop: jest.Mock };

// The function a page gave the channel to end its watch when another tab
// takes over, or undefined when it gave none.
const stopGivenFor = (way: string) => jest.mocked(announceWatch).mock.calls.find(([given]) => given === way)?.[1];

function pet(id: string): SubjectProfile {
  const pixels = new ImageData(new Uint8ClampedArray(8 * 8 * 4).fill(255), 8, 8);
  const createdAt = new Date().toISOString();
  return {
    id,
    name: 'Biscuit',
    type: 'pet',
    description: '',
    fingerprint: {
      id,
      name: 'Biscuit',
      colorHistogram: extractColorHistogram(pixels, 16),
      dominantColors: extractDominantColors(pixels, 3),
      averageColor: calculateAverageColor(pixels),
      colorVariance: 0,
      estimatedSizeRatio: estimateSizeRatio(pixels),
      edgeSignature: extractEdgeSignature(pixels, 4),
      referenceImages: [],
      createdAt,
    },
    referenceImages: [],
    createdAt,
    lastActiveAt: null,
    matchCount: 0,
  };
}

const sighting = (): AnimalDetection => ({
  id: 'fox-1',
  type: 'fox',
  displayName: 'Fox',
  sizeCategory: 'medium',
  dangerLevel: 'low',
  confidence: 0.9,
  bbox: [0, 0, 40, 40],
  timestamp: Date.now(),
});

let browser: ReturnType<typeof installCameraBrowser>;
beforeEach(() => {
  mockBackendConfig.wsUrl = 'wss://monitor.example.test';
  jest.useFakeTimers();
  localStorage.clear();
  forgetVisit();
  jest.clearAllMocks();
  jest.mocked(announceWatch).mockImplementation(() => mockEndAnnounce);
  useMonitoringStore.getState().reset();
  useSettingsStore.setState({ globalMute: true });
  useSettingsStore.getState().updateGlobalSettings({ processingMode: 'local', analysisInterval: 1 });
  useSettingsStore.setState({ scenarioOverrides: {} });
  useOnboardingStore.setState({ selectedScenario: null });
  useLostFoundStore.setState({ isWatching: false, activeSubject: null });
  useSecurityStore.setState({ armingState: 'disarmed', armingTimeRemaining: 0, settings: DEFAULT_SECURITY_SETTINGS });
  useAnimalAlertStore.setState({ isMonitoring: false, currentDetections: [], settings: DEFAULT_ANIMAL_SETTINGS });
  browser = installCameraBrowser();
});
afterEach(() => { cleanup(); jest.useRealTimers(); jest.restoreAllMocks(); });

it('a Motion and sound watch writes its way and its start when the camera shows a picture', async () => {
  render(<MonitorPage />);
  await act(async () => {});
  const pressed = Date.now();
  await startMonitoring();
  expect(readLastWay()).toEqual({ way: 'monitor' });
  const session = readWatchSession();
  expect(session).toMatchObject({ endedAt: null });
  expect(session!.startedAt).toBeGreaterThanOrEqual(pressed);
  expect(session!.startedAt).toBeLessThanOrEqual(Date.now());
  expect(announceWatch).toHaveBeenCalledWith('monitor', expect.any(Function));
});

it('tells the other tabs from the press, before the camera answers', async () => {
  let answer!: (stream: MediaStream) => void;
  browser.getUserMedia.mockImplementationOnce(() => new Promise<MediaStream>((resolve) => { answer = resolve; }));
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  expect(announceWatch).toHaveBeenCalledTimes(1);
  expect(announceWatch).toHaveBeenCalledWith('monitor', expect.any(Function));
  expect(readWatchSession()).toBeNull();
  await act(async () => { answer(browser.stream); });
  await act(async () => {});
  expect(useMonitoringStore.getState().isStreaming).toBe(true);
  expect(readWatchSession()).toMatchObject({ endedAt: null });
  expect(announceWatch).toHaveBeenCalledTimes(1);
});

it('a Lost and Found watch writes the pet it looks for', async () => {
  useLostFoundStore.setState({ isWatching: true, activeSubject: pet('pet-1') });
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  expect(readLastWay()).toEqual({ way: 'lost-found', pet: 'pet-1' });
  expect(announceWatch).toHaveBeenCalledWith('lost-found', expect.any(Function));
});

it('writes the time each minute while it runs', async () => {
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  const startedAt = readWatchSession()?.startedAt;
  expect(startedAt).toEqual(expect.any(Number));
  act(() => { jest.advanceTimersByTime(60_000); });
  expect(readWatchSession()).toMatchObject({ seenAt: startedAt! + 60_000, endedAt: null });
});

it('Stop Monitoring writes the end and tells the other tabs', async () => {
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  expect(mockEndAnnounce).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Stop Monitoring' }));
  await act(async () => {});
  expect(readWatchSession()?.endedAt).toEqual(expect.any(Number));
  expect(mockEndAnnounce).toHaveBeenCalledTimes(1);
});

it('leaving the page writes the end', async () => {
  const view = render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  view.unmount();
  expect(readWatchSession()?.endedAt).toEqual(expect.any(Number));
});

it('a camera the browser holds back for a moment starts no new watch', async () => {
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  const first = readWatchSession();
  expect(first).toMatchObject({ endedAt: null });
  act(() => { jest.advanceTimersByTime(5_000); });
  act(() => browser.video.mute());
  act(() => { jest.advanceTimersByTime(5_000); });
  act(() => browser.video.unmute());
  expect(useMonitoringStore.getState().isStreaming).toBe(true);
  expect(readWatchSession()).toMatchObject({ startedAt: first!.startedAt, endedAt: null });
});

it('stops when another tab takes over', async () => {
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  const stop = stopGivenFor('monitor');
  expect(stop).toBeDefined();
  act(() => stop!());
  expect(browser.video.stop).toHaveBeenCalled();
  expect(useMonitoringStore.getState().isStreaming).toBe(false);
});

it('an alert the watch raises is named as this watch\'s, and a new watch forgets it', async () => {
  useSettingsStore.setState({ globalMute: true });
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  act(() => useMonitoringStore.getState().addAlert({ id: 'now', streamId: 'camera', severity: 'low', message: 'x', acknowledged: false }));
  expect(raisedByThisWatch('now')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Stop Monitoring' }));
  await act(async () => {});
  await startMonitoring();
  expect(raisedByThisWatch('now')).toBe(false);
});

it('People writes its way when it is armed and its end when it is disarmed', async () => {
  render(<SecurityPage />);
  await act(async () => {});
  act(() => useSecurityStore.getState().arm());
  expect(readLastWay()).toEqual({ way: 'security' });
  expect(readWatchSession()).toMatchObject({ endedAt: null });
  act(() => useSecurityStore.getState().disarm());
  expect(readWatchSession()?.endedAt).toEqual(expect.any(Number));
});

it('Wildlife writes its way when its watch starts and its end when it stops', async () => {
  render(<WildlifePage />);
  await act(async () => {});
  act(() => useAnimalAlertStore.getState().setMonitoring(true));
  expect(readLastWay()).toEqual({ way: 'wildlife' });
  expect(readWatchSession()).toMatchObject({ endedAt: null });
  act(() => useAnimalAlertStore.getState().setMonitoring(false));
  expect(readWatchSession()?.endedAt).toEqual(expect.any(Number));
});

it("another tab's takeover ends Wildlife's watch in full", async () => {
  useAnimalAlertStore.setState({ isMonitoring: true, currentDetections: [sighting()] });
  render(<WildlifePage />);
  await act(async () => {});
  const stop = stopGivenFor('wildlife');
  expect(stop).toBeDefined();
  act(() => stop!());
  const store = useAnimalAlertStore.getState();
  expect(store.isMonitoring).toBe(false);
  expect(store.currentDetections).toEqual([]);
  expect(speech().stop).toHaveBeenCalled();
  expect(mockEndAnnounce).toHaveBeenCalledTimes(1);
  // The page is still on screen, ready to start again.
  expect(screen.getByRole('button', { name: 'Start Monitoring' })).toBeTruthy();
});
