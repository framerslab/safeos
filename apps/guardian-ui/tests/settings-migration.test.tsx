/** @jest-environment jsdom */
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import './helpers/browser-data';
import SettingsPage from '@/app/settings/page';
import { useAuthStore } from '@/stores/auth-store';
import { useSettingsStore } from '@/stores/settings-store';
jest.mock('@/contexts/BackendStatusContext', () => ({ useBackendStatus: () => ({ status: { api: 'disconnected' }, config: { apiUrl: '' } }) }));

it.each(['account', 'browser'])('reads existing %s preferences when Settings opens, with no Save Changes', async (source) => {
  localStorage.clear();
  useAuthStore.setState({ profile: null, sessionToken: null });
  useSettingsStore.getState().resetToDefaults();
  const preferences = { defaultScenario: 'pet' as const, motionSensitivity: 0, audioSensitivity: 0.2, alertVolume: 0.3, theme: 'dark' as const };
  if (source === 'account') useAuthStore.getState().login({ id: 'existing', displayName: 'Existing', preferences });
  else localStorage.setItem('safeos_user_settings', JSON.stringify({ preferences }));
  render(<SettingsPage />);
  expect(screen.queryByRole('button', { name: 'Save Changes' })).toBeNull();
  await waitFor(() => expect(useSettingsStore.getState().globalSettings).toEqual(expect.objectContaining({ motionSensitivity: 0, audioSensitivity: 20, alertVolume: 30 })));
  expect(screen.queryByText('Settings saved!')).toBeNull();
  if (source === 'account') expect(useAuthStore.getState().profile?.preferences).toEqual(preferences);
});

it('keeps a volume changed after the browser preferences were read when a profile is read later', async () => {
  localStorage.clear();
  useAuthStore.setState({ profile: null, sessionToken: null });
  useSettingsStore.getState().resetToDefaults();
  localStorage.setItem('safeos_user_settings', JSON.stringify({ preferences: { alertVolume: 0.55 } }));
  render(<SettingsPage />);
  await waitFor(() => expect(useSettingsStore.getState().globalSettings.alertVolume).toBe(55));
  // The volume moves on Alert sounds, as its slider moves it.
  act(() => {
    useSettingsStore.getState().tuneScenario(null, { alertVolume: 30 });
  });
  // A server is connected and its profile, new to this browser, is read.
  act(() => {
    useAuthStore.getState().login({
      id: 'person-on-server',
      displayName: 'Robin',
      preferences: { defaultScenario: 'pet', motionSensitivity: 0.5, audioSensitivity: 0.5, alertVolume: 0.7, theme: 'dark' },
    });
  });
  await waitFor(() => expect(useSettingsStore.getState().settingsSourceId).toBe('account:person-on-server'));
  expect(useSettingsStore.getState().globalSettings.alertVolume).toBe(30);
});
