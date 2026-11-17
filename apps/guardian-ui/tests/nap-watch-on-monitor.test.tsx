/** @jest-environment jsdom */
/**
 * A watch started from Nap Mode
 *
 * Nap Mode records the nap for this tab in sessionStorage under safeos-nap:
 * when it began, its planned minutes, and start, true until the monitor has
 * started the watch once. The monitor starts watching on arrival from Nap
 * Mode, plays the warning sound every 30 seconds once the planned minutes have
 * passed, as the nap screen did, and its Stop ends the nap: the infant_sleep
 * preset gives way, as I'm Awake did, and the record goes. A watch not started
 * from Nap Mode keeps its setting when it stops.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import MonitorPage from '@/app/monitor/page';
import { getSoundManager } from '@/lib/sound-manager';
import { useMonitoringStore } from '@/stores/monitoring-store';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useSettingsStore } from '@/stores/settings-store';
import { installCameraBrowser, startMonitoring } from './helpers/camera-browser';

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({ config: { wsUrl: '' } }),
}));

const NAP = 'safeos-nap';

function napStarted(minutesAgo: number, minutes: number, start: boolean) {
  sessionStorage.setItem(NAP, JSON.stringify({ startedAt: Date.now() - minutesAgo * 60_000, minutes, start }));
}

/** A camera whose picture never changes, so no detector alert plays a sound. */
function stillCamera() {
  (HTMLCanvasElement.prototype.getContext as unknown as jest.Mock).mockImplementation(() => ({
    drawImage: jest.fn(),
    getImageData: () => new ImageData(new Uint8ClampedArray(16 * 16 * 4).fill(128), 16, 16),
  }));
}

const stopKey = () => screen.queryByRole('button', { name: /^(Stop Monitoring|Cancel Starting)$/ });

/** Starts the watch by hand when it did not start on arrival. */
async function watching() {
  if (!stopKey()) await startMonitoring();
}

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  sessionStorage.clear();
  useMonitoringStore.getState().reset();
  useSettingsStore.getState().resetToDefaults();
  useSettingsStore.setState({ globalMute: true });
  useOnboardingStore.getState().setScenario('baby');
  installCameraBrowser();
});
afterEach(() => { cleanup(); jest.useRealTimers(); jest.restoreAllMocks(); });

it('starts watching on arrival from Nap Mode, once', async () => {
  useSettingsStore.getState().activateSleepMode('infant_sleep');
  napStarted(0, 30, true);
  const first = render(<MonitorPage />);
  await act(async () => {});

  expect(stopKey()).not.toBeNull();
  expect(JSON.parse(sessionStorage.getItem(NAP) || 'null')).toMatchObject({ minutes: 30, start: false });

  first.unmount();
  render(<MonitorPage />);
  await act(async () => {});
  expect(screen.getByRole('button', { name: 'Start Monitoring' })).toBeTruthy();
});

it('plays the warning every 30 seconds once the planned minutes have passed', async () => {
  stillCamera();
  const play = jest.spyOn(getSoundManager(), 'play');
  const warnings = () => play.mock.calls.filter(([type]) => type === 'warning').length;
  napStarted(14, 15, true);
  render(<MonitorPage />);
  await act(async () => {});
  await watching();

  await act(async () => { jest.advanceTimersByTime(30_000); });
  expect(warnings()).toBe(0); // 14.5 minutes into a 15-minute nap
  await act(async () => { jest.advanceTimersByTime(30_000); });
  expect(warnings()).toBe(1);
  await act(async () => { jest.advanceTimersByTime(30_000); });
  expect(warnings()).toBe(2);
});

it("ends the nap on Stop: the Nap preset gives way, as I'm Awake did, and the record goes", async () => {
  useSettingsStore.getState().activateSleepMode('infant_sleep');
  napStarted(0, 30, true);
  render(<MonitorPage />);
  await act(async () => {});
  await watching();

  fireEvent.click(stopKey() as HTMLElement);
  await act(async () => {});

  expect(useSettingsStore.getState().activePresetId).toBe('maximum');
  expect(useSettingsStore.getState().activeSleepPreset).toBeNull();
  expect(sessionStorage.getItem(NAP)).toBeNull();
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

it('keeps a setting the person chose during the nap when the watch stops', async () => {
  useSettingsStore.getState().activateSleepMode('infant_sleep');
  napStarted(0, 30, true);
  render(<MonitorPage />);
  await act(async () => {});
  await watching();
  act(() => { useSettingsStore.getState().setActivePreset('night'); });

  fireEvent.click(stopKey() as HTMLElement);
  await act(async () => {});

  expect(useSettingsStore.getState().activePresetId).toBe('night');
  expect(sessionStorage.getItem(NAP)).toBeNull();
});

it('starts on arrival under React Strict Mode, which runs effects twice in development', async () => {
  useSettingsStore.getState().activateSleepMode('infant_sleep');
  napStarted(0, 30, true);
  render(<React.StrictMode><MonitorPage /></React.StrictMode>);
  await act(async () => {});

  expect(useMonitoringStore.getState().isStreaming).toBe(true);
  expect(screen.getByRole('button', { name: 'Stop Monitoring' })).toBeTruthy();
});
