/** @jest-environment jsdom */
/**
 * Running setup again
 *
 * The home page's "Run setup again" links /setup/?again=1. Setup sends a
 * visitor whose setup is done on to the dashboard, unless they arrive with
 * that parameter; then it opens at its first step and stays there. Arriving
 * that way, and going on through the steps, resets nothing: the saved setup
 * stays done until the last step is finished.
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import SetupPage from '@/app/setup/page';
import { canSkipOnboarding, useOnboardingStore } from '@/stores/onboarding-store';
import { installCameraBrowser } from './helpers/camera-browser';

const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));

function finishSetup() {
  useOnboardingStore.setState({
    isComplete: true,
    selectedScenario: 'pet',
    acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
  });
}

beforeEach(() => {
  localStorage.clear();
  useOnboardingStore.getState().reset();
  mockRouter.push.mockClear();
  installCameraBrowser();
});
afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

it('sends a visitor whose setup is done on to the dashboard when the address has no parameter', () => {
  window.history.replaceState({}, '', '/setup/');
  finishSetup();
  render(<SetupPage />);
  expect(mockRouter.push).toHaveBeenCalledWith('/dashboard');
});

it('opens at its first step and stays there for a visitor who arrives with again=1', async () => {
  window.history.replaceState({}, '', '/setup/?again=1');
  finishSetup();
  render(<SetupPage />);
  await act(async () => {});
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: /Begin Setup/ })).toBeTruthy();
});

it('resets nothing while the visitor goes on to step 3: setup is still done on this device', async () => {
  window.history.replaceState({}, '', '/setup/?again=1');
  finishSetup();
  const before = JSON.stringify(useOnboardingStore.getState());
  render(<SetupPage />);
  fireEvent.click(screen.getByRole('button', { name: /Begin Setup/ }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /Accept & Continue/ }));
  await act(async () => {});
  // Step 3 asks what is being watched.
  expect(screen.getByRole('button', { name: /Baby/ })).toBeTruthy();
  expect(mockRouter.push).not.toHaveBeenCalled();
  const after = useOnboardingStore.getState();
  expect(canSkipOnboarding(after)).toBe(true);
  expect(after.isComplete).toBe(true);
  expect(after.selectedScenario).toBe('pet');
  expect(JSON.parse(before).acceptedDisclaimers).toEqual(after.acceptedDisclaimers);

  // The visitor leaves and opens setup with no parameter: master's forwarding stands.
  cleanup();
  window.history.replaceState({}, '', '/setup/');
  render(<SetupPage />);
  expect(mockRouter.push).toHaveBeenCalledWith('/dashboard');
});

it('keeps each answer on the page until the last step: a visitor who leaves part way keeps the saved setup', async () => {
  window.history.replaceState({}, '', '/setup/?again=1');
  finishSetup();
  useOnboardingStore.setState({ disclaimerAcceptedAt: '2026-11-01T00:00:00.000Z', cameraPermissionGranted: false });
  render(<SetupPage />);
  fireEvent.click(screen.getByRole('button', { name: /Begin Setup/ }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /Accept & Continue/ }));
  fireEvent.click(screen.getByRole('button', { name: /Baby/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Grant Permissions/ }));
  await screen.findByRole('button', { name: /Continue/ });

  // The visitor leaves before the last step.
  cleanup();
  const saved = useOnboardingStore.getState();
  expect(saved.isComplete).toBe(true);
  expect(saved.selectedScenario).toBe('pet');
  expect(saved.disclaimerAcceptedAt).toBe('2026-11-01T00:00:00.000Z');
  expect(saved.cameraPermissionGranted).toBe(false);
});

it('saves the new answers when the visitor finishes the last step', async () => {
  window.history.replaceState({}, '', '/setup/?again=1');
  finishSetup();
  useOnboardingStore.setState({ disclaimerAcceptedAt: '2026-11-01T00:00:00.000Z', cameraPermissionGranted: false });
  render(<SetupPage />);
  fireEvent.click(screen.getByRole('button', { name: /Begin Setup/ }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /Accept & Continue/ }));
  fireEvent.click(screen.getByRole('button', { name: /Baby/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Grant Permissions/ }));
  fireEvent.click(await screen.findByRole('button', { name: /^Continue/ }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /Skip & Continue/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Launch Dashboard/ }));

  const saved = useOnboardingStore.getState();
  expect(saved.isComplete).toBe(true);
  expect(saved.selectedScenario).toBe('baby');
  expect(saved.disclaimerAcceptedAt).not.toBe('2026-11-01T00:00:00.000Z');
  expect(saved.cameraPermissionGranted).toBe(true);
  expect(mockRouter.push).toHaveBeenCalledWith('/dashboard');
});

it('still opens at its first step for a first visit, with or without the parameter', () => {
  for (const address of ['/setup/', '/setup/?again=1']) {
    window.history.replaceState({}, '', address);
    render(<SetupPage />);
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Begin Setup/ })).toBeTruthy();
    cleanup();
  }
});
