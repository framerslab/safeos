/** @jest-environment jsdom */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
