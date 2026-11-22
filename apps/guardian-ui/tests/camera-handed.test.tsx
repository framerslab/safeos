/** @jest-environment jsdom */
/**
 * The camera opened elsewhere and taken by the way's page
 *
 * The dashboard's key opens the camera and holds it, with the watch it was
 * opened for, until the way's page takes it: the page starts that watch with
 * no second press and its feed uses the open camera with no second request
 * to the browser. A page opened any other way starts nothing, a camera no
 * page took is closed, and each way's own start key, and Resume nap, asks
 * first while another tab watches.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import MonitorPage from '@/app/monitor/page';
import LostFoundPage from '@/app/lost-found/page';
import SecurityPage from '@/app/security/page';
import WildlifePage from '@/app/wildlife/page';
import { dropStart, holdStart } from '@/lib/camera-handoff';
import { cameraConstraints } from '@/lib/camera-constraints';
import { getSubjectProfile, saveSubjectProfile, type SubjectProfileDB } from '@/lib/client-db';
import { getPersonDetector } from '@/lib/person-detection';
import { getAnimalDetector } from '@/lib/animal-detection';
import { askOtherTabs, takeOverWatch } from '@/lib/tab-channel';
import { readLastWay } from '@/lib/watch-session';
import {
  calculateAverageColor,
  estimateSizeRatio,
  extractColorHistogram,
  extractDominantColors,
  extractEdgeSignature,
} from '@/lib/visual-fingerprint';
import { useMonitoringStore } from '@/stores/monitoring-store';
import { useLostFoundStore } from '@/stores/lost-found-store';
import { DEFAULT_SECURITY_SETTINGS, useSecurityStore } from '@/stores/security-store';
import { DEFAULT_ANIMAL_SETTINGS, useAnimalAlertStore } from '@/stores/animal-alert-store';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useCameraStore } from '@/stores/camera-store';
import { installCameraBrowser, startMonitoring } from './helpers/camera-browser';

require('fake-indexeddb/auto');
// The test browser has no structuredClone, which the database needs to keep a record.
Object.defineProperty(global, 'structuredClone', { configurable: true, value: (value: unknown) =>
  require('v8').deserialize(require('v8').serialize(value)),
});

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: mockPush, replace: () => {} }),
}));
const mockBackendConfig = { wsUrl: 'wss://monitor.example.test' };
jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({ config: mockBackendConfig }),
}));
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
    processFrame: jest.fn(),
    forceDetection: jest.fn(),
  };
  return { ...jest.requireActual('@/lib/person-detection'), getPersonDetector: () => detector };
});
jest.mock('@/lib/animal-detection', () => {
  const detector = {
    initialize: async () => {},
    dispose() {},
    updateConfig() {},
    processFrame: jest.fn(),
    forceDetection: jest.fn(),
  };
  return { ...jest.requireActual('@/lib/animal-detection'), getAnimalDetector: () => detector };
});
jest.mock('@/lib/tts-alerts', () => {
  const manager = { initialize: async () => {}, setCustomMessages() {}, speak: jest.fn(), stop: jest.fn() };
  return {
    ...jest.requireActual('@/lib/tts-alerts'),
    getTTSManager: () => manager,
    startSecurityAlert: jest.fn(),
    stopSecurityAlert: jest.fn(),
  };
});
jest.mock('@/lib/tab-channel', () => ({
  ...jest.requireActual('@/lib/tab-channel'),
  askOtherTabs: jest.fn(),
  takeOverWatch: jest.fn(),
}));
// The pet's read, so a test can hold it while the page's keys are pressed.
jest.mock('@/lib/client-db', () => {
  const actual = jest.requireActual('@/lib/client-db');
  return { ...actual, getSubjectProfile: jest.fn(actual.getSubjectProfile) };
});
const readPet = jest.requireActual<typeof import('@/lib/client-db')>('@/lib/client-db').getSubjectProfile;

/** Holds the pet's read until `found` is called with what the read gives. */
function holdPetRead(): (found: SubjectProfileDB | null) => void {
  let found!: (value: SubjectProfileDB | null) => void;
  const read = new Promise<SubjectProfileDB | null>((resolve) => { found = resolve; });
  jest.mocked(getSubjectProfile).mockImplementation(() => read);
  return found;
}

const QUESTION = 'Watch here instead? The other tab stops.';
type Detector = { processFrame: jest.Mock; forceDetection: jest.Mock };

function pet(id: string): SubjectProfileDB {
  const pixels = new ImageData(new Uint8ClampedArray(8 * 8 * 4).fill(200), 8, 8);
  const createdAt = new Date().toISOString();
  return {
    id,
    name: 'Mittens',
    type: 'pet',
    description: '',
    fingerprint: {
      id,
      name: 'Mittens',
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

/** Lets the page's start, its database read and its feed run to the watch. */
async function watchRuns() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Stop watching' })).toBeTruthy());
}

let browser: ReturnType<typeof installCameraBrowser>;

beforeEach(() => {
  dropStart();
  jest.useFakeTimers();
  localStorage.clear();
  mockPush.mockReset();
  mockModel.status = 'ready';
  mockBackendConfig.wsUrl = 'wss://monitor.example.test';
  for (const detector of [getPersonDetector() as unknown as Detector, getAnimalDetector() as unknown as Detector]) {
    detector.processFrame.mockReset().mockResolvedValue(null);
    detector.forceDetection.mockReset().mockResolvedValue(null);
  }
  jest.mocked(askOtherTabs).mockReset().mockResolvedValue({ watching: false });
  jest.mocked(takeOverWatch).mockReset().mockResolvedValue(true);
  jest.mocked(getSubjectProfile).mockReset().mockImplementation(readPet);
  useMonitoringStore.getState().reset();
  useSettingsStore.setState({ globalMute: true });
  useSettingsStore.getState().updateGlobalSettings({ processingMode: 'local', analysisInterval: 1 });
  useSettingsStore.setState({ scenarioOverrides: {} });
  useOnboardingStore.setState({ selectedScenario: null });
  useSecurityStore.setState({
    armingState: 'disarmed',
    armingTimeRemaining: 0,
    currentPersonCount: 0,
    lastTriggerTime: null,
    intrusionFrames: [],
    settings: DEFAULT_SECURITY_SETTINGS,
  });
  useAnimalAlertStore.setState({
    isMonitoring: false,
    currentDetections: [],
    detectionHistory: [],
    settings: DEFAULT_ANIMAL_SETTINGS,
  });
  useLostFoundStore.setState({ isWatching: false, activeSubject: null });
  browser = installCameraBrowser();
});

afterEach(() => {
  cleanup();
  useCameraStore.setState({ deviceId: '' });
  jest.useRealTimers();
  jest.restoreAllMocks();
  window.history.replaceState(null, '');
});

it("Motion and sound's page takes the open camera and starts with no press and no second request", async () => {
  holdStart({ way: 'monitor' }, browser.stream);
  render(<MonitorPage />);
  await act(async () => {});
  expect(screen.getByRole('button', { name: 'Stop watching' })).toBeTruthy();
  expect(browser.getUserMedia).not.toHaveBeenCalled();
  expect(useMonitoringStore.getState().isStreaming).toBe(true);
});

it('a Lost and Found start chooses the pet and runs its check', async () => {
  await saveSubjectProfile(pet('pet-1'));
  holdStart({ way: 'lost-found', pet: 'pet-1' }, browser.stream);
  render(<MonitorPage />);
  await watchRuns();
  expect(useLostFoundStore.getState().activeSubject?.id).toBe('pet-1');
  expect(useLostFoundStore.getState().isWatching).toBe(true);
  expect(readLastWay()).toEqual({ way: 'lost-found', pet: 'pet-1' });
  expect(browser.getUserMedia).not.toHaveBeenCalled();
});

it('a takeover while the page reads the pet starts no watch and asks the browser for no camera', async () => {
  await saveSubjectProfile(pet('pet-1'));
  const release = jest.fn();
  holdStart({ way: 'lost-found', pet: 'pet-1' }, browser.stream, release);
  render(<MonitorPage />);
  // Another tab takes over while the pet is read: the claim's stop drops the held start.
  dropStart();
  expect(release).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(200);
    });
  }
  expect(browser.getUserMedia).not.toHaveBeenCalled();
  expect(useMonitoringStore.getState().isStreaming).toBe(false);
  expect(useLostFoundStore.getState().isWatching).toBe(false);
  expect(screen.getByRole('button', { name: 'Start watching' })).toBeTruthy();
});

it('a pet read that ends after Start watching, before the feed takes the open camera, runs one Lost and Found watch on that camera', async () => {
  await saveSubjectProfile(pet('pet-1'));
  const found = holdPetRead();
  holdStart({ way: 'lost-found', pet: 'pet-1' }, browser.stream);
  render(<MonitorPage />);
  await act(async () => {});

  // The press's start runs before the read ends, and the feed takes the camera after both.
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Start watching' }));
    found(pet('pet-1'));
  });

  await watchRuns();
  expect(useLostFoundStore.getState().activeSubject?.id).toBe('pet-1');
  expect(useLostFoundStore.getState().isWatching).toBe(true);
  expect(useMonitoringStore.getState().isStreaming).toBe(true);
  expect(browser.getUserMedia).not.toHaveBeenCalled();
});

it('a pet read that ends after Start watching and Stop watching starts no watch again', async () => {
  await saveSubjectProfile(pet('pet-1'));
  const found = holdPetRead();
  holdStart({ way: 'lost-found', pet: 'pet-1' }, browser.stream);
  render(<MonitorPage />);
  await act(async () => {});

  fireEvent.click(screen.getByRole('button', { name: 'Start watching' }));
  await watchRuns();
  fireEvent.click(screen.getByRole('button', { name: 'Stop watching' }));
  await act(async () => {});
  expect(screen.getByRole('button', { name: 'Start watching' })).toBeTruthy();

  await act(async () => { found(pet('pet-1')); });
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(200);
    });
  }
  expect(useMonitoringStore.getState().isStreaming).toBe(false);
  expect(useLostFoundStore.getState().isWatching).toBe(false);
  expect(screen.getByRole('button', { name: 'Start watching' })).toBeTruthy();
  expect(browser.getUserMedia).not.toHaveBeenCalled();
});

it('a Lost and Found start whose pet is gone watches with Motion and sound', async () => {
  holdStart({ way: 'lost-found', pet: 'pet-gone' }, browser.stream);
  render(<MonitorPage />);
  await watchRuns();
  expect(useLostFoundStore.getState().isWatching).toBe(false);
  expect(useMonitoringStore.getState().isStreaming).toBe(true);
  expect(readLastWay()).toEqual({ way: 'monitor' });
});

it('a reload starts nothing', async () => {
  render(<MonitorPage />);
  await act(async () => {});
  expect(screen.getByRole('button', { name: 'Start watching' })).toBeTruthy();
  expect(browser.getUserMedia).not.toHaveBeenCalled();
});

it('the feed asks the browser itself when nothing is held', async () => {
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  expect(browser.getUserMedia).toHaveBeenCalledTimes(1);
  expect(browser.getUserMedia).toHaveBeenCalledWith(cameraConstraints('', true));
});

it('a page left before its feed took the camera closes it', async () => {
  mockModel.status = 'loading';
  holdStart({ way: 'security' }, browser.stream);
  const view = render(<SecurityPage />);
  await act(async () => {});
  expect(browser.video.stop).not.toHaveBeenCalled();
  view.unmount();
  expect(browser.video.stop).toHaveBeenCalled();
});

it('People arms itself from a start and its feed takes the camera when the countdown ends', async () => {
  holdStart({ way: 'security' }, browser.stream);
  render(<SecurityPage />);
  await act(async () => {});
  await act(async () => {});
  expect(useSecurityStore.getState().armingState).toBe('arming');
  act(() => useSecurityStore.getState().setArmingState('armed'));
  await act(async () => {});
  expect(screen.getByText('LIVE')).toBeTruthy();
  expect(browser.getUserMedia).not.toHaveBeenCalled();
  // People's feed listens to nothing: the camera's sound track is closed and dropped.
  expect(browser.audio.stop).toHaveBeenCalledTimes(1);
  expect(browser.stream.getAudioTracks()).toEqual([]);
});

it('Wildlife starts from a start with the held camera', async () => {
  holdStart({ way: 'wildlife' }, browser.stream);
  render(<WildlifePage />);
  await act(async () => {});
  await act(async () => {});
  expect(useAnimalAlertStore.getState().isMonitoring).toBe(true);
  expect(screen.getByText('LIVE')).toBeTruthy();
  expect(browser.getUserMedia).not.toHaveBeenCalled();
});

it('People disarmed during its countdown closes the held camera', async () => {
  const release = jest.fn();
  holdStart({ way: 'security' }, browser.stream, release);
  render(<SecurityPage />);
  await act(async () => {});
  await act(async () => {});
  expect(useSecurityStore.getState().armingState).toBe('arming');
  act(() => useSecurityStore.getState().disarm());
  expect(browser.video.stop).toHaveBeenCalled();
  expect(release).toHaveBeenCalledTimes(1);
});

it("each way's own start key asks first while another tab watches", async () => {
  jest.mocked(askOtherTabs).mockResolvedValue({ watching: true, way: 'monitor' });
  const asks = async (key: HTMLElement) => {
    fireEvent.click(key);
    await act(async () => {});
    const dialog = screen.getByRole('dialog', { name: QUESTION });
    expect(browser.getUserMedia).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await act(async () => {});
    expect(screen.queryByRole('dialog')).toBeNull();
  };

  render(<MonitorPage />);
  await act(async () => {});
  await asks(screen.getByRole('button', { name: 'Start watching' }));
  expect(screen.getByRole('button', { name: 'Start watching' })).toBeTruthy();
  expect(useMonitoringStore.getState().isStreaming).toBe(false);
  cleanup();

  useLostFoundStore.setState({ activeSubject: pet('pet-1'), isWatching: false });
  render(<LostFoundPage />);
  await asks(await screen.findByRole('button', { name: 'Start Monitoring' }));
  expect(useLostFoundStore.getState().isWatching).toBe(false);
  expect(mockPush).not.toHaveBeenCalled();
  cleanup();

  render(<SecurityPage />);
  await act(async () => {});
  await act(async () => {});
  await asks(screen.getByRole('button', { name: 'ARM SYSTEM' }));
  expect(useSecurityStore.getState().armingState).toBe('disarmed');
  cleanup();

  render(<WildlifePage />);
  await act(async () => {});
  await act(async () => {});
  await asks(screen.getByRole('button', { name: 'Start Monitoring' }));
  expect(useAnimalAlertStore.getState().isMonitoring).toBe(false);
});

it('Resume nap asks first while another tab watches, and starts once that tab has stopped', async () => {
  jest.mocked(askOtherTabs).mockResolvedValue({ watching: true, way: 'monitor' });
  // A nap kept in this history entry: the page was reloaded during it.
  window.history.replaceState({ safeosNap: { startedAt: Date.now(), minutes: 30 } }, '');
  render(<MonitorPage />);
  await act(async () => {});

  fireEvent.click(screen.getByRole('button', { name: 'Resume nap' }));
  await act(async () => {});
  const asked = screen.getByRole('dialog', { name: QUESTION });
  expect(browser.getUserMedia).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Stop watching' })).toBeNull();

  fireEvent.click(within(asked).getByRole('button', { name: 'Watch here' }));
  await act(async () => {});
  expect(takeOverWatch).toHaveBeenCalledTimes(1);
  await watchRuns();
});

/** An answer from the other tabs that comes when the test gives it. */
function heldAnswer() {
  let give!: (answer: { watching: boolean; way?: 'monitor' }) => void;
  jest.mocked(askOtherTabs).mockReturnValueOnce(new Promise((resolve) => { give = resolve; }));
  return (answer: { watching: boolean; way?: 'monitor' } = { watching: false }) => act(async () => { give(answer); });
}

it('a Lost and Found start whose pet was changed while the other tabs answered starts nothing', async () => {
  const answer = heldAnswer();
  useLostFoundStore.setState({ activeSubject: pet('pet-1'), isWatching: false });
  render(<LostFoundPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Start Monitoring' }));
  act(() => useLostFoundStore.setState({ activeSubject: { ...pet('pet-2'), name: 'Rex' } }));

  await answer();

  expect(useLostFoundStore.getState().isWatching).toBe(false);
  expect(mockPush).not.toHaveBeenCalled();
});

it('a Lost and Found start goes on when the same pet is still chosen', async () => {
  const answer = heldAnswer();
  useLostFoundStore.setState({ activeSubject: pet('pet-1'), isWatching: false });
  render(<LostFoundPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Start Monitoring' }));

  await answer();

  expect(useLostFoundStore.getState().isWatching).toBe(true);
  expect(mockPush).toHaveBeenCalledWith('/monitor');
});

it('End nap pressed while Resume nap waits for the other tabs starts no camera', async () => {
  const answer = heldAnswer();
  window.history.replaceState({ safeosNap: { startedAt: Date.now(), minutes: 30 } }, '');
  render(<MonitorPage />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Resume nap' }));
  fireEvent.click(screen.getByRole('button', { name: 'End nap' }));

  await answer();
  await act(async () => {});

  expect(browser.getUserMedia).not.toHaveBeenCalled();
  expect(useMonitoringStore.getState().isStreaming).toBe(false);
  expect(screen.getByRole('button', { name: 'Start watching' })).toBeTruthy();
});

it('a takeover while People waits for its model arms nothing when the model is ready', async () => {
  mockModel.status = 'loading';
  holdStart({ way: 'security' }, browser.stream);
  const view = render(<SecurityPage />);
  await act(async () => {});
  // Another tab takes over: the claim's stop drops the held start.
  dropStart();

  mockModel.status = 'ready';
  view.rerender(<SecurityPage />);
  await act(async () => {});
  await act(async () => {});

  expect(useSecurityStore.getState().armingState).toBe('disarmed');
  expect(browser.getUserMedia).not.toHaveBeenCalled();
});

it('Wildlife started from the dashboard ends its watch and closes the camera when its animal check cannot start', async () => {
  const detector = getAnimalDetector() as unknown as { initialize: () => Promise<void> };
  const working = detector.initialize;
  detector.initialize = () => Promise.reject(new Error('No graphics backend'));
  try {
    const release = jest.fn();
    holdStart({ way: 'wildlife' }, browser.stream, release);
    render(<WildlifePage />);
    await act(async () => {});
    await act(async () => {});

    expect(useAnimalAlertStore.getState().isMonitoring).toBe(false);
    expect(screen.queryByText('Monitoring Active')).toBeNull();
    expect(browser.video.stop).toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Wildlife could not start its animal check/)).toBeTruthy();
  } finally {
    detector.initialize = working;
  }
});

it('Wildlife ends its watch when the camera is lost, and its start key starts it again', async () => {
  holdStart({ way: 'wildlife' }, browser.stream);
  render(<WildlifePage />);
  await act(async () => {});
  await act(async () => {});
  expect(screen.getByText('LIVE')).toBeTruthy();

  act(() => browser.video.end());
  await act(async () => {});

  expect(useAnimalAlertStore.getState().isMonitoring).toBe(false);
  expect(screen.queryByText('Monitoring Active')).toBeNull();
  expect(screen.getByRole('button', { name: 'Start Monitoring' })).toBeTruthy();
});

it('a held camera that is not the camera now chosen is closed, and the chosen one is asked for', async () => {
  Object.assign(browser.video, { getSettings: () => ({ deviceId: 'built-in' }) });
  useCameraStore.setState({ deviceId: 'usb' });
  holdStart({ way: 'monitor' }, browser.stream);
  render(<MonitorPage />);
  await act(async () => {});
  await act(async () => {});

  expect(browser.video.stop).toHaveBeenCalled();
  expect(browser.getUserMedia).toHaveBeenCalledWith(cameraConstraints('usb', true));
});

it('a held camera that is the camera chosen is used with no second request', async () => {
  Object.assign(browser.video, { getSettings: () => ({ deviceId: 'usb' }) });
  useCameraStore.setState({ deviceId: 'usb' });
  holdStart({ way: 'monitor' }, browser.stream);
  render(<MonitorPage />);
  await act(async () => {});

  expect(screen.getByRole('button', { name: 'Stop watching' })).toBeTruthy();
  expect(browser.getUserMedia).not.toHaveBeenCalled();
});
