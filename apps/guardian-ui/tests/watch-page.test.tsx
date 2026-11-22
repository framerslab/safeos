/** @jest-environment jsdom */
/**
 * The Motion and sound page, rendered whole
 *
 * The watch in the app's look: "Watch for" and Mute alerts on one row, the
 * camera's drawn frame with Start watching and every camera state inside it,
 * a meter for each kind under the live picture, the settings folded under
 * "Settings for this watch", and the alert list's header and empty states.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import MonitorPage from '@/app/monitor/page';
import { useMonitoringStore } from '@/stores/monitoring-store';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useLostFoundStore } from '@/stores/lost-found-store';
import { installCameraBrowser, startMonitoring } from './helpers/camera-browser';
import { clockTime } from '@/lib/clock-time';
import * as clientDb from '@/lib/client-db';

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
const mockBackendConfig = { wsUrl: 'wss://monitor.example.test' };
let mockConnected = false;
jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({ config: mockBackendConfig, isConnected: mockConnected }),
}));

let browser: ReturnType<typeof installCameraBrowser>;
beforeEach(() => {
  mockBackendConfig.wsUrl = 'wss://monitor.example.test';
  mockConnected = false;
  jest.useFakeTimers();
  localStorage.clear();
  useMonitoringStore.getState().reset();
  useSettingsStore.setState({ globalMute: true });
  useSettingsStore.getState().updateGlobalSettings({ processingMode: 'local', analysisInterval: 1 });
  useSettingsStore.setState({ scenarioOverrides: {} });
  useOnboardingStore.setState({ selectedScenario: null });
  browser = installCameraBrowser();
});
afterEach(() => { cleanup(); jest.useRealTimers(); jest.restoreAllMocks(); });

// =============================================================================
// The bar's row
// =============================================================================

it('holds "Watch for" and Mute alerts on the bar, and says when alerts are muted', async () => {
  useSettingsStore.setState({ globalMute: false });
  render(<MonitorPage />);
  await act(async () => {});
  expect(screen.getByRole('heading', { level: 1, name: 'Motion and sound' }).classList.contains('sr-only')).toBe(true);
  const heading = screen.getByRole('heading', { level: 2, name: 'Watch for' });
  const mute = screen.getByRole('button', { name: 'Mute alerts' });
  expect(heading.closest('.watch-bar')).not.toBeNull();
  expect(heading.closest('.watch-bar')).toBe(mute.closest('.watch-bar'));
  expect(mute.getAttribute('aria-pressed')).toBe('false');
  expect(screen.queryByText('Alerts are muted. New alerts show here without a sound.')).toBeNull();
  fireEvent.click(mute);
  expect(mute.getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByText('Alerts are muted. New alerts show here without a sound.')).toBeTruthy();
  expect(useSettingsStore.getState().globalMute).toBe(true);
});

it('carries no modes menu and no link to the home page in its head', async () => {
  render(<MonitorPage />);
  await act(async () => {});
  expect(screen.queryByRole('button', { name: 'Select Security Mode' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'SafeOS home' })).toBeNull();
});

// =============================================================================
// The camera's frame
// =============================================================================

const FAILURE_WORDS: Record<string, string> = {
  blocked:
    'The browser blocked the camera for this site. To allow it, open the site settings from the address bar, set Camera to Allow, then press Try again.',
  'in-use': 'The camera did not start. Another app or tab may be using it. Close it, then press Try again.',
  missing: 'No camera was found on this device. Connect a camera, then press Try again.',
  gone: 'The selected camera is unavailable. Choose another camera.',
};

it('holds the camera drawing, Start watching and what the browser will ask before the camera is asked', async () => {
  render(<MonitorPage />);
  await act(async () => {});
  const start = screen.getByRole('button', { name: 'Start watching' });
  expect(start.closest('.watch-frame')).not.toBeNull();
  expect(screen.getByText('Your browser will ask you to allow the camera and microphone.')).toBeTruthy();
  const picker = screen.getByRole('combobox', { name: 'Camera' });
  expect(within(picker).getByRole('option', { name: 'Default camera' })).toBeTruthy();
  expect(screen.queryByText('LIVE')).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Camera Feed' })).toBeNull();
});

it('turns Start watching inactive while the camera starts, with Cancel, then shows Stop watching', async () => {
  let answer: (stream: unknown) => void = () => {};
  browser.getUserMedia.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
  render(<MonitorPage />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Start watching' }));
  await act(async () => {});
  const waiting = screen.getByRole('button', { name: 'Starting the camera…' });
  expect(waiting.getAttribute('aria-disabled')).toBe('true');
  const asked = browser.getUserMedia.mock.calls.length;
  fireEvent.click(waiting);
  await act(async () => {});
  expect(browser.getUserMedia).toHaveBeenCalledTimes(asked);
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  await act(async () => { answer(browser.stream); });
  expect(await screen.findByRole('button', { name: 'Stop watching' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
});

it.each([
  ['NotAllowedError', 'blocked'],
  ['NotReadableError', 'in-use'],
  ['NotFoundError', 'missing'],
  ['OverconstrainedError', 'gone'],
])('names a %s camera inside the frame with its fix', async (name, kind) => {
  browser.getUserMedia.mockRejectedValue(new DOMException('', name));
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  const words = screen.getByText(FAILURE_WORDS[kind]);
  const frame = words.closest('.watch-frame') as HTMLElement;
  expect(frame).not.toBeNull();
  expect(frame.querySelector('.problem-mark')).not.toBeNull();
  const tryAgain = within(frame).queryByRole('button', { name: 'Try again' });
  if (kind === 'gone') expect(tryAgain).toBeNull();
  else expect(tryAgain).not.toBeNull();
});

it('says this browser cannot use a camera where it has no camera request', async () => {
  render(<MonitorPage />);
  await act(async () => {});
  Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
  await startMonitoring();
  expect(
    screen.getByText(
      'This browser cannot use a camera on this page. Open SafeOS in a current version of Chrome, Edge, Firefox or Safari.',
    ),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
});

it('asks for the camera again on Try again', async () => {
  browser.getUserMedia.mockRejectedValue(new DOMException('', 'NotAllowedError'));
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  const asked = browser.getUserMedia.mock.calls.length;
  expect(asked).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await act(async () => {});
  expect(browser.getUserMedia.mock.calls.length).toBeGreaterThan(asked);
});

it('says when a camera that was watching stopped, and gives Start watching back', async () => {
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  expect(screen.getByRole('button', { name: 'Stop watching' })).toBeTruthy();
  act(() => browser.video.end());
  expect(screen.getByText(`The camera stopped at ${clockTime(Date.now())}. Press Start watching to start again.`)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Start watching' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Stop watching' })).toBeNull();
});

// =============================================================================
// The meters
// =============================================================================

// The alert walk's own setting: the Custom preset, Motion's line at 20, the
// Picture change and Sound alerts off.
const MOTION_ONLY = {
  id: 'custom' as const,
  name: 'Maximum Alert',
  description: 'High sensitivity (80%) and max volume.',
  motionSensitivity: 80,
  audioSensitivity: 80,
  pixelThreshold: 20,
  absolutePixelThreshold: 50,
  analysisInterval: 5,
  alertDelay: 30,
  alertVolume: 100,
  emergencyMode: false,
  pixelDetectionEnabled: false,
  motionDetectionEnabled: true,
  audioDetectionEnabled: false,
  processingMode: 'hybrid' as const,
  useAbsoluteThreshold: false,
};
const seedMotionOnly = () => {
  useSettingsStore.setState({ activePresetId: 'custom', globalSettings: { ...useSettingsStore.getState().globalSettings, ...MOTION_ONLY } });
};
const meter = (name: string) => screen.getByRole('meter', { name: `${name} level` });
const valueText = (name: string) => meter(name).getAttribute('aria-valuetext');
// The test setup's matchMedia can be set but not redefined.
const setUpMatchMedia = window.matchMedia;
const reducedMotion = (reduce: boolean) => {
  window.matchMedia = reduce
    ? ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    })) as unknown as typeof window.matchMedia
    : setUpMatchMedia;
};

it('reads the Motion meter against its line and says when it is over', async () => {
  seedMotionOnly();
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  act(() => useMonitoringStore.getState().setMotionScore(25));
  expect(valueText('Motion')).toBe('25 per cent, line at 20, Over the line');
  expect(within(meter('Motion').closest('.watch-meter') as HTMLElement).getByText('Over the line')).toBeTruthy();
  act(() => useMonitoringStore.getState().setMotionScore(5));
  expect(valueText('Motion')).toBe('5 per cent, line at 20, Quiet');
});

it('shows Sound with No alert and no line where the setting turns sound alerts off', async () => {
  seedMotionOnly();
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  act(() => useMonitoringStore.getState().setAudioLevel(12));
  expect(valueText('Sound')).toMatch(/^\d+ per cent, No alert$/);
  expect(meter('Sound').closest('.watch-meter')?.querySelector('.watch-meter__line')).toBeNull();
});

it('shows no Picture change meter where the setting does not check it', async () => {
  seedMotionOnly();
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  expect(screen.queryByRole('meter', { name: 'Picture change level' })).toBeNull();
});

it('shows the names over empty tracks with no state word until the first reading', async () => {
  seedMotionOnly();
  browser.getUserMedia.mockReturnValue(new Promise(() => {}));
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  const strip = document.querySelector('.watch-meters') as HTMLElement;
  expect(strip).not.toBeNull();
  expect(within(strip).getByText('Motion')).toBeTruthy();
  expect(within(strip).getByText('Sound')).toBeTruthy();
  for (const word of ['Quiet', 'Over the line', 'No alert']) expect(within(strip).queryByText(word)).toBeNull();
  expect(meter('Motion').getAttribute('aria-valuetext')).toBeNull();
});

it('steps each meter once a second under reduced motion', async () => {
  reducedMotion(true);
  seedMotionOnly();
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  act(() => useMonitoringStore.getState().setMotionScore(10));
  act(() => { jest.advanceTimersByTime(1000); });
  expect(meter('Motion').getAttribute('aria-valuenow')).toBe('10');
  act(() => useMonitoringStore.getState().setMotionScore(30));
  expect(meter('Motion').getAttribute('aria-valuenow')).toBe('10');
  act(() => { jest.advanceTimersByTime(1000); });
  expect(meter('Motion').getAttribute('aria-valuenow')).toBe('30');
  reducedMotion(false);
});

it('names a missing microphone beside Sound, and Motion goes on', async () => {
  seedMotionOnly();
  browser.getUserMedia.mockImplementation((asked: MediaStreamConstraints) =>
    asked.audio ? Promise.reject(new DOMException('', 'NotFoundError')) : Promise.resolve(browser.stream));
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  expect(screen.getByText('No microphone found. Sound alerts are off. Connect a microphone, then stop and start watching.')).toBeTruthy();
  expect(meter('Motion')).toBeTruthy();
});

it('names a blocked microphone beside Sound, and Motion goes on', async () => {
  seedMotionOnly();
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: jest.fn().mockResolvedValue({ state: 'granted', addEventListener() {}, removeEventListener() {} }) },
  });
  browser.getUserMedia.mockImplementation((asked: MediaStreamConstraints) =>
    asked.audio ? Promise.reject(new DOMException('', 'NotAllowedError')) : Promise.resolve(browser.stream));
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  await act(async () => {});
  expect(
    screen.getByText(
      'The browser blocked the microphone for this site. To allow it, open the site settings from the address bar, set Microphone to Allow, then stop and start watching.',
    ),
  ).toBeTruthy();
  expect(meter('Motion')).toBeTruthy();
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined });
});

it('shows none of the five old tiles', async () => {
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  for (const word of ['Stream', 'Mode', 'Pixel']) expect(screen.queryByText(new RegExp(`^${word}$`, 'i'))).toBeNull();
  expect(screen.queryByText(/^Threshold \d+px$/)).toBeNull();
});

// =============================================================================
// Settings for this watch, and what leaves
// =============================================================================

it('folds the settings under Settings for this watch until Show settings opens them, and keeps the choice', async () => {
  const first = render(<MonitorPage />);
  await act(async () => {});
  expect(screen.getByRole('heading', { level: 2, name: 'Settings for this watch' })).toBeTruthy();
  const show = screen.getByRole('button', { name: 'Show settings' });
  expect(show.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByText('Calibrate Baseline (10s)')).toBeNull();
  fireEvent.click(show);
  expect(screen.getByRole('button', { name: 'Hide settings' }).getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByRole('link', { name: 'Nap Mode' }).getAttribute('href')).toMatch(/^\/nap\/?$/);
  first.unmount();
  render(<MonitorPage />);
  await act(async () => {});
  expect(screen.getByRole('button', { name: 'Hide settings' })).toBeTruthy();
});

it('names no processing on the preset card and shows Interval only while this device has its own server', async () => {
  localStorage.setItem('safeos-watch-view', 'settings');
  const first = render(<MonitorPage />);
  await act(async () => {});
  expect(screen.getByRole('button', { name: 'Hide settings' })).toBeTruthy();
  expect(screen.queryByText('Cloud AI')).toBeNull();
  expect(screen.queryByText('Local Processing')).toBeNull();
  expect(screen.queryByText('Interval')).toBeNull();
  first.unmount();
  mockConnected = true;
  render(<MonitorPage />);
  await act(async () => {});
  expect(screen.getByText('Interval')).toBeTruthy();
});

it('shows no confidence panel and no tag on the live picture', async () => {
  const createdAt = new Date().toISOString();
  useLostFoundStore.setState({
    isWatching: true,
    activeSubject: {
      id: 'pet-1', name: 'Mittens', type: 'pet', description: '', referenceImages: [], createdAt,
      fingerprint: { version: Number.MAX_SAFE_INTEGER },
    } as never,
  });
  try {
    render(<MonitorPage />);
    await act(async () => {});
    await startMonitoring();
    expect(screen.queryByText(/Confidence|consecutive match|Matching|View Match History/)).toBeNull();
  } finally {
    useLostFoundStore.setState({ isWatching: false, activeSubject: null });
  }
});

it('floats no quick settings over the page', async () => {
  render(<MonitorPage />);
  await act(async () => {});
  expect(screen.queryByRole('button', { name: 'Quick Settings' })).toBeNull();
});

// =============================================================================
// The alert list's header, and its empty and loading states
// =============================================================================

it('says where alerts show before a watch, and that none came while watching', async () => {
  render(<MonitorPage />);
  await act(async () => {});
  expect(screen.getByRole('heading', { level: 2, name: 'Alerts' })).toBeTruthy();
  expect(screen.getByText('Alerts show here while this device watches.')).toBeTruthy();
  expect(screen.queryByText('No alert so far.')).toBeNull();
  await startMonitoring();
  expect(screen.getByText('No alert so far.')).toBeTruthy();
  expect(screen.queryByText('Alerts show here while this device watches.')).toBeNull();
  expect(screen.queryByText(/No active alerts/)).toBeNull();
  expect(screen.queryByText('Monitoring is inactive')).toBeNull();
  expect(screen.queryByText('Monitoring is running normally')).toBeNull();
});

it('holds three bars in the entries\' place until the saved alerts are read', async () => {
  let settle: (alerts: never[]) => void = () => {};
  jest.spyOn(clientDb, 'getCachedMonitoringAlerts').mockReturnValue(new Promise((resolve) => { settle = resolve; }) as never);
  useMonitoringStore.setState({ alertsRead: false });
  render(<MonitorPage />);
  await act(async () => {});
  expect(screen.getByRole('heading', { level: 2, name: 'Alerts' })).toBeTruthy();
  expect(document.querySelectorAll('.watch-list__wait')).toHaveLength(3);
  expect(screen.queryByText('Alerts show here while this device watches.')).toBeNull();
  await act(async () => { settle([]); });
  expect(document.querySelectorAll('.watch-list__wait')).toHaveLength(0);
  expect(screen.getByText('Alerts show here while this device watches.')).toBeTruthy();
});

it('counts the new alerts beside the heading', async () => {
  render(<MonitorPage />);
  await act(async () => {});
  expect(document.querySelector('.watch-list__new')).toBeNull();
  act(() => useMonitoringStore.getState().addAlert({ id: 'motion-1', streamId: 'local', severity: 'low', message: '', acknowledged: false }));
  const count = document.querySelector('.watch-list__new');
  expect(count?.textContent).toBe('1 new');
  expect(count?.closest('.watch-list__head')?.querySelector('h2')?.textContent).toBe('Alerts');
});
