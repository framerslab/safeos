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
import { useCameraStore } from '@/stores/camera-store';
import { BrowserTrack, installCameraBrowser, startMonitoring } from './helpers/camera-browser';
import { clockTime } from '@/lib/clock-time';

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
const mockBackendConfig = { wsUrl: 'wss://monitor.example.test' };
let mockConnected = false;
// The server's health as the check reads it; 'connecting' while a check waits.
let mockApi = 'disconnected';
// A read of the saved alerts a test holds until it settles it; null reads them as the app does.
const mockAlertRead: { held: Promise<never[]> | null } = { held: null };
jest.mock('@/lib/client-db', () => {
  const actual = jest.requireActual('@/lib/client-db');
  return {
    ...actual,
    getCachedMonitoringAlerts: (...args: unknown[]) => mockAlertRead.held ?? actual.getCachedMonitoringAlerts(...args),
  };
});
jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({ config: mockBackendConfig, isConnected: mockConnected, status: { api: mockApi } }),
}));

let browser: ReturnType<typeof installCameraBrowser>;
beforeEach(() => {
  mockBackendConfig.wsUrl = 'wss://monitor.example.test';
  mockConnected = false;
  mockApi = 'disconnected';
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

it('holds "Watch for" and Mute alerts on the bar, and says when alerts are muted and what sounds all the same', async () => {
  useSettingsStore.setState({ globalMute: false });
  render(<MonitorPage />);
  await act(async () => {});
  expect(screen.getByRole('heading', { level: 1, name: 'Motion and sound' }).classList.contains('sr-only')).toBe(true);
  const heading = screen.getByRole('heading', { level: 2, name: 'Watch for' });
  const mute = screen.getByRole('button', { name: 'Mute alerts' });
  expect(heading.closest('.watch-bar')).not.toBeNull();
  expect(heading.closest('.watch-bar')).toBe(mute.closest('.watch-bar'));
  expect(mute.getAttribute('aria-pressed')).toBe('false');
  expect(screen.queryByText('Alerts are muted. New alerts show here without a sound. One left unanswered until it reaches Emergency sounds its alarm.')).toBeNull();
  fireEvent.click(mute);
  expect(mute.getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByText('Alerts are muted. New alerts show here without a sound. One left unanswered until it reaches Emergency sounds its alarm.')).toBeTruthy();
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

it('asks before a second watch on Try again while another tab watches', async () => {
  browser.getUserMedia.mockRejectedValue(new DOMException('', 'NotAllowedError'));
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  const asked = browser.getUserMedia.mock.calls.length;
  // Another tab on this device starts watching after the failure.
  localStorage.setItem('safeos-tab-watch', JSON.stringify({ tab: 'another-tab', way: 'monitor', at: Date.now() }));
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await act(async () => {});
  expect(screen.getByRole('dialog', { name: 'Watch here instead? The other tab stops.' })).toBeTruthy();
  expect(browser.getUserMedia.mock.calls.length).toBe(asked);
});

it('names a camera lost before its first picture as a failed start, with Try again', async () => {
  // The camera's video track has already ended when the browser hands it over.
  const tracks = [new BrowserTrack('video'), new BrowserTrack('audio')];
  tracks[0].readyState = 'ended';
  browser.getUserMedia.mockResolvedValueOnce({
    getTracks: () => [...tracks],
    getVideoTracks: () => tracks.filter((track) => track.kind === 'video'),
    getAudioTracks: () => tracks.filter((track) => track.kind === 'audio'),
    removeTrack: (track: BrowserTrack) => { tracks.splice(tracks.indexOf(track), 1); },
  } as unknown as MediaStream);
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  expect(screen.queryByText(/^The camera stopped at/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
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

it("reads the Motion meter against a full-screen zone's own line, as the alert does", async () => {
  seedMotionOnly();
  const zones = useSettingsStore.getState().detectionZones;
  useSettingsStore.setState({
    detectionZones: [{ id: 'full', name: 'Full Screen', enabled: true, x: 0, y: 0, width: 100, height: 100, sensitivityOverride: { motion: 40 } }],
  });
  // A quarter of each picture changes from one reading of the camera to the next.
  browser.readFrame.mockImplementation(() => {
    const data = new Uint8ClampedArray(16 * 16 * 4).fill(128);
    data.fill(Math.floor(Date.now() / 200) % 2 ? 0 : 255, 0, 16 * 4 * 4);
    return new ImageData(data, 16, 16);
  });
  try {
    render(<MonitorPage />);
    await act(async () => {});
    await startMonitoring();
    act(() => { jest.advanceTimersByTime(1000); });
    expect(valueText('Motion')).toBe('25 per cent, line at 60, Quiet');
  } finally {
    useSettingsStore.setState({ detectionZones: zones });
  }
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
  // The camera's readings come from its pictures: the top rows of each one
  // change from the picture before, a tenth of the picture and then three tenths.
  let changing = 4;
  browser.readFrame.mockImplementation(() => {
    const data = new Uint8ClampedArray(40 * 40 * 4).fill(128);
    data.fill(Math.floor(Date.now() / 200) % 2 ? 0 : 255, 0, 40 * 4 * changing);
    return new ImageData(data, 40, 40);
  });
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  act(() => { jest.advanceTimersByTime(400); });
  act(() => { jest.advanceTimersByTime(600); });
  expect(meter('Motion').getAttribute('aria-valuenow')).toBe('10');
  changing = 12;
  act(() => { jest.advanceTimersByTime(400); });
  expect(meter('Motion').getAttribute('aria-valuenow')).toBe('10');
  act(() => { jest.advanceTimersByTime(600); });
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

it('names a microphone lost while watching beside Sound, and Motion goes on', async () => {
  seedMotionOnly();
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  const lost = 'No microphone found. Sound alerts are off. Connect a microphone, then stop and start watching.';
  expect(screen.queryByText(lost)).toBeNull();
  act(() => browser.audio.end());
  expect(screen.getByText(lost)).toBeTruthy();
  expect(meter('Motion')).toBeTruthy();
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

it('shows the Analysis Interval sliders, Fine-Tune\'s and Sensitivity\'s, only while this device has its own server', async () => {
  localStorage.setItem('safeos-watch-view', 'settings');
  const first = render(<MonitorPage />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: /Fine-Tune Settings/ }));
  expect(screen.getByRole('button', { name: /Hide Fine-Tuning/ })).toBeTruthy();
  expect(screen.queryAllByText('Analysis Interval')).toHaveLength(0);
  first.unmount();
  mockConnected = true;
  render(<MonitorPage />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: /Fine-Tune Settings/ }));
  expect(screen.getAllByText('Analysis Interval')).toHaveLength(2);
});

it('keeps the Analysis Interval sliders, and the focus on one, while a check of the server is under way', async () => {
  localStorage.setItem('safeos-watch-view', 'settings');
  mockConnected = true;
  mockApi = 'connected';
  const view = render(<MonitorPage />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: /Fine-Tune Settings/ }));
  const slider = screen.getAllByText('Analysis Interval')[0].parentElement!.parentElement!.querySelector('input')!;
  slider.focus();
  // The check marks the server as connecting while it waits for an answer.
  mockConnected = false;
  mockApi = 'connecting';
  view.rerender(<MonitorPage />);
  expect(screen.getAllByText('Analysis Interval')).toHaveLength(2);
  expect(document.activeElement).toBe(slider);
  // A check that finds no server takes them away.
  mockApi = 'disconnected';
  view.rerender(<MonitorPage />);
  expect(screen.queryAllByText('Analysis Interval')).toHaveLength(0);
});

it('says in a polite status that sound alerts stopped when the microphone is lost while watching', async () => {
  seedMotionOnly();
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  const status = document.querySelector('.watch-meters [role="status"]');
  expect(status?.getAttribute('aria-live')).toBe('polite');
  expect(status?.textContent).toBe('');
  act(() => browser.audio.end());
  expect(document.querySelector('.watch-meters [role="status"]')).toBe(status);
  expect(status?.textContent).toBe('Sound: No microphone found. Sound alerts are off. Connect a microphone, then stop and start watching.');
});

it('keeps the unavailable camera named when an older read of the devices lands after a newer one', async () => {
  useCameraStore.getState().setDeviceId('usb');
  const without = [{ kind: 'videoinput', deviceId: 'built-in', label: 'Built-in camera' }];
  const withUsb = [...without, { kind: 'videoinput', deviceId: 'usb', label: 'USB camera' }];
  browser.mediaDevices.enumerateDevices.mockResolvedValue(without);
  browser.getUserMedia.mockRejectedValueOnce(new DOMException('', 'OverconstrainedError'));
  try {
    render(<MonitorPage />);
    await act(async () => {});
    await startMonitoring();
    expect(screen.getByText(FAILURE_WORDS.gone)).toBeTruthy();
    // Each read of the devices waits until the test answers it.
    const reads: Array<(list: typeof withUsb) => void> = [];
    browser.mediaDevices.enumerateDevices.mockImplementation(() => new Promise((resolve) => { reads.push(resolve); }));
    act(() => { browser.mediaDevices.dispatchEvent(new Event('devicechange')); });
    const first = reads.length;
    act(() => { browser.mediaDevices.dispatchEvent(new Event('devicechange')); });
    // The camera came and went: the newer reads find it gone, and the older reads, which listed it, land after them.
    await act(async () => { for (const answer of reads.slice(first)) answer(without); });
    await act(async () => { for (const answer of reads.slice(0, first)) answer(withUsb); });
    expect(screen.getByText(FAILURE_WORDS.gone)).toBeTruthy();
  } finally {
    useCameraStore.getState().setDeviceId('');
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

const STATEMENT = 'SafeOS adds an alert. It does not replace a person nearby. A phone or a browser can sleep, lose power or drop the camera, so stay within reach.';

// The statement's paragraph, whose name SafeOS sits in a span of its own.
const statements = () =>
  [...document.querySelectorAll('p')].filter((p) => (p.textContent ?? '').replace(/\s+/g, ' ').trim() === STATEMENT);

it('says SafeOS adds an alert and does not replace a person nearby, before and during a watch', async () => {
  render(<MonitorPage />);
  await act(async () => {});
  expect(statements()).toHaveLength(1);
  await startMonitoring();
  expect(statements()).toHaveLength(1);
});

it('holds three bars in the entries\' place until the saved alerts are read', async () => {
  let settle: (alerts: never[]) => void = () => {};
  mockAlertRead.held = new Promise((resolve) => { settle = resolve; });
  useMonitoringStore.setState({ alertsRead: false });
  try {
    render(<MonitorPage />);
    await act(async () => {});
    expect(screen.getByRole('heading', { level: 2, name: 'Alerts' })).toBeTruthy();
    expect(document.querySelectorAll('.watch-list__wait')).toHaveLength(3);
    expect(screen.queryByText('Alerts show here while this device watches.')).toBeNull();
    await act(async () => { settle([]); });
    expect(document.querySelectorAll('.watch-list__wait')).toHaveLength(0);
    expect(screen.getByText('Alerts show here while this device watches.')).toBeTruthy();
  } finally {
    mockAlertRead.held = null;
  }
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

// =============================================================================
// A watch read again, a camera back, a reading from the start
// =============================================================================

it('offers Start watching again once the saved camera that was unavailable is connected again', async () => {
  useCameraStore.getState().setDeviceId('usb');
  browser.mediaDevices.enumerateDevices.mockResolvedValue([
    { kind: 'videoinput', deviceId: 'built-in', label: 'Built-in camera' },
  ]);
  browser.getUserMedia.mockRejectedValueOnce(new DOMException('', 'OverconstrainedError'));
  try {
    render(<MonitorPage />);
    await act(async () => {});
    await startMonitoring();
    expect(screen.getByText(FAILURE_WORDS.gone)).toBeTruthy();
    // The same camera is plugged in again: the browser lists it and says the devices changed.
    browser.mediaDevices.enumerateDevices.mockResolvedValue([
      { kind: 'videoinput', deviceId: 'built-in', label: 'Built-in camera' },
      { kind: 'videoinput', deviceId: 'usb', label: 'USB camera' },
    ]);
    await act(async () => { browser.mediaDevices.dispatchEvent(new Event('devicechange')); });
    await act(async () => {});
    expect(screen.queryByText(FAILURE_WORDS.gone)).toBeNull();
    await startMonitoring();
    expect(screen.getByRole('button', { name: 'Stop watching' })).toBeTruthy();
  } finally {
    useCameraStore.getState().setDeviceId('');
  }
});

it("starts a new watch's Motion meter from nothing, not from the last watch's zone", async () => {
  seedMotionOnly();
  const zones = useSettingsStore.getState().detectionZones;
  useSettingsStore.setState({
    detectionZones: [{ id: 'full', name: 'Full Screen', enabled: true, x: 0, y: 0, width: 100, height: 100, sensitivityOverride: { motion: 40 } }],
  });
  browser.readFrame.mockImplementation(() => {
    const data = new Uint8ClampedArray(16 * 16 * 4).fill(128);
    data.fill(Math.floor(Date.now() / 200) % 2 ? 0 : 255, 0, 16 * 4 * 4);
    return new ImageData(data, 16, 16);
  });
  try {
    render(<MonitorPage />);
    await act(async () => {});
    await startMonitoring();
    act(() => { jest.advanceTimersByTime(1000); });
    expect(valueText('Motion')).toBe('25 per cent, line at 60, Quiet');
    fireEvent.click(screen.getByRole('button', { name: 'Stop watching' }));
    // The new watch has a camera of its own, and sees a still scene.
    const tracks = [new BrowserTrack('video'), new BrowserTrack('audio')];
    browser.getUserMedia.mockResolvedValueOnce({
      getTracks: () => [...tracks],
      getVideoTracks: () => tracks.filter((track) => track.kind === 'video'),
      getAudioTracks: () => tracks.filter((track) => track.kind === 'audio'),
      removeTrack: (track: BrowserTrack) => { tracks.splice(tracks.indexOf(track), 1); },
    } as unknown as MediaStream);
    browser.readFrame.mockImplementation(() => new ImageData(new Uint8ClampedArray(16 * 16 * 4).fill(128), 16, 16));
    await startMonitoring();
    expect(screen.getByRole('button', { name: 'Stop watching' })).toBeTruthy();
    // The new camera's first readings, of a still scene.
    act(() => { jest.advanceTimersByTime(1000); });
    expect(valueText('Motion')).toMatch(/ per cent, line at 60, /);
    expect(valueText('Motion')).not.toMatch(/^25 per cent/);
  } finally {
    useSettingsStore.setState({ detectionZones: zones });
  }
});

it('shows no reading on a meter before the camera or the microphone gives one', async () => {
  seedMotionOnly();
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  expect(document.querySelector('.watch-frame')?.getAttribute('data-phase')).toBe('live');
  // No reading has come yet: the tracks stand empty, with no state word.
  expect(valueText('Motion')).toBeNull();
  expect(valueText('Sound')).toBeNull();
  act(() => { jest.advanceTimersByTime(1000); });
  expect(valueText('Motion')).toMatch(/^\d+ per cent, line at 20, /);
});

it("shows no reading from the last camera once another camera is chosen while watching", async () => {
  seedMotionOnly();
  const zones = useSettingsStore.getState().detectionZones;
  useSettingsStore.setState({
    detectionZones: [{ id: 'full', name: 'Full Screen', enabled: true, x: 0, y: 0, width: 100, height: 100, sensitivityOverride: { motion: 40 } }],
  });
  browser.readFrame.mockImplementation(() => {
    const data = new Uint8ClampedArray(16 * 16 * 4).fill(128);
    data.fill(Math.floor(Date.now() / 200) % 2 ? 0 : 255, 0, 16 * 4 * 4);
    return new ImageData(data, 16, 16);
  });
  try {
    render(<MonitorPage />);
    await act(async () => {});
    await startMonitoring();
    act(() => { jest.advanceTimersByTime(1000); });
    expect(valueText('Motion')).toMatch(/^25 per cent/);
    // The other camera opens with a stream of its own.
    const tracks = [new BrowserTrack('video'), new BrowserTrack('audio')];
    browser.getUserMedia.mockResolvedValueOnce({
      getTracks: () => [...tracks],
      getVideoTracks: () => tracks.filter((track) => track.kind === 'video'),
      getAudioTracks: () => tracks.filter((track) => track.kind === 'audio'),
      removeTrack: (track: BrowserTrack) => { tracks.splice(tracks.indexOf(track), 1); },
    } as unknown as MediaStream);
    act(() => useCameraStore.getState().setDeviceId('usb'));
    await act(async () => {});
    await act(async () => {});
    expect(document.querySelector('.watch-frame')?.getAttribute('data-phase')).toBe('live');
    expect(valueText('Motion')).toBeNull();
  } finally {
    useSettingsStore.setState({ detectionZones: zones });
    useCameraStore.getState().setDeviceId('');
  }
});

it('leaves focus on a key outside the frame when the camera stops, and gives it to Start watching when Stop watching goes', async () => {
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  const show = screen.getByRole('button', { name: 'Show settings' });
  show.focus();
  act(() => browser.video.end());
  expect(screen.getByRole('button', { name: 'Start watching' })).toBeTruthy();
  expect(document.activeElement).toBe(show);

  const tracks = [new BrowserTrack('video'), new BrowserTrack('audio')];
  browser.getUserMedia.mockResolvedValueOnce({
    getTracks: () => [...tracks],
    getVideoTracks: () => tracks.filter((track) => track.kind === 'video'),
    getAudioTracks: () => tracks.filter((track) => track.kind === 'audio'),
    removeTrack: (track: BrowserTrack) => { tracks.splice(tracks.indexOf(track), 1); },
  } as unknown as MediaStream);
  await startMonitoring();
  const stop = screen.getByRole('button', { name: 'Stop watching' });
  stop.focus();
  fireEvent.click(stop);
  await act(async () => {});
  expect(document.activeElement?.textContent).toBe('Start watching');
});

it('shows no held reading from the last camera under reduced motion once another camera is chosen', async () => {
  reducedMotion(true);
  seedMotionOnly();
  const zones = useSettingsStore.getState().detectionZones;
  useSettingsStore.setState({
    detectionZones: [{ id: 'full', name: 'Full Screen', enabled: true, x: 0, y: 0, width: 100, height: 100, sensitivityOverride: { motion: 40 } }],
  });
  browser.readFrame.mockImplementation(() => {
    const data = new Uint8ClampedArray(16 * 16 * 4).fill(128);
    data.fill(Math.floor(Date.now() / 200) % 2 ? 0 : 255, 0, 16 * 4 * 4);
    return new ImageData(data, 16, 16);
  });
  try {
    render(<MonitorPage />);
    await act(async () => {});
    await startMonitoring();
    // The page renders between the readings and the meter's one-second step.
    act(() => { jest.advanceTimersByTime(400); });
    act(() => { jest.advanceTimersByTime(600); });
    expect(valueText('Motion')).toMatch(/^25 per cent/);
    const tracks = [new BrowserTrack('video'), new BrowserTrack('audio')];
    browser.getUserMedia.mockResolvedValueOnce({
      getTracks: () => [...tracks],
      getVideoTracks: () => tracks.filter((track) => track.kind === 'video'),
      getAudioTracks: () => tracks.filter((track) => track.kind === 'audio'),
      removeTrack: (track: BrowserTrack) => { tracks.splice(tracks.indexOf(track), 1); },
    } as unknown as MediaStream);
    act(() => useCameraStore.getState().setDeviceId('usb'));
    await act(async () => {});
    await act(async () => {});
    expect(document.querySelector('.watch-frame')?.getAttribute('data-phase')).toBe('live');
    expect(valueText('Motion')).toBeNull();
  } finally {
    reducedMotion(false);
    useSettingsStore.setState({ detectionZones: zones });
    useCameraStore.getState().setDeviceId('');
  }
});

it('says alerts cannot be saved on this device when the saved ones could not be read', async () => {
  const refused = Promise.reject(new Error('The database refused the read.'));
  refused.catch(() => {});
  mockAlertRead.held = refused as Promise<never[]>;
  useMonitoringStore.setState({ alertsRead: false });
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    render(<MonitorPage />);
    await act(async () => {});
    await act(async () => {});
    await startMonitoring();
    // The store's error line beside the problem glyph, under the header; the
    // list goes on in memory under it.
    const line = screen.getByText('Alerts could not be saved on this device. They show here until you reload.');
    expect(line.closest('.watch-list__problem')?.querySelector('.problem-mark')).toBeTruthy();
    expect(screen.queryByText(/could not be read/)).toBeNull();
    expect(screen.getByText('No alert so far.')).toBeTruthy();
  } finally {
    mockAlertRead.held = null;
    warn.mockRestore();
  }
});

it('offers Deep Sleep Ultra-Sensitive among the presets under Show settings', async () => {
  localStorage.setItem('safeos-watch-view', 'settings');
  useSettingsStore.getState().setActivePreset('maximum');
  render(<MonitorPage />);
  await act(async () => {});
  expect(screen.getByRole('button', { name: 'Infant' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Deep sleep' }));
  expect(useSettingsStore.getState().activePresetId).toBe('deep_sleep_minimal');
});
