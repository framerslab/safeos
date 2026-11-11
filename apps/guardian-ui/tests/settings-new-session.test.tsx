/** @jest-environment jsdom */
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import './helpers/browser-data';
import { Providers } from '@/components/Providers';
import { AuthButton } from '@/components/AuthButton';
import { useAuthStore } from '@/stores/auth-store';
import { useSettingsStore } from '@/stores/settings-store';

it('keeps the settings in effect when a new session creates its default profile', async () => {
  localStorage.clear();
  global.fetch = jest.fn().mockRejectedValue(new TypeError('offline'));
  useSettingsStore.getState().resetToDefaults();
  useSettingsStore.getState().updateQuietHoursSettings({ enabled: true, startTime: '21:00', endTime: '06:00' });
  const { motionSensitivity, audioSensitivity, alertVolume } = useSettingsStore.getState().globalSettings;

  // The account button starts a session; with no server it creates a guest profile with default preferences.
  render(<Providers><AuthButton /></Providers>);
  await waitFor(() => expect(useAuthStore.getState().profile).not.toBeNull());
  await waitFor(() => expect(useSettingsStore.getState().settingsSourceId).toMatch(/^account:/));

  expect(useSettingsStore.getState().globalSettings).toEqual(expect.objectContaining({ motionSensitivity, audioSensitivity, alertVolume }));
  expect(useSettingsStore.getState().quietHoursSettings).toEqual(expect.objectContaining({ enabled: true, startTime: '21:00', endTime: '06:00' }));
});
