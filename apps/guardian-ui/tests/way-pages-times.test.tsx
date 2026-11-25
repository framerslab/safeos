/** @jest-environment jsdom */
/**
 * What a running watch writes on this device: the way it runs with, its
 * start, the time each minute and its end; and the word it gives the other
 * tabs, from the press that starts it until it ends.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MonitorPage from '@/app/monitor/page';
import { readSavedPets } from '@/lib/client-db';
import SecurityPage from '@/app/security/page';
import WildlifePage from '@/app/wildlife/page';
import { announceWatch } from '@/lib/tab-channel';
import { showBrowserNotification } from '@/lib/browser-notification';
import { timeWords } from '@/lib/alert-pictures/words';
import { getPersonDetector } from '@/lib/person-detection';
import { getTTSManager } from '@/lib/tts-alerts';
import { forgetVisit } from '@/lib/visit-store';
import { readLastWay, readWatchSession } from '@/lib/watch-session';
import { raisedByThisWatch } from '@/lib/watch-sound';
import { getAnimalDetector, getDangerLabel, type AnimalDetection, type DangerLevel } from '@/lib/animal-detection';
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
import { barredWording } from '../scripts/home-wording.cjs';

jest.mock('@/lib/browser-notification', () => ({ showBrowserNotification: jest.fn() }));

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
    processFrame: jest.fn(async () => null),
    forceDetection: async () => null,
  };
  return { ...jest.requireActual('@/lib/person-detection'), getPersonDetector: () => detector };
});
jest.mock('@/lib/animal-detection', () => {
  const detector = {
    initialize: async () => {},
    dispose() {},
    updateConfig() {},
    processFrame: jest.fn(async () => null),
    forceDetection: async () => null,
  };
  return { ...jest.requireActual('@/lib/animal-detection'), getAnimalDetector: () => detector };
});
// No database here: the pets Watch for reads are given by each case.
jest.mock('@/lib/client-db', () => ({
  ...jest.requireActual('@/lib/client-db'),
  saveIntrusionFrame: jest.fn(),
  readSavedPets: jest.fn(async () => []),
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
  jest.mocked(getPersonDetector().processFrame).mockReset().mockResolvedValue(null);
  jest.mocked(getAnimalDetector().processFrame).mockReset().mockResolvedValue(null);
  jest.mocked(announceWatch).mockImplementation(() => mockEndAnnounce);
  useMonitoringStore.getState().reset();
  useSettingsStore.setState({ globalMute: true });
  useSettingsStore.getState().updateGlobalSettings({ processingMode: 'local', analysisInterval: 1 });
  useSettingsStore.setState({ scenarioOverrides: {} });
  useOnboardingStore.setState({ selectedScenario: null, lostFoundChosen: false });
  useLostFoundStore.setState({ isWatching: false, activeSubject: null, chosenPetId: null });
  jest.mocked(readSavedPets).mockResolvedValue([]);
  useSecurityStore.getState().reset();
  useSecurityStore.setState({ settings: DEFAULT_SECURITY_SETTINGS, intrusionFrames: [] });
  useAnimalAlertStore.setState({
    isMonitoring: false, currentDetections: [], detectionHistory: [], settings: DEFAULT_ANIMAL_SETTINGS,
  });
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
  // The watch compares while it runs with Lost and Found chosen on Watch for
  // and the pet saved on this device.
  jest.mocked(readSavedPets).mockResolvedValue([pet('pet-1')]);
  useOnboardingStore.setState({ lostFoundChosen: true });
  useLostFoundStore.setState({ activeSubject: pet('pet-1'), chosenPetId: 'pet-1' });
  render(<MonitorPage />);
  await screen.findByRole('radio', { name: 'Lost and Found', checked: true });
  await act(async () => {});
  await startMonitoring();
  await waitFor(() => expect(useLostFoundStore.getState().isWatching).toBe(true));
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

it('Stop watching writes the end and tells the other tabs', async () => {
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  expect(mockEndAnnounce).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Stop watching' }));
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
  fireEvent.click(screen.getByRole('button', { name: 'Stop watching' }));
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

const notifications = () => jest.mocked(showBrowserNotification).mock.calls;
const allowNotifications = () => {
  Object.defineProperty(Notification, 'permission', { configurable: true, value: 'granted' });
};

async function peopleInView() {
  const at = new Date('2026-11-18T21:42:40Z').getTime();
  const settings = {
    ...DEFAULT_SECURITY_SETTINGS,
    allowedPersons: 1,
    alerts: { ...DEFAULT_SECURITY_SETTINGS.alerts, flashEnabled: false, sirenEnabled: false },
  };
  useSecurityStore.setState({ settings });
  jest.mocked(getPersonDetector().processFrame).mockResolvedValueOnce({
    personCount: 2,
    detections: [
      { bbox: [0, 0, 40, 40], class: 'person', confidence: 0.82 },
      { bbox: [60, 0, 40, 40], class: 'person', confidence: 0.82 },
    ],
    processingTimeMs: 18,
    timestamp: at,
    motionTriggered: true,
  });
  allowNotifications();
  const view = render(<SecurityPage />);
  await act(async () => {});
  await act(async () => useSecurityStore.getState().setArmingState('armed'));
  await act(async () => { jest.advanceTimersByTime(settings.detectionInterval); });
  expect(useSecurityStore.getState().armingState).toBe('triggered');
  return { ...view, at };
}

it('shows the number of people in view, the time and that the watch allows fewer', async () => {
  const { container, at } = await peopleInView();
  const words = container.querySelector('video')?.closest('main')?.textContent ?? '';
  expect(words).not.toMatch(barredWording);
  expect(words).toContain('2 people in view');
  expect(words).toContain('More than this watch allows.');
  expect(words).toContain(timeWords(at));
});

it("People's notification gives the count, the time and what went over the line", async () => {
  const { at } = await peopleInView();
  expect(notifications()).toHaveLength(1);
  const [title, options] = notifications()[0];
  expect(`${title} ${options?.body}`).not.toMatch(barredWording);
  expect(options?.body).toContain('2 people in view');
  expect(options?.body).toContain('More than this watch allows.');
  expect(options?.body).toContain(timeWords(at));
});

const zebra = (): AnimalDetection => ({
  ...sighting(), id: 'zebra-1', type: 'zebra', displayName: 'Zebra', dangerLevel: 'medium',
  confidence: 0.82, timestamp: new Date('2026-11-18T21:42:40Z').getTime(),
});

async function wildlifeInView() {
  const animal = zebra();
  useAnimalAlertStore.setState({
    settings: { ...DEFAULT_ANIMAL_SETTINGS, alertMode: 'silent', flashScreen: false },
  });
  jest.mocked(getAnimalDetector().processFrame).mockResolvedValueOnce({
    animals: [animal], largeAnimals: [], smallAnimals: [], dangerousAnimals: [], processingTimeMs: 18,
  });
  allowNotifications();
  render(<WildlifePage />);
  await act(async () => {});
  await act(async () => useAnimalAlertStore.getState().setMonitoring(true));
  await act(async () => { jest.advanceTimersByTime(1_000); });
  return animal;
}

it('shows a zebra sighting without a score beside its name', async () => {
  const animal = await wildlifeInView();
  const sightings = screen.getAllByText('Zebra', { exact: true });
  expect(sightings).toHaveLength(2);
  for (const name of sightings) {
    const words = name.parentElement?.textContent ?? '';
    expect(words).not.toMatch(barredWording);
    expect(words).toContain(timeWords(animal.timestamp));
  }
});

it("Wildlife's notification names the animal and gives the time", async () => {
  const animal = await wildlifeInView();
  expect(notifications()).toHaveLength(1);
  const [title, options] = notifications()[0];
  expect(`${title} ${options?.body}`).not.toMatch(barredWording);
  expect(options?.body).toBe(`Zebra in view at ${timeWords(animal.timestamp)}.`);
});

it('shows the Wildlife alert line as a plain number', async () => {
  render(<WildlifePage />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  const slider = screen.getAllByRole('slider')[0];
  expect(slider.parentElement?.textContent).not.toMatch(/%/);
  expect(slider.parentElement?.textContent).toContain('50');
});

function luminance(rgb: string) {
  const channels = rgb.match(/\d+/g)?.map((value) => {
    const s = Number(value) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  if (!channels || channels.length !== 3) throw new Error(`Expected an opaque RGB colour, got "${rgb}"`);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

it.each<DangerLevel>(['medium', 'none', 'low', 'high', 'extreme'])(
  'gives the %s Wildlife badge 7:1 contrast in both looks',
  async (level) => {
    useAnimalAlertStore.setState({ currentDetections: [{ ...zebra(), dangerLevel: level }] });
    render(<WildlifePage />);
    await act(async () => {});
    const badge = screen.getByText(getDangerLabel(level), { exact: true });
    const original = document.documentElement.className;
    try {
      for (const look of ['light', 'dark']) {
        document.documentElement.className = look;
        const { color, backgroundColor } = getComputedStyle(badge);
        const ink = luminance(color);
        const ground = luminance(backgroundColor);
        expect((Math.max(ink, ground) + 0.05) / (Math.min(ink, ground) + 0.05)).toBeGreaterThanOrEqual(7);
      }
    } finally {
      document.documentElement.className = original;
    }
  }
);
