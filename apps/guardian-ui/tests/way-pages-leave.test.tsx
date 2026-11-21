/** @jest-environment jsdom */
/**
 * Leaving a way's page ends its watch in full, and a check that lands after
 * its watch ended counts for nothing. Each page is headed with its way's name
 * as the dashboard writes it.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import MonitorPage from '@/app/monitor/page';
import LostFoundPage from '@/app/lost-found/page';
import SecurityPage from '@/app/security/page';
import WildlifePage from '@/app/wildlife/page';
import { deleteIntrusionFrame, saveIntrusionFrame, type IntrusionFrameDB } from '@/lib/client-db';
import { getSoundManager } from '@/lib/sound-manager';
import { getPersonDetector, type PersonDetectionResult } from '@/lib/person-detection';
import { getAnimalDetector, type AnimalDetection, type AnimalDetectionResult } from '@/lib/animal-detection';
import { getTTSManager, startSecurityAlert, stopSecurityAlert } from '@/lib/tts-alerts';
import {
  calculateAverageColor,
  estimateSizeRatio,
  extractColorHistogram,
  extractDominantColors,
  extractEdgeSignature,
} from '@/lib/visual-fingerprint';
import { useMonitoringStore } from '@/stores/monitoring-store';
import { useLostFoundStore, type SubjectProfile } from '@/stores/lost-found-store';
import { DEFAULT_SECURITY_SETTINGS, useSecurityStore } from '@/stores/security-store';
import { DEFAULT_ANIMAL_SETTINGS, shouldAlert, useAnimalAlertStore } from '@/stores/animal-alert-store';
import { useSettingsStore } from '@/stores/settings-store';
import { installCameraBrowser } from './helpers/camera-browser';

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, replace: () => {} }),
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

// The feed draws nothing. It keeps every set of props it was given, and hands
// the page a video while it is enabled, as the camera's own feed does.
type FeedProps = { enabled?: boolean; onVideoReady?: (video: HTMLVideoElement | null) => void };
const mockFeedProps: FeedProps[] = [];
jest.mock('@/components/CameraFeed', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    CameraFeed: (props: FeedProps) => {
      mockFeedProps.push(props);
      const { enabled, onVideoReady } = props;
      useEffect(() => {
        if (!enabled) return;
        onVideoReady?.(document.createElement('video'));
        return () => onVideoReady?.(null);
      }, [enabled]);
      return null;
    },
  };
});

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
jest.mock('@/lib/client-db', () => ({
  ...jest.requireActual('@/lib/client-db'),
  saveIntrusionFrame: jest.fn(),
  deleteIntrusionFrame: jest.fn(),
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

type Detector = { processFrame: jest.Mock; forceDetection: jest.Mock };
const personDetector = () => getPersonDetector() as unknown as Detector;
const animalDetector = () => getAnimalDetector() as unknown as Detector;
const speech = () => getTTSManager() as unknown as { speak: jest.Mock; stop: jest.Mock };

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
  id: 'deer-1',
  type: 'deer',
  displayName: 'Deer',
  sizeCategory: 'large',
  dangerLevel: 'low',
  confidence: 0.9,
  bbox: [0, 0, 40, 40],
  timestamp: Date.now(),
});

// A detector's answer the case gives when it chooses.
function held<T>() {
  let answer!: (value: T) => void;
  const promise = new Promise<T>((resolve) => { answer = resolve; });
  return { promise, answer };
}

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  jest.clearAllMocks();
  mockFeedProps.length = 0;
  for (const detector of [personDetector(), animalDetector()]) {
    detector.processFrame.mockReset().mockResolvedValue(null);
    detector.forceDetection.mockReset().mockResolvedValue(null);
  }
  jest.mocked(saveIntrusionFrame).mockReset().mockResolvedValue(undefined);
  jest.mocked(deleteIntrusionFrame).mockReset().mockResolvedValue(undefined);
  useMonitoringStore.getState().reset();
  useSettingsStore.setState({ globalMute: true });
  useSettingsStore.getState().updateGlobalSettings({ processingMode: 'local' });
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
  // The page's server connection goes to a stand-in socket.
  installCameraBrowser();
});

afterEach(() => {
  cleanup();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it("leaving People's page disarms it and ends its spoken alert", async () => {
  useSecurityStore.setState({ armingState: 'triggered' });
  const view = render(<SecurityPage />);
  await act(async () => {});
  view.unmount();
  expect(useSecurityStore.getState().armingState).toBe('disarmed');
  expect(stopSecurityAlert).toHaveBeenCalled();
});

it("opening People's page after it was left starts no camera", async () => {
  useSecurityStore.setState({ armingState: 'triggered' });
  const view = render(<SecurityPage />);
  await act(async () => {});
  view.unmount();
  mockFeedProps.length = 0;
  render(<SecurityPage />);
  // The detector is ready, so only the watch's own state could enable the feed.
  await act(async () => {});
  expect(mockFeedProps.length).toBeGreaterThan(0);
  expect(mockFeedProps[mockFeedProps.length - 1].enabled).toBe(false);
});

it("leaving Wildlife's page stops its watch and its voice", async () => {
  useAnimalAlertStore.setState({ isMonitoring: true, currentDetections: [sighting()] });
  const view = render(<WildlifePage />);
  await act(async () => {});
  view.unmount();
  const store = useAnimalAlertStore.getState();
  expect(store.isMonitoring).toBe(false);
  expect(store.currentDetections).toEqual([]);
  expect(speech().stop).toHaveBeenCalled();
});

it("leaving Motion and sound's page ends a Lost and Found check with its watch", async () => {
  useLostFoundStore.setState({ isWatching: true, activeSubject: pet('pet-1') });
  const view = render(<MonitorPage />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Start Monitoring' }));
  await act(async () => {});
  expect(useMonitoringStore.getState().isStreaming).toBe(true);
  view.unmount();
  expect(useLostFoundStore.getState().isWatching).toBe(false);
  expect(useMonitoringStore.getState().isStreaming).toBe(false);
});

it("leaving Motion and sound's page stops the saved sounds its alerts played, a loop included", async () => {
  const manager = getSoundManager();
  const active = (manager as unknown as { activeSounds: Map<string, unknown> }).activeSounds;
  const stop = jest.spyOn(manager, 'stop').mockImplementation((id: string) => {
    active.delete(id);
  });
  const view = render(<MonitorPage />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Start Monitoring' }));
  await act(async () => {});
  expect(useMonitoringStore.getState().isStreaming).toBe(true);
  // A saved sound set to loop that a motion alert played, and one that a
  // Lost and Found alert and a motion alert both played.
  const loop = (id: string, owners: string[]) => ({ id, type: 'alert', priority: 1, startTime: 0, loop: true, owners: new Set(owners) });
  active.set('motion-loop', loop('motion-loop', ['motion_detected']));
  active.set('shared-loop', loop('shared-loop', ['object_found', 'motion_detected']));
  try {
    view.unmount();
    expect(stop).toHaveBeenCalledWith('motion-loop', 0);
    expect(stop).toHaveBeenCalledWith('shared-loop', 0);
    expect(active.size).toBe(0);
  } finally {
    active.clear();
  }
});

it('names each page as the dashboard names its way', async () => {
  const pages: Array<[React.ComponentType, string]> = [
    [MonitorPage, 'Motion and sound'],
    [LostFoundPage, 'Lost and Found'],
    [SecurityPage, 'People'],
    [WildlifePage, 'Wildlife'],
  ];
  for (const [Page, name] of pages) {
    render(<Page />);
    await act(async () => {});
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent?.replace(/\s+/g, ' ').trim()).toBe(name);
    cleanup();
  }
});

// One person more than the page allows, with the frame the detector caught.
const intruders = (): PersonDetectionResult => {
  const allowed = useSecurityStore.getState().settings.allowedPersons;
  return {
    personCount: allowed + 1,
    detections: Array.from({ length: allowed + 1 }, () => ({ bbox: [0, 0, 40, 80] as [number, number, number, number], confidence: 0.9, class: 'person' as const })),
    processingTimeMs: 5,
    frameData: 'data:image/jpeg;base64,AA==',
    timestamp: Date.now(),
    motionTriggered: true,
  };
};

// People's page, armed and ready, with one check asked of the detector and
// not yet answered.
async function peopleChecking() {
  useSecurityStore.setState({ armingState: 'armed' });
  const view = render(<SecurityPage />);
  await act(async () => {});
  const check = held<PersonDetectionResult | null>();
  personDetector().processFrame.mockReturnValueOnce(check.promise);
  act(() => { jest.advanceTimersByTime(Math.max(250, useSecurityStore.getState().settings.detectionInterval)); });
  expect(personDetector().processFrame).toHaveBeenCalledTimes(1);
  return { view, check };
}

function expectPeopleUntouched() {
  expect(saveIntrusionFrame).not.toHaveBeenCalled();
  expect(startSecurityAlert).not.toHaveBeenCalled();
  expect(useSecurityStore.getState().armingState).toBe('disarmed');
  expect(useSecurityStore.getState().intrusionFrames).toEqual([]);
}

it("a check running when People's page is left counts for nothing", async () => {
  const { view, check } = await peopleChecking();
  view.unmount();
  await act(async () => { check.answer(intruders()); });
  await act(async () => {});
  expectPeopleUntouched();
});

it('a check that lands after People is disarmed counts for nothing', async () => {
  const { check } = await peopleChecking();
  act(() => useSecurityStore.getState().disarm());
  await act(async () => { check.answer(intruders()); });
  await act(async () => {});
  expectPeopleUntouched();
});

it('a frame whose save lands after People is disarmed is taken back', async () => {
  const save = held<void>();
  jest.mocked(saveIntrusionFrame).mockReturnValueOnce(save.promise);
  const { check } = await peopleChecking();
  await act(async () => { check.answer(intruders()); });
  await act(async () => {});
  expect(saveIntrusionFrame).toHaveBeenCalledTimes(1);
  const saved = jest.mocked(saveIntrusionFrame).mock.calls[0][0] as IntrusionFrameDB;

  act(() => useSecurityStore.getState().disarm());
  await act(async () => { save.answer(undefined); });
  await act(async () => {});

  expect(deleteIntrusionFrame).toHaveBeenCalledWith(saved.id);
  expect(startSecurityAlert).not.toHaveBeenCalled();
  expect(useSecurityStore.getState().intrusionFrames).toEqual([]);
});

it('a sighting that lands after Wildlife stops counts for nothing', async () => {
  useAnimalAlertStore.setState({ isMonitoring: true, settings: { ...DEFAULT_ANIMAL_SETTINGS, alertMode: 'both' } });
  const deer = sighting();
  expect(shouldAlert(deer, useAnimalAlertStore.getState().settings)).toBe(true);
  render(<WildlifePage />);
  await act(async () => {});
  const check = held<AnimalDetectionResult | null>();
  animalDetector().processFrame.mockReturnValueOnce(check.promise);
  act(() => { jest.advanceTimersByTime(1000); });
  expect(animalDetector().processFrame).toHaveBeenCalledTimes(1);
  act(() => useAnimalAlertStore.getState().setMonitoring(false));
  await act(async () => {
    check.answer({
      animals: [deer],
      largeAnimals: [deer],
      smallAnimals: [],
      dangerousAnimals: [],
      processingTimeMs: 5,
    });
  });
  await act(async () => {});
  expect(useAnimalAlertStore.getState().detectionHistory).toEqual([]);
  expect(speech().speak).not.toHaveBeenCalled();
});
