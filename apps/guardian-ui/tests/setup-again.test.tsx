/** @jest-environment jsdom */
/**
 * Running setup again
 *
 * The home page's "Run setup again" links /setup/?again=1. Setup sends a
 * visitor whose setup is done on to the dashboard, unless they arrive with
 * that parameter; then it opens at its first step and stays there. Arriving
 * that way, and going on through the steps, resets nothing: the saved setup
 * stays done until the last step is finished. The camera step's "Continue
 * without the camera" is one of those answers, and a camera request answered
 * after the visitor went on, or after a newer request, keeps nothing.
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
  await screen.findByRole('button', { name: /^Continue$/ });

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
  fireEvent.click(await screen.findByRole('button', { name: /^Continue$/ }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /Skip & Continue/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Open dashboard' }));

  const saved = useOnboardingStore.getState();
  expect(saved.isComplete).toBe(true);
  expect(saved.selectedScenario).toBe('baby');
  expect(saved.disclaimerAcceptedAt).not.toBe('2026-11-01T00:00:00.000Z');
  expect(saved.cameraPermissionGranted).toBe(true);
  expect(mockRouter.push).toHaveBeenCalledWith('/dashboard');
});

// Through the first three steps of a second run, to the camera step.
async function openCameraStepAgain() {
  window.history.replaceState({}, '', '/setup/?again=1');
  finishSetup();
  useOnboardingStore.setState({ cameraPermissionGranted: true, microphonePermissionGranted: true });
  render(<SetupPage />);
  fireEvent.click(screen.getByRole('button', { name: /Begin Setup/ }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /Accept & Continue/ }));
  fireEvent.click(screen.getByRole('button', { name: /Baby/ }));
  await screen.findByRole('heading', { name: /Device Access/ });
}

// From the notification step to the end of setup.
async function finishFromNotifications() {
  expect(screen.getByRole('heading', { name: /Notification Settings/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /Skip & Continue/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Open dashboard' }));
}

it('Continue without the camera keeps its answer on the page: a visitor who leaves part way keeps the saved camera and microphone', async () => {
  await openCameraStepAgain();
  fireEvent.click(screen.getByRole('button', { name: 'Continue without the camera' }));
  await act(async () => {});
  expect(screen.getByRole('heading', { name: /Notification Settings/ })).toBeTruthy();

  // The visitor leaves before the last step.
  cleanup();
  const saved = useOnboardingStore.getState();
  expect(saved.isComplete).toBe(true);
  expect(saved.selectedScenario).toBe('pet');
  expect(saved.cameraPermissionGranted).toBe(true);
  expect(saved.microphonePermissionGranted).toBe(true);
});

it('Continue without the camera saves the camera and microphone as off when the visitor finishes the last step', async () => {
  await openCameraStepAgain();
  fireEvent.click(screen.getByRole('button', { name: 'Continue without the camera' }));
  await act(async () => {});
  await finishFromNotifications();

  const saved = useOnboardingStore.getState();
  expect(saved.isComplete).toBe(true);
  expect(saved.selectedScenario).toBe('baby');
  expect(saved.cameraPermissionGranted).toBe(false);
  expect(saved.microphonePermissionGranted).toBe(false);
  expect(mockRouter.push).toHaveBeenCalledWith('/dashboard');
});

it('a camera request allowed after Continue without the camera keeps nothing: the saved setup stays, and finishing saves both as off', async () => {
  const browser = installCameraBrowser();
  // The browser's prompt stays open while the visitor goes on.
  let allow!: (stream: MediaStream) => void;
  browser.getUserMedia.mockReturnValue(new Promise<MediaStream>((resolve) => { allow = resolve; }));
  await openCameraStepAgain();
  fireEvent.click(screen.getByRole('button', { name: 'Grant Permissions' }));
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Continue without the camera' }));
  await act(async () => {});

  // The prompt is answered only now; the camera it opened is released.
  await act(async () => { allow(browser.stream); });
  expect(browser.video.stop).toHaveBeenCalled();
  expect(useOnboardingStore.getState().cameraPermissionGranted).toBe(true);
  expect(useOnboardingStore.getState().microphonePermissionGranted).toBe(true);

  // Finishing saves what the visitor chose, not the late answer.
  await finishFromNotifications();
  const saved = useOnboardingStore.getState();
  expect(saved.cameraPermissionGranted).toBe(false);
  expect(saved.microphonePermissionGranted).toBe(false);
});

it('an older camera request answered after a newer one failed keeps nothing', async () => {
  const browser = installCameraBrowser();
  let allowFirst!: (stream: MediaStream) => void;
  browser.getUserMedia
    .mockReturnValueOnce(new Promise<MediaStream>((resolve) => { allowFirst = resolve; }))
    .mockRejectedValue(new DOMException('', 'NotReadableError'));
  await openCameraStepAgain();
  // Two presses while the first prompt is open; the second request fails.
  fireEvent.click(screen.getByRole('button', { name: 'Grant Permissions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Grant Permissions' }));
  await act(async () => {});
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  await act(async () => { allowFirst(browser.stream); });
  // The step keeps the newest answer and offers no Continue for a granted camera.
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  expect(browser.video.stop).toHaveBeenCalled();

  expect(screen.getByRole('button', { name: 'Continue without the camera' })).toBeTruthy();

  // The visitor leaves: the saved setup is as it was.
  cleanup();
  expect(useOnboardingStore.getState().cameraPermissionGranted).toBe(true);
  expect(useOnboardingStore.getState().microphonePermissionGranted).toBe(true);
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
