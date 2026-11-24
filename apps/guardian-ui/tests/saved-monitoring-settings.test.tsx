/** @jest-environment jsdom */
import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import './helpers/browser-data';
import SoundsSettingsPage from '@/app/settings/sounds/page';
import { useSettingsStore } from '@/stores/settings-store';
import { getSoundManager, useSoundManager } from '@/lib/sound-manager';
import { Providers } from '@/components/Providers';

// Alert sounds' back link reads the router.
jest.mock('next/navigation', () => ({
  useRouter: () => ({ back: () => undefined, push: () => undefined, replace: () => undefined }),
  usePathname: () => '/settings/sounds/',
}));

function MonitoringSound() {
  const sound = useSoundManager();
  return <button onClick={() => sound.play('notification', { fadeIn: 0 })}>Play monitoring alert</button>;
}
// A stand-in Web Audio API: the built-in sounds are tones, and each sound's volume is its gain.
const param = () => ({ value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} });
const node = () => ({ outputs: [] as unknown[], connect(target: unknown) { this.outputs.push(target); return target; }, disconnect() {} });
const speakers = node();
const gains: { gain: { value: number }; outputs: unknown[] }[] = [];
class StandInAudioContext {
  state = 'running';
  currentTime = 0;
  destination = speakers;
  createGain() { const gain = { ...node(), gain: param() }; gains.push(gain); return gain; }
  createOscillator() { return { ...node(), type: 'sine', frequency: param(), onended: null, start() {}, stop() {} }; }
  resume() { return Promise.resolve(); }
}
it('a volume of zero set on Alert sounds reaches the sound alerts play at', async () => {
  localStorage.clear();
  useSettingsStore.getState().resetToDefaults();
  (window as unknown as { AudioContext: unknown }).AudioContext = StandInAudioContext;
  const played: HTMLMediaElement[] = [];
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function(this: HTMLMediaElement) { played.push(this); return Promise.resolve(); });
  render(<Providers><SoundsSettingsPage /><MonitoringSound /></Providers>);
  const slider = screen.getByRole('slider', { name: 'Alert volume' });
  expect(slider.getAttribute('aria-valuetext')).toBe('100 of 100');
  fireEvent.keyDown(slider, { key: 'Home' });
  expect(screen.getByRole('slider', { name: 'Alert volume' }).getAttribute('aria-valuetext')).toBe('0 of 100');
  expect(useSettingsStore.getState().getEffectiveSettings().alertVolume).toBe(0);
  expect(JSON.parse(localStorage.getItem('safeos-settings') ?? '{}').state.globalSettings.alertVolume).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Play monitoring alert' }));
  const soundGains = () => gains.filter((gain) => gain.outputs.includes(speakers));
  await waitFor(() => expect(soundGains().length).toBeGreaterThan(0));
  expect(played).toEqual([]);
  expect(soundGains()[soundGains().length - 1].gain.value).toBe(0);
});

it('plays the Alert tone at the volume set, and its key reads Stop while it plays', async () => {
  localStorage.clear();
  useSettingsStore.getState().resetToDefaults();
  let ended: (() => void) | undefined;
  const play = jest.spyOn(getSoundManager(), 'play').mockImplementation((_type, options) => {
    ended = options?.onEnd;
    return 'alert-tone';
  });
  const stop = jest.spyOn(getSoundManager(), 'stop').mockImplementation(() => undefined);
  render(<SoundsSettingsPage />);
  fireEvent.change(screen.getByRole('slider', { name: 'Alert volume' }), { target: { value: '40' } });
  expect(screen.getByText('Unanswered alerts get louder from here.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Play Alert volume' }));
  expect(play).toHaveBeenCalledWith('alert', expect.objectContaining({ volume: 40 }));
  const key = screen.getByRole('button', { name: 'Stop Alert volume' });
  expect(key.textContent).toBe('Stop');
  // The tone's pattern ends: the key reads Play again.
  act(() => ended?.());
  expect(screen.getByRole('button', { name: 'Play Alert volume' }).textContent).toBe('Play');
  // Stop ends it at once.
  fireEvent.click(screen.getByRole('button', { name: 'Play Alert volume' }));
  fireEvent.click(screen.getByRole('button', { name: 'Stop Alert volume' }));
  expect(stop).toHaveBeenCalledWith('alert-tone');
  expect(screen.getByRole('button', { name: 'Play Alert volume' })).toBeTruthy();
});

it('stops the Alert tone when its key returns to Play without the tone saying it ended', async () => {
  localStorage.clear();
  useSettingsStore.getState().resetToDefaults();
  jest.useFakeTimers();
  try {
    // A suspended audio context: the tone never says it ended.
    jest.spyOn(getSoundManager(), 'play').mockImplementation(() => 'held-tone');
    const stop = jest.spyOn(getSoundManager(), 'stop').mockImplementation(() => undefined);
    const page = render(<SoundsSettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Play Alert volume' }));
    expect(screen.getByRole('button', { name: 'Stop Alert volume' })).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(30_000);
    });
    expect(screen.getByRole('button', { name: 'Play Alert volume' })).toBeTruthy();
    expect(stop).toHaveBeenCalledWith('held-tone');
    page.unmount();
  } finally {
    jest.useRealTimers();
    jest.restoreAllMocks();
  }
});

it('describes the sounds of your own without saying an animal or a person is detected', () => {
  render(<SoundsSettingsPage />);
  const guide = screen.getByRole('heading', { name: /How Custom Sounds Work/ }).closest('section');
  const lead = screen.getByRole('heading', { level: 1 }).parentElement;
  for (const part of [guide, lead]) {
    expect(part?.textContent ?? '').not.toMatch(/detect|intruder|threat|identif|recogni|confidence/i);
  }
});
