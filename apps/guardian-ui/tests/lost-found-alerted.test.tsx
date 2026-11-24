/** @jest-environment jsdom */
/**
 * Whether a Lost and Found frame raised the alert
 *
 * Each frame the check saves says whether that check raised the alert, so the
 * record keeps what the person heard: a threshold changed later changes
 * nothing already saved, and a frame saved before the field existed has none.
 */
import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import MonitorPage from '@/app/monitor/page';
import { getAllMatchFrames, getMatchFrame, saveMatchFrame, saveSubjectProfile, type MatchFrameDB } from '@/lib/client-db';
import type { MatchResult } from '@/lib/subject-matcher';
import {
  calculateAverageColor,
  estimateSizeRatio,
  extractColorHistogram,
  extractDominantColors,
  extractEdgeSignature,
} from '@/lib/visual-fingerprint';
import { DEFAULT_SETTINGS, useLostFoundStore, type SubjectProfile } from '@/stores/lost-found-store';
import { useMonitoringStore } from '@/stores/monitoring-store';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useSettingsStore } from '@/stores/settings-store';
import { installCameraBrowser, startMonitoring } from './helpers/camera-browser';

require('fake-indexeddb/auto');
// The test browser has no structuredClone, which the database needs to keep a record.
Object.defineProperty(global, 'structuredClone', { configurable: true, value: (value: unknown) =>
  require('v8').deserialize(require('v8').serialize(value)),
});

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
// The browser notifications the watch shows, read by the test.
const mockNotify = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/browser-notification', () => ({
  showBrowserNotification: (...args: unknown[]) => mockNotify(...args),
}));
const mockBackendConfig = { wsUrl: 'wss://monitor.example.test' };
jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({ config: mockBackendConfig }),
}));

// The check's answers, one per check: a frame is recorded from 50 per cent and
// raises the alert from the threshold the page gives the matcher.
const mockResults: MatchResult[] = [];
const mockMatcher = {
  last: null as MatchResult | null,
  threshold: 100,
  setFingerprint() {},
  setActive() {},
  setSettings(settings: { minConfidenceForAlert?: number }) {
    if (settings.minConfidenceForAlert !== undefined) mockMatcher.threshold = settings.minConfidenceForAlert;
  },
  processFrame() {
    mockMatcher.last = mockResults.shift() ?? null;
    return mockMatcher.last;
  },
  getState: () => ({ consecutiveMatches: mockMatcher.last ? 1 : 0 }),
  shouldRecord: () => (mockMatcher.last?.confidence ?? 0) >= 50,
  shouldAlert: () => (mockMatcher.last?.confidence ?? 0) >= mockMatcher.threshold,
};
jest.mock('@/lib/subject-matcher', () => ({
  ...jest.requireActual('@/lib/subject-matcher'),
  getSubjectMatcher: () => mockMatcher,
}));

// The thumbnail's picture loads as soon as it is given its source.
class LoadingImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_source: string) {
    this.onload?.();
  }
}

function pet(): SubjectProfile {
  const pixels = new ImageData(new Uint8ClampedArray(8 * 8 * 4).fill(200), 8, 8);
  const createdAt = new Date().toISOString();
  return {
    id: 'pet-1',
    name: 'Mittens',
    type: 'pet',
    description: '',
    fingerprint: {
      id: 'pet-1',
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

function result(id: string, confidence: number): MatchResult {
  return {
    id,
    confidence,
    timestamp: Date.now(),
    details: { colorMatch: confidence, dominantMatch: confidence, edgeMatch: confidence, sizeMatch: confidence },
    frameData: 'data:image/jpeg;base64,x',
    processingTimeMs: 1,
  };
}

/** Reads the database until it holds a frame for each id: the saves run on the database's own tasks. */
async function savedFrames(...ids: string[]) {
  const holdsAll = (frames: MatchFrameDB[]) => ids.every((id) => frames.some((frame) => frame.id === id));
  let frames = await getAllMatchFrames();
  for (let turn = 0; turn < 200 && !holdsAll(frames); turn += 1) frames = await getAllMatchFrames();
  return Object.fromEntries(frames.filter((frame) => ids.includes(frame.id)).map((frame) => [frame.id, frame.alerted]));
}

function keptFrames(...ids: string[]) {
  const frames = useLostFoundStore.getState().matchFrames.filter((frame) => ids.includes(frame.id));
  return Object.fromEntries(frames.map((frame) => [frame.id, frame.alerted]));
}

/** Watches for Mittens on Motion and sound's page while two checks run, at 75 and then 55 per cent. */
async function twoChecks(high: string, low: string) {
  // The watch compares while it runs with Lost and Found chosen on Watch for
  // and Mittens saved on this device.
  await saveSubjectProfile(pet());
  useOnboardingStore.setState({ lostFoundChosen: true });
  useLostFoundStore.setState({ chosenPetId: 'pet-1' });
  mockResults.push(result(high, 75), result(low, 55));
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  await waitFor(() => expect(useLostFoundStore.getState().isWatching).toBe(true));
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
}

let originalImage: typeof window.Image;
beforeEach(() => {
  mockBackendConfig.wsUrl = 'wss://monitor.example.test';
  jest.useFakeTimers();
  localStorage.clear();
  useMonitoringStore.getState().reset();
  useSettingsStore.setState({ globalMute: true });
  useSettingsStore.getState().updateGlobalSettings({ processingMode: 'local', analysisInterval: 1 });
  useSettingsStore.setState({ scenarioOverrides: {} });
  useOnboardingStore.setState({ selectedScenario: null, lostFoundChosen: false });
  mockResults.length = 0;
  mockMatcher.last = null;
  useLostFoundStore.setState({
    isWatching: true,
    activeSubject: pet(),
    matchFrames: [],
    recentMatches: [],
    settings: {
      ...DEFAULT_SETTINGS,
      minConfidenceForAlert: 70,
      alertSound: false,
      alertNotification: false,
      customMediaEnabled: false,
    },
  });
  installCameraBrowser();
  originalImage = window.Image;
  Object.defineProperty(window, 'Image', { configurable: true, value: LoadingImage });
});
afterEach(() => {
  cleanup();
  Object.defineProperty(window, 'Image', { configurable: true, value: originalImage });
  useLostFoundStore.setState({ isWatching: false, activeSubject: null });
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('a frame saved while the alert sounded says so, and one under the threshold says it did not', async () => {
  await twoChecks('frame-75', 'frame-55');
  const saved = await savedFrames('frame-75', 'frame-55');
  expect(Object.keys(saved).sort()).toEqual(['frame-55', 'frame-75']);
  expect(saved['frame-75']).toBe(true);
  expect(saved['frame-55']).toBe(false);
  expect(keptFrames('frame-75', 'frame-55')).toEqual({ 'frame-75': true, 'frame-55': false });
});

it('a threshold changed later changes nothing already saved', async () => {
  await twoChecks('later-75', 'later-55');
  await savedFrames('later-75', 'later-55');
  act(() => useLostFoundStore.getState().updateSettings({ minConfidenceForAlert: 95 }));
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  expect(await savedFrames('later-75', 'later-55')).toEqual({ 'later-75': true, 'later-55': false });
  expect(keptFrames('later-75', 'later-55')).toEqual({ 'later-75': true, 'later-55': false });
});

it('a frame saved before this change keeps no field', async () => {
  const frame: MatchFrameDB = {
    id: 'older-frame',
    subjectId: 'pet-1',
    frameData: 'data:image/jpeg;base64,x',
    thumbnailData: 'data:image/jpeg;base64,x',
    confidence: 80,
    timestamp: Date.now(),
    details: { colorMatch: 80, dominantMatch: 80, edgeMatch: 80, sizeMatch: 80 },
    region: null,
    acknowledged: false,
    notes: '',
    exported: false,
  };
  await saveMatchFrame(frame);
  const read = await getMatchFrame('older-frame');
  expect(read).not.toBeNull();
  expect(read?.alerted).toBeUndefined();
  expect(read).not.toHaveProperty('alerted');
});

it('shows no score panel while the watch compares with a saved pet', async () => {
  await twoChecks('panel-75', 'panel-55');
  // The comparison runs: the pet is saved and chosen, and the watch is on.
  expect(useLostFoundStore.getState().isWatching).toBe(true);
  expect(useLostFoundStore.getState().activeSubject?.id).toBe('pet-1');
  expect(screen.queryByText(/Confidence|consecutive match|Matching|View Match History/)).toBeNull();
});

it('a Lost and Found notification asks the question and names colours and shape', async () => {
  useLostFoundStore.setState({ settings: { ...useLostFoundStore.getState().settings, alertNotification: true } });
  Object.defineProperty(global, 'Notification', { configurable: true, value: Object.assign(jest.fn(), {
    permission: 'granted', requestPermission: jest.fn().mockResolvedValue('granted'),
  }) });
  mockNotify.mockClear();
  await twoChecks('note-75', 'note-55');
  expect(mockNotify).toHaveBeenCalledWith('Could this be Mittens?', expect.objectContaining({
    body: expect.stringMatching(/^Colours and shape like Mittens’s photos, .+\.$/),
  }));
  for (const [title, options] of mockNotify.mock.calls as Array<[string, { body?: string } | undefined]>) {
    const words = `${title} ${options?.body ?? ''}`;
    if (words.includes('Mittens') || words.includes('Lost and Found')) {
      expect(words).not.toMatch(/detect|match|confidence|%/i);
    }
  }
});
