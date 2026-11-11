/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsPage from '@/app/settings/page';
import { useSettingsStore } from '@/stores/settings-store';
import { useSoundManager } from '@/lib/sound-manager';
jest.mock('@/contexts/BackendStatusContext', () => ({ useBackendStatus: () => ({ status: { api: 'disconnected' }, config: { apiUrl: '' } }) }));
function MonitoringSound() {
  const sound = useSoundManager();
  return <button onClick={() => sound.play('notification', { fadeIn: 0 })}>Play monitoring alert</button>;
}
it('saving zero volume updates monitoring and the sound used by alerts', async () => {
  localStorage.clear();
  useSettingsStore.getState().resetToDefaults();
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const played: HTMLMediaElement[] = [];
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function(this: HTMLMediaElement) { played.push(this); return Promise.resolve(); });
  render(<><SettingsPage /><MonitoringSound /></>);
  fireEvent.click(screen.getByRole('button', { name: 'Alerts' }));
  fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await screen.findByText('Settings saved!');
  expect(useSettingsStore.getState().getEffectiveSettings().alertVolume).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Play monitoring alert' }));
  await waitFor(() => expect(played.length).toBeGreaterThan(0));
  expect(played[played.length - 1].volume).toBe(0);
});
