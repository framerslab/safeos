/** @jest-environment jsdom */
/**
 * The per-use Motion and Sound sliders on Settings > Detection tune the watch
 * for that use. Each test tunes through the Detection page, starts the watch
 * for a use with the camera and microphone stand-ins, and reads the motion
 * threshold and sound sensitivity the watch reports in its own alerts.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import MonitorPage from '@/app/monitor/page';
import DetectionSettingsPage from '@/app/settings/detection/page';
import { useMonitoringStore } from '@/stores/monitoring-store';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { DEFAULT_PRESETS, useSettingsStore } from '@/stores/settings-store';
import { installCameraBrowser, startMonitoring } from './helpers/camera-browser';

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({ config: { wsUrl: '' } }),
}));

type Analyser = { getByteFrequencyData: (data: Uint8Array) => void };
type AudioContextClass = new () => { createAnalyser(): Analyser };

/** A microphone that hears a steady sound at about 90 percent. */
function loudMicrophone() {
  const Quiet = (global as unknown as { AudioContext: AudioContextClass }).AudioContext;
  class Loud extends Quiet {
    createAnalyser() {
      const analyser = super.createAnalyser();
      analyser.getByteFrequencyData = (data: Uint8Array) => { data.fill(230); };
      return analyser;
    }
  }
  Object.defineProperty(global, 'AudioContext', { configurable: true, value: Loud });
}

/** Moves a use's sliders on Settings > Detection, as a person does. */
function tuneOnDetection(use: string, motion: number, sound: number) {
  const page = render(<DetectionSettingsPage />);
  fireEvent.click(screen.getByRole('button', { name: new RegExp(use) }));
  fireEvent.change(screen.getByRole('slider', { name: `${use} motion sensitivity` }), { target: { value: String(motion) } });
  fireEvent.change(screen.getByRole('slider', { name: `${use} audio sensitivity` }), { target: { value: String(sound) } });
  page.unmount();
}

function resetOnDetection(use: string) {
  const page = render(<DetectionSettingsPage />);
  fireEvent.click(screen.getByRole('button', { name: new RegExp(use) }));
  fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
  page.unmount();
}

/**
 * Starts the watch, lets it see three seconds of movement and sound, and
 * returns the motion threshold and the sound sensitivity its alerts name.
 */
async function watch() {
  // A fresh camera and microphone for each watch: closing the last one stopped its tracks.
  installCameraBrowser();
  loudMicrophone();
  useMonitoringStore.getState().reset();
  const view = render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  await act(async () => { jest.advanceTimersByTime(3000); });
  const messages = useMonitoringStore.getState().alerts.map((alert) => alert.message);
  view.unmount();
  const motion = messages.find((m) => m.startsWith('Motion detected'))?.match(/threshold: (\d+)%/)?.[1];
  const sound = messages.find((m) => m.startsWith('Audio detected'))?.match(/sensitivity: (\d+)%/)?.[1];
  return { motionThreshold: Number(motion), soundSensitivity: Number(sound) };
}

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  useMonitoringStore.getState().reset();
  useSettingsStore.getState().resetToDefaults();
  useSettingsStore.setState({ globalMute: true });
  // The Nap preset: motion 98 and sound 95.
  useSettingsStore.getState().setActivePreset('infant_sleep');
  useOnboardingStore.getState().setScenario('baby');
  installCameraBrowser();
  loudMicrophone();
});
afterEach(() => { cleanup(); jest.useRealTimers(); jest.restoreAllMocks(); });

it('watches a baby with the Motion and Sound set for a baby on Detection', async () => {
  tuneOnDetection('Baby Monitoring', 60, 55);

  // Motion 60 is a 40 percent threshold; the preset's 98 would be 2.
  expect(await watch()).toEqual({ motionThreshold: 40, soundSensitivity: 55 });
});

it('keeps the preset for a use with no override and after Reset on Detection', async () => {
  const preset = DEFAULT_PRESETS.infant_sleep;
  const presetValues = { motionThreshold: 100 - preset.motionSensitivity, soundSensitivity: preset.audioSensitivity };

  tuneOnDetection('Pet Monitoring', 60, 55);
  expect(await watch()).toEqual(presetValues);

  tuneOnDetection('Baby Monitoring', 60, 55);
  resetOnDetection('Baby Monitoring');
  expect(await watch()).toEqual(presetValues);
});

it('applies an override saved by an earlier version, and the preset for what it leaves out', async () => {
  localStorage.setItem('safeos-settings', JSON.stringify({
    state: {
      activePresetId: 'infant_sleep',
      activeSleepPreset: 'infant_sleep',
      globalSettings: { ...DEFAULT_PRESETS.infant_sleep },
      scenarioOverrides: { baby: { motionSensitivity: 60 }, pet: null },
      globalMute: true,
    },
    version: 0,
  }));
  await useSettingsStore.persist.rehydrate();

  expect(await watch()).toEqual({ motionThreshold: 40, soundSensitivity: DEFAULT_PRESETS.infant_sleep.audioSensitivity });
});

it('moves the watch with its own Motion slider when the use has an override', async () => {
  tuneOnDetection('Baby Monitoring', 60, 55);
  const view = render(<MonitorPage />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: /Fine-Tune Settings/ }));
  const sliders = screen.getAllByRole('slider');
  const motion = sliders.find((slider) => (slider as HTMLInputElement).value === '60');
  expect(motion).toBeTruthy();
  fireEvent.change(motion!, { target: { value: '70' } });
  view.unmount();

  expect((await watch()).motionThreshold).toBe(30);
});
