/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { fakeCaches } from './helpers/browser-data';
import SettingsPage from '@/app/settings/page';
import { AuthButton } from '@/components/AuthButton';
import { useAuthStore } from '@/stores/auth-store';
import { useScheduleStore, DEFAULT_SCHEDULES } from '@/lib/schedule-manager';
import { useThemeStore } from '@/lib/theme-manager';
jest.mock('@/contexts/BackendStatusContext', () => ({ useBackendStatus: () => ({ status: { api: 'disconnected' }, config: { apiUrl: '' } }) }));

it.each(['clear', 'sign out'])('%s removes stored and active schedules and appearance preferences', async (action) => {
  localStorage.clear();
  fakeCaches();
  useScheduleStore.getState().addSchedule({ ...DEFAULT_SCHEDULES[0], enabled: true });
  useThemeStore.getState().setThemeMode('light');
  useThemeStore.getState().updateAccessibility({ largeText: true });
  if (action === 'clear') {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Privacy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear All Local Data' }));
  } else {
    useAuthStore.setState({ isInitialized: true, isAuthenticated: true, isGuest: false, sessionToken: 'local-first' });
    render(<AuthButton />);
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Log Out' }));
  }
  await waitFor(() => expect(localStorage.getItem('guardian-schedules')).toBeNull());
  expect(localStorage.getItem('guardian-theme')).toBeNull();
  expect(useScheduleStore.getState().schedules).toEqual([]);
  expect(useScheduleStore.getState().activeScheduleId).toBeNull();
  expect(useThemeStore.getState().themeMode).toBe('system');
  expect(useThemeStore.getState().accessibility.largeText).toBe(false);
});

it.each(['clear', 'sign out'])('%s removes the dashboard onboarding record', async (action) => {
  localStorage.clear();
  fakeCaches();
  localStorage.setItem('guardian-onboarding-complete', 'true');
  localStorage.setItem('safeos-clear-marker', 'present');
  if (action === 'clear') {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Privacy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear All Local Data' }));
  } else {
    useAuthStore.setState({ isInitialized: true, isAuthenticated: true, isGuest: false, sessionToken: 'local-first' });
    render(<AuthButton />);
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Log Out' }));
  }
  // The marker goes in the same pass that removes the other browser keys.
  await waitFor(() => expect(localStorage.getItem('safeos-clear-marker')).toBeNull());
  expect(localStorage.getItem('guardian-onboarding-complete')).toBeNull();
});
