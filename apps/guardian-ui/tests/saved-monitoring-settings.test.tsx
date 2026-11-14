/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsPage from '@/app/settings/page';
import { useSettingsStore } from '@/stores/settings-store';
import { useSoundManager } from '@/lib/sound-manager';
import { Providers } from '@/components/Providers';
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
it('saving zero volume updates monitoring and the sound used by alerts', async () => {
  localStorage.clear();
  useSettingsStore.getState().resetToDefaults();
  (window as unknown as { AudioContext: unknown }).AudioContext = StandInAudioContext;
  const played: HTMLMediaElement[] = [];
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function(this: HTMLMediaElement) { played.push(this); return Promise.resolve(); });
  render(<Providers><SettingsPage /><MonitoringSound /></Providers>);
  fireEvent.click(screen.getByRole('button', { name: 'Alerts' }));
  fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await screen.findByText('Settings saved!');
  expect(useSettingsStore.getState().getEffectiveSettings().alertVolume).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Play monitoring alert' }));
  const soundGains = () => gains.filter((gain) => gain.outputs.includes(speakers));
  await waitFor(() => expect(soundGains().length).toBeGreaterThan(0));
  expect(played).toEqual([]);
  expect(soundGains()[soundGains().length - 1].gain.value).toBe(0);
});
