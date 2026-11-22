/** @jest-environment jsdom */
/**
 * The Motion and sound page, rendered whole
 *
 * The watch in the app's look: "Watch for" and Mute alerts on one row, the
 * camera's drawn frame with Start watching and every camera state inside it,
 * a meter for each kind under the live picture, the settings folded under
 * "Settings for this watch", and the alert list's header and empty states.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import MonitorPage from '@/app/monitor/page';
import { useMonitoringStore } from '@/stores/monitoring-store';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useSettingsStore } from '@/stores/settings-store';
import { installCameraBrowser } from './helpers/camera-browser';

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
const mockBackendConfig = { wsUrl: 'wss://monitor.example.test' };
let mockConnected = false;
jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({ config: mockBackendConfig, isConnected: mockConnected }),
}));

let browser: ReturnType<typeof installCameraBrowser>;
beforeEach(() => {
  mockBackendConfig.wsUrl = 'wss://monitor.example.test';
  mockConnected = false;
  jest.useFakeTimers();
  localStorage.clear();
  useMonitoringStore.getState().reset();
  useSettingsStore.setState({ globalMute: true });
  useSettingsStore.getState().updateGlobalSettings({ processingMode: 'local', analysisInterval: 1 });
  useSettingsStore.setState({ scenarioOverrides: {} });
  useOnboardingStore.setState({ selectedScenario: null });
  browser = installCameraBrowser();
});
afterEach(() => { cleanup(); jest.useRealTimers(); jest.restoreAllMocks(); });

// =============================================================================
// The bar's row
// =============================================================================

it('holds "Watch for" and Mute alerts on the bar, and says when alerts are muted', async () => {
  useSettingsStore.setState({ globalMute: false });
  render(<MonitorPage />);
  await act(async () => {});
  expect(screen.getByRole('heading', { level: 1, name: 'Motion and sound' })).toHaveClass('sr-only');
  const heading = screen.getByRole('heading', { level: 2, name: 'Watch for' });
  const mute = screen.getByRole('button', { name: 'Mute alerts' });
  expect(heading.closest('.watch-bar')).not.toBeNull();
  expect(heading.closest('.watch-bar')).toBe(mute.closest('.watch-bar'));
  expect(mute).toHaveAttribute('aria-pressed', 'false');
  expect(screen.queryByText('Alerts are muted. New alerts show here without a sound.')).toBeNull();
  fireEvent.click(mute);
  expect(mute).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Alerts are muted. New alerts show here without a sound.')).toBeInTheDocument();
  expect(useSettingsStore.getState().globalMute).toBe(true);
});

it('carries no modes menu and no link to the home page in its head', async () => {
  render(<MonitorPage />);
  await act(async () => {});
  expect(screen.queryByRole('button', { name: 'Select Security Mode' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'SafeOS home' })).toBeNull();
});
