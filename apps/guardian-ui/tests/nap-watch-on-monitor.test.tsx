/** @jest-environment jsdom */
/**
 * A watch started from Nap Mode
 *
 * Start Nap Mode leaves the planned minutes as a one-use hand-off in this tab.
 * The monitor takes it on arrival and keeps the nap in this history entry, so
 * a reload or Back finds it and a link from elsewhere carries none. It starts
 * watching, sounds the alarm for every movement alert, plays the warning every
 * 30 seconds at the effective volume once the planned minutes have passed,
 * whether or not the camera is running, and ends
 * the nap on Stop or on End nap, where the infant_sleep preset gives way while
 * it is the setting in use. A watch opened any other way has no nap. While
 * another tab watches, the nap's watch asks first, as a start key does; the
 * nap stands whatever the answer. The monitor's list of settings links Nap
 * Mode.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import MonitorPage from '@/app/monitor/page';
import { getSoundManager } from '@/lib/sound-manager';
import { askOtherTabs, takeOverWatch } from '@/lib/tab-channel';
import { useMonitoringStore } from '@/stores/monitoring-store';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useSettingsStore } from '@/stores/settings-store';
import { installCameraBrowser, startMonitoring } from './helpers/camera-browser';

/** An address without its trailing slash: next/link drops it outside a build. */
const bare = (address: string | null | undefined) => (address || '').replace(/(?<=[^/])\/(?=$|[?#])/, '');

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({ config: { wsUrl: '' } }),
}));
jest.mock('@/lib/tab-channel', () => ({
  ...jest.requireActual('@/lib/tab-channel'),
  askOtherTabs: jest.fn(),
  takeOverWatch: jest.fn(),
}));

const QUESTION = 'Watch here instead? The other tab stops.';

function arriveFromNap(minutes: number) {
  sessionStorage.setItem('safeos-nap-handoff', JSON.stringify({ minutes, at: Date.now() }));
}

/** A camera whose picture never changes, so no detector alert plays a sound. */
function stillCamera() {
  (HTMLCanvasElement.prototype.getContext as unknown as jest.Mock).mockImplementation(() => ({
    drawImage: jest.fn(),
    getImageData: () => new ImageData(new Uint8ClampedArray(16 * 16 * 4).fill(128), 16, 16),
  }));
}

/** A camera where six pixels change every frame: about the smallest movement the Nap preset alerts on. */
function smallMovementCamera() {
  let frame = 0;
  (HTMLCanvasElement.prototype.getContext as unknown as jest.Mock).mockImplementation(() => ({
    drawImage: jest.fn(),
    getImageData: () => {
      // The six pixels step through brightness, since the pixel check compares
      // each frame with the one two back: a picture that alternates looks still.
      frame += 1;
      const data = new Uint8ClampedArray(16 * 16 * 4);
      data.fill((frame * 40) % 256, 0, 6 * 4);
      return new ImageData(data, 16, 16);
    },
  }));
}

// The key under the camera's frame that stops the watch or the start; the
// other tab's question has a Cancel of its own.
const stopKey = () => {
  const controls = document.querySelector<HTMLElement>('.watch-controls');
  return controls ? within(controls).queryByRole('button', { name: /^(Stop watching|Cancel)$/ }) : null;
};
const sounds = () => play.mock.calls.map(([type]) => type);
const smallMovementAlerted = () => useMonitoringStore.getState().alerts
  .some((alert) => alert.message.startsWith('Pixel movement detected') && alert.severity === 'low');

let browser: ReturnType<typeof installCameraBrowser>;
let warnings: () => number;
let play: jest.SpyInstance;

const realQuietHours = useSettingsStore.getState().isQuietHoursActive;

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/monitor/');
  useMonitoringStore.getState().reset();
  useSettingsStore.getState().resetToDefaults();
  useSettingsStore.setState({ globalMute: true, isQuietHoursActive: realQuietHours });
  useOnboardingStore.getState().setScenario('baby');
  browser = installCameraBrowser();
  play = jest.spyOn(getSoundManager(), 'play');
  jest.mocked(askOtherTabs).mockReset().mockResolvedValue({ watching: false });
  jest.mocked(takeOverWatch).mockReset().mockResolvedValue(true);
  warnings = () => play.mock.calls.filter(([type]) => type === 'warning').length;
});
afterEach(() => { cleanup(); jest.useRealTimers(); jest.restoreAllMocks(); });

it('starts watching on arrival from Nap Mode and uses the hand-off once', async () => {
  useSettingsStore.getState().activateSleepMode('infant_sleep');
  arriveFromNap(30);
  render(<MonitorPage />);
  await act(async () => {});

  expect(stopKey()).not.toBeNull();
  expect(sessionStorage.getItem('safeos-nap-handoff')).toBeNull();
  expect(window.history.state.safeosNap).toMatchObject({ minutes: 30 });
});

it('starts nothing from a link: the address carries no nap', async () => {
  stillCamera();
  window.history.replaceState(null, '', '/monitor/?nap=1');
  render(<MonitorPage />);
  await act(async () => {});

  expect(screen.getByRole('button', { name: 'Start watching' })).toBeTruthy();
  expect(browser.getUserMedia).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(90_000); });
  expect(warnings()).toBe(0);
});

it('ignores a hand-off older than two minutes', async () => {
  sessionStorage.setItem('safeos-nap-handoff', JSON.stringify({ minutes: 30, at: Date.now() - 3 * 60_000 }));
  render(<MonitorPage />);
  await act(async () => {});

  expect(screen.getByRole('button', { name: 'Start watching' })).toBeTruthy();
  expect(sessionStorage.getItem('safeos-nap-handoff')).toBeNull();
});

it('finds the nap again after a reload and waits for a tap, which turns its sound on, before it watches', async () => {
  stillCamera();
  useSettingsStore.getState().activateSleepMode('infant_sleep');
  window.history.replaceState({ safeosNap: { startedAt: Date.now() - 14 * 60_000, minutes: 15 } }, '', '/monitor/');
  const unlockAudio = jest.spyOn(getSoundManager(), 'unlockAudio');
  render(<MonitorPage />);
  await act(async () => {});

  // A reload leaves the browser's sound off until a tap: the watch does not start without one.
  expect(browser.getUserMedia).not.toHaveBeenCalled();
  expect(stopKey()).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Resume nap' }));
  await act(async () => {});
  expect(unlockAudio).toHaveBeenCalled();
  expect(stopKey()).not.toBeNull();
  await act(async () => { jest.advanceTimersByTime(60_000); });
  expect(warnings()).toBe(1);

  fireEvent.click(stopKey() as HTMLElement);
  await act(async () => {});
  expect(window.history.state?.safeosNap).toBeUndefined();
  expect(useSettingsStore.getState().activePresetId).toBe('maximum');
});

it('starts nothing from a nap kept over twelve hours ago, as in a tab restored the next day', async () => {
  window.history.replaceState({ safeosNap: { startedAt: Date.now() - 13 * 60 * 60_000, minutes: 15 } }, '', '/monitor/');
  render(<MonitorPage />);
  await act(async () => {});

  expect(screen.getByRole('button', { name: 'Start watching' })).toBeTruthy();
  expect(browser.getUserMedia).not.toHaveBeenCalled();
});

it('plays the reminder at the effective volume, quiet hours included', async () => {
  stillCamera();
  useSettingsStore.setState({
    globalMute: false,
    isQuietHoursActive: () => true,
    quietHoursSettings: { ...useSettingsStore.getState().quietHoursSettings, enabled: true, mode: 'reduced', reducedVolume: 20 },
  });
  arriveFromNap(1);
  render(<MonitorPage />);
  await act(async () => {});
  await act(async () => { jest.advanceTimersByTime(60_000); });

  expect(play).toHaveBeenCalledWith('warning', expect.objectContaining({ volume: 20 }));
});

it('sounds the alarm for the smallest movement in a nap, as Nap Mode says it will', async () => {
  smallMovementCamera();
  useSettingsStore.getState().activateSleepMode('infant_sleep');
  arriveFromNap(30);
  render(<MonitorPage />);
  await act(async () => {});
  await act(async () => { jest.advanceTimersByTime(5_000); });

  expect(smallMovementAlerted()).toBe(true);
  expect(sounds()).toContain('alarm');
  expect(sounds().filter((type) => type !== 'alarm')).toEqual([]);
});

it('sounds the nap alarm at the effective volume as it plays, quiet hours that have just begun included', async () => {
  smallMovementCamera();
  useSettingsStore.getState().activateSleepMode('infant_sleep');
  useSettingsStore.setState({
    globalMute: false,
    isQuietHoursActive: () => true,
    quietHoursSettings: { ...useSettingsStore.getState().quietHoursSettings, enabled: true, mode: 'reduced', reducedVolume: 20 },
  });
  arriveFromNap(30);
  render(<MonitorPage />);
  await act(async () => {});
  await act(async () => { jest.advanceTimersByTime(5_000); });

  expect(play).toHaveBeenCalledWith('alarm', expect.objectContaining({ volume: 20 }));
});

it('keeps the sound of each severity on a watch with no nap', async () => {
  smallMovementCamera();
  useSettingsStore.getState().setActivePreset('infant_sleep');
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  await act(async () => { jest.advanceTimersByTime(5_000); });

  expect(smallMovementAlerted()).toBe(true);
  expect(sounds()).toContain('notification');
  expect(sounds()).not.toContain('alarm');
});

it('plays the warning every 30 seconds once the planned minutes have passed', async () => {
  stillCamera();
  arriveFromNap(1);
  render(<MonitorPage />);
  await act(async () => {});

  await act(async () => { jest.advanceTimersByTime(30_000); });
  expect(warnings()).toBe(0);
  await act(async () => { jest.advanceTimersByTime(30_000); });
  expect(warnings()).toBe(1);
  await act(async () => { jest.advanceTimersByTime(30_000); });
  expect(warnings()).toBe(2);
});

it('keeps the reminder when the camera fails, and End nap ends the nap', async () => {
  useSettingsStore.getState().activateSleepMode('infant_sleep');
  browser.getUserMedia.mockRejectedValue(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }));
  arriveFromNap(1);
  render(<MonitorPage />);
  await act(async () => {});
  expect(stopKey()).toBeNull();

  await act(async () => { jest.advanceTimersByTime(60_000); });
  expect(warnings()).toBe(1);

  fireEvent.click(screen.getByRole('button', { name: 'End nap' }));
  await act(async () => { jest.advanceTimersByTime(60_000); });
  expect(warnings()).toBe(1);
  expect(useSettingsStore.getState().activePresetId).toBe('maximum');
});

it("ends the nap on Stop: the Nap preset gives way, as I'm Awake did, and no reminder follows", async () => {
  stillCamera();
  useSettingsStore.getState().activateSleepMode('infant_sleep');
  arriveFromNap(1);
  render(<MonitorPage />);
  await act(async () => {});

  fireEvent.click(stopKey() as HTMLElement);
  await act(async () => { jest.advanceTimersByTime(90_000); });

  expect(useSettingsStore.getState().activePresetId).toBe('maximum');
  expect(useSettingsStore.getState().activeSleepPreset).toBeNull();
  expect(warnings()).toBe(0);
});

it('keeps a setting the person chose during the nap when the watch stops', async () => {
  useSettingsStore.getState().activateSleepMode('infant_sleep');
  arriveFromNap(30);
  render(<MonitorPage />);
  await act(async () => {});
  act(() => { useSettingsStore.getState().setActivePreset('night'); });

  fireEvent.click(stopKey() as HTMLElement);
  await act(async () => {});

  expect(useSettingsStore.getState().activePresetId).toBe('night');
});

it('starts on arrival under React Strict Mode, which runs effects twice in development', async () => {
  useSettingsStore.getState().activateSleepMode('infant_sleep');
  arriveFromNap(30);
  render(<React.StrictMode><MonitorPage /></React.StrictMode>);
  await act(async () => {});

  expect(useMonitoringStore.getState().isStreaming).toBe(true);
  expect(screen.getByRole('button', { name: 'Stop watching' })).toBeTruthy();
});

it('gives a watch opened any other way no nap, even after an earlier nap in the tab', async () => {
  stillCamera();
  // What an earlier nap left in this tab: a hand-off long past.
  sessionStorage.setItem('safeos-nap-handoff', JSON.stringify({ minutes: 15, at: Date.now() - 60 * 60_000 }));
  useSettingsStore.getState().setActivePreset('infant_sleep');
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();

  await act(async () => { jest.advanceTimersByTime(60_000); });
  expect(warnings()).toBe(0);

  fireEvent.click(stopKey() as HTMLElement);
  await act(async () => {});
  expect(useSettingsStore.getState().activePresetId).toBe('infant_sleep');
});

it('keeps the setting of a watch not started from Nap Mode when it stops', async () => {
  useSettingsStore.getState().setActivePreset('night');
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();

  fireEvent.click(stopKey() as HTMLElement);
  await act(async () => {});

  expect(useSettingsStore.getState().activePresetId).toBe('night');
});

it('links Nap Mode first in the watch\'s settings', async () => {
  render(<MonitorPage />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Show settings' }));

  const links = screen.getAllByRole('link', { name: 'Nap Mode' });
  expect(links.map((link) => bare(link.getAttribute('href')))).toEqual(['/nap']);
});

it("asks before a nap's watch starts while another tab watches", async () => {
  stillCamera();
  jest.mocked(askOtherTabs).mockResolvedValue({ watching: true, way: 'monitor' });

  // Watch here: the other tab stops, then the nap's watch starts.
  arriveFromNap(30);
  render(<MonitorPage />);
  await act(async () => {});
  const asked = screen.getByRole('dialog', { name: QUESTION });
  expect(browser.getUserMedia).not.toHaveBeenCalled();
  expect(stopKey()).toBeNull();
  // The watch starts only once the other tab has stopped.
  let stopped!: (done: boolean) => void;
  jest.mocked(takeOverWatch).mockReturnValueOnce(new Promise((resolve) => { stopped = resolve; }));
  fireEvent.click(within(asked).getByRole('button', { name: 'Watch here' }));
  await act(async () => {});
  expect(takeOverWatch).toHaveBeenCalledTimes(1);
  expect(browser.getUserMedia).not.toHaveBeenCalled();
  expect(stopKey()).toBeNull();
  await act(async () => { stopped(true); });
  await act(async () => {});
  expect(stopKey()).not.toBeNull();
  cleanup();

  // Cancel: nothing watches, and the nap stays.
  browser.getUserMedia.mockClear();
  window.history.replaceState(null, '', '/monitor/');
  arriveFromNap(30);
  render(<MonitorPage />);
  await act(async () => {});
  fireEvent.click(within(screen.getByRole('dialog', { name: QUESTION })).getByRole('button', { name: 'Cancel' }));
  await act(async () => {});
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(browser.getUserMedia).not.toHaveBeenCalled();
  expect(stopKey()).toBeNull();
  expect(screen.getByRole('button', { name: 'End nap' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Start watching' })).toBeTruthy();
  expect(window.history.state.safeosNap).toMatchObject({ minutes: 30 });
});
