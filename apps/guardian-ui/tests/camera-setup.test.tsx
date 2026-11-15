/** @jest-environment jsdom */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import SetupPage from '@/app/setup/page';
import { canSkipOnboarding, useOnboardingStore } from '@/stores/onboarding-store';
import { useCameraStore } from '@/stores/camera-store';
import { installCameraBrowser } from './helpers/camera-browser';

const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
afterEach(() => { cleanup(); jest.restoreAllMocks(); });

it('lets setup choose a camera for the permission check and later monitoring', async () => {
  localStorage.clear();
  useOnboardingStore.getState().reset();
  const browser = installCameraBrowser();
  render(<SetupPage />);
  fireEvent.click(screen.getByRole('button', { name: /Begin Setup/ }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /Accept & Continue/ }));
  fireEvent.click(screen.getByRole('button', { name: /Baby/ }));
  await act(async () => {});
  fireEvent.change(screen.getByRole('combobox', { name: 'Camera' }), { target: { value: 'usb' } });
  fireEvent.click(screen.getByRole('button', { name: /Grant|Enable.*Access/i }));
  await act(async () => {});
  expect(browser.getUserMedia).toHaveBeenLastCalledWith(expect.objectContaining({
    video: expect.objectContaining({ deviceId: { exact: 'usb' } }),
  }));
  expect(browser.video.stop).toHaveBeenCalled();
});


it.each(['OverconstrainedError', 'NotFoundError'])('reports missing hardware separately from permission denial: %s', async (name) => {
  useOnboardingStore.getState().reset();
  // A camera chosen in the menu that the browser cannot open.
  useCameraStore.getState().setDeviceId('usb');
  const browser = installCameraBrowser();
  browser.getUserMedia.mockRejectedValue(new DOMException('', name));
  render(<SetupPage />);
  fireEvent.click(screen.getByRole('button', { name: /Begin Setup/ }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /Accept & Continue/ }));
  fireEvent.click(screen.getByRole('button', { name: /Baby/ }));
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: /Grant Permissions/ }));
  await act(async () => {});
  expect(screen.getByText('The selected camera is unavailable. Choose another camera.')).toBeTruthy();
  expect(screen.queryByText(/Permission denied/)).toBeNull();
});

it('lets setup continue with video alone on a device without a microphone', async () => {
  useOnboardingStore.getState().reset();
  const browser = installCameraBrowser();
  browser.getUserMedia.mockImplementation(async (constraints: MediaStreamConstraints) => {
    if (constraints.audio) throw new DOMException('Requested device not found', 'NotFoundError');
    return browser.stream;
  });
  render(<SetupPage />);
  fireEvent.click(screen.getByRole('button', { name: /Begin Setup/ }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /Accept & Continue/ }));
  fireEvent.click(screen.getByRole('button', { name: /Baby/ }));
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: /Grant Permissions/ }));
  expect(await screen.findByRole('button', { name: 'Continue' })).toBeTruthy();
  expect(useOnboardingStore.getState().cameraPermissionGranted).toBe(true);
  expect(useOnboardingStore.getState().microphonePermissionGranted).toBe(false);
  expect(browser.video.stop).toHaveBeenCalled();
});

// -----------------------------------------------------------------------------
// The camera step always has a way forward
// -----------------------------------------------------------------------------

const REFUSED = 'The browser blocked the camera for this site. To allow it, open the site settings from the address bar, set Camera to Allow, then press Try again.';
const NOT_STARTED = 'The camera did not start. Another app or tab may be using it. Close it, then press Try again.';
const NONE_FOUND = 'No camera was found on this device.';
const SAVED_GONE = 'The selected camera is unavailable. Choose another camera.';
const NO_SUPPORT = 'This browser cannot use a camera on this page.';
const OTHER = 'Unable to access the camera or microphone. Check the device and try again.';
const LATER = 'You can allow the camera later, on the Monitor page.';

/** A first visit with `camera` chosen in the menu ('' is "Default camera"). */
function firstVisit(camera = '') {
  localStorage.clear();
  useOnboardingStore.getState().reset();
  useCameraStore.getState().setDeviceId(camera);
  mockRouter.push.mockClear();
  return installCameraBrowser();
}

async function openScenarioStep() {
  render(<SetupPage />);
  fireEvent.click(screen.getByRole('button', { name: /Begin Setup/ }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /Accept & Continue/ }));
  await act(async () => {});
}

async function openCameraStep() {
  await openScenarioStep();
  fireEvent.click(screen.getByRole('button', { name: /Baby/ }));
  await act(async () => {});
  expect(screen.getByRole('heading', { name: /Device Access/ })).toBeTruthy();
}

it.each([
  ['NotAllowedError', '', REFUSED],
  ['SecurityError', '', REFUSED],
  ['NotReadableError', '', NOT_STARTED],
  ['AbortError', '', NOT_STARTED],
  ['TrackStartError', '', NOT_STARTED],
  ['NotFoundError', '', NONE_FOUND],
  ['OverconstrainedError', '', NONE_FOUND],
  ['NotFoundError', 'usb', SAVED_GONE],
  ['OverconstrainedError', 'usb', SAVED_GONE],
  ['InvalidStateError', '', OTHER],
])('after %s with the camera "%s" chosen, the step says what happened and offers Try again and a way on', async (name, camera, words) => {
  const browser = firstVisit(camera);
  browser.getUserMedia.mockRejectedValue(new DOMException('', name));
  await openCameraStep();
  fireEvent.click(screen.getByRole('button', { name: 'Grant Permissions' }));
  await act(async () => {});
  expect(screen.getByText(words)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Grant Permissions' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Continue without the camera' })).toBeTruthy();
  expect(screen.getByText(LATER)).toBeTruthy();
});

it.each([
  ['no navigator.mediaDevices', undefined],
  ['no getUserMedia', Object.assign(new EventTarget(), { enumerateDevices: async () => [] })],
])('in a browser with %s, the step says the browser cannot use a camera and offers a way on', async (_shape, mediaDevices) => {
  firstVisit();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: mediaDevices });
  await openCameraStep();
  fireEvent.click(screen.getByRole('button', { name: 'Grant Permissions' }));
  await act(async () => {});
  expect(screen.getByText(NO_SUPPORT)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Continue without the camera' })).toBeTruthy();
});

it('asks again on Try again and goes on when the camera answers', async () => {
  const browser = firstVisit();
  browser.getUserMedia.mockRejectedValueOnce(new DOMException('', 'NotAllowedError'));
  await openCameraStep();
  fireEvent.click(screen.getByRole('button', { name: 'Grant Permissions' }));
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('button', { name: 'Continue' })).toBeTruthy();
  expect(browser.getUserMedia).toHaveBeenCalledTimes(2);
  expect(screen.queryByText(REFUSED)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Continue without the camera' })).toBeNull();
  expect(screen.queryByText(LATER)).toBeNull();
  expect(useOnboardingStore.getState().cameraPermissionGranted).toBe(true);
});

it.each([
  ['before any request', false],
  ['after a refused request', true],
])('Continue without the camera, %s, records both permissions as off and setup finishes on the dashboard', async (_when, refusedFirst) => {
  const browser = firstVisit();
  browser.getUserMedia.mockRejectedValue(new DOMException('', 'NotAllowedError'));
  // An earlier yes saved in this browser: the choice made here replaces it.
  useOnboardingStore.getState().setCameraPermission(true);
  useOnboardingStore.getState().setMicrophonePermission(true);
  await openCameraStep();
  if (refusedFirst) {
    fireEvent.click(screen.getByRole('button', { name: 'Grant Permissions' }));
    await act(async () => {});
  }
  expect(screen.getByText(LATER)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Continue without the camera' }));
  await act(async () => {});
  expect(screen.getByRole('heading', { name: /Notification Settings/ })).toBeTruthy();
  expect(browser.getUserMedia).toHaveBeenCalledTimes(refusedFirst ? 1 : 0);
  expect(useOnboardingStore.getState().cameraPermissionGranted).toBe(false);
  expect(useOnboardingStore.getState().microphonePermissionGranted).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: /Enable & Continue/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Launch Dashboard/ }));
  expect(mockRouter.push).toHaveBeenCalledWith('/dashboard');
  expect(canSkipOnboarding(useOnboardingStore.getState())).toBe(true);
  expect(useOnboardingStore.getState().cameraPermissionGranted).toBe(false);
  expect(useOnboardingStore.getState().microphonePermissionGranted).toBe(false);
});

it('the scenario step shows Continue once a scenario is chosen, and Continue goes on with it', async () => {
  firstVisit();
  await openScenarioStep();
  expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  // Pressing a scenario selects it and goes on.
  fireEvent.click(screen.getByRole('button', { name: /Baby/ }));
  await act(async () => {});
  expect(screen.getByRole('heading', { name: /Device Access/ })).toBeTruthy();
  // Back shows the choice highlighted; Continue confirms it.
  fireEvent.click(screen.getByRole('button', { name: /Back/ }));
  expect(screen.getByRole('heading', { name: /Select Monitoring Scenario/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await act(async () => {});
  expect(screen.getByRole('heading', { name: /Device Access/ })).toBeTruthy();
  expect(useOnboardingStore.getState().selectedScenario).toBe('baby');
});

it('the scenario step shows Continue for a scenario saved earlier', async () => {
  firstVisit();
  useOnboardingStore.getState().setScenario('elderly');
  await openScenarioStep();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await act(async () => {});
  expect(screen.getByRole('heading', { name: /Device Access/ })).toBeTruthy();
  expect(useOnboardingStore.getState().selectedScenario).toBe('elderly');
});

it.each([
  ['allowed', true],
  ['refused', false],
])('a camera request %s after Continue without the camera changes nothing', async (_answer, allowed) => {
  const browser = firstVisit();
  // The browser's prompt stays open while the person goes on.
  let allow!: (stream: MediaStream) => void;
  let refuse!: (error: Error) => void;
  browser.getUserMedia.mockReturnValue(new Promise<MediaStream>((resolve, reject) => { allow = resolve; refuse = reject; }));
  await openCameraStep();
  fireEvent.click(screen.getByRole('button', { name: 'Grant Permissions' }));
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Continue without the camera' }));
  await act(async () => {});
  expect(screen.getByRole('heading', { name: /Notification Settings/ })).toBeTruthy();

  // The prompt is answered only now.
  await act(async () => {
    if (allowed) allow(browser.stream);
    else refuse(new DOMException('', 'NotAllowedError'));
  });
  expect(useOnboardingStore.getState().cameraPermissionGranted).toBe(false);
  expect(useOnboardingStore.getState().microphonePermissionGranted).toBe(false);
  // A camera that did open for the late answer is released.
  if (allowed) expect(browser.video.stop).toHaveBeenCalled();

  // Back on the camera step, the step asks afresh.
  fireEvent.click(screen.getByRole('button', { name: /Back/ }));
  expect(screen.getByRole('heading', { name: /Device Access/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Grant Permissions' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  expect(screen.queryByText(REFUSED)).toBeNull();
  expect(screen.getByRole('button', { name: 'Continue without the camera' })).toBeTruthy();
});

it('only the newest camera request counts: an older answer that arrives later is dropped', async () => {
  const browser = firstVisit();
  let allowFirst!: (stream: MediaStream) => void;
  browser.getUserMedia
    .mockReturnValueOnce(new Promise<MediaStream>((resolve) => { allowFirst = resolve; }))
    .mockRejectedValue(new DOMException('', 'NotReadableError'));
  await openCameraStep();
  // Two presses while the first prompt is open; the second request fails.
  fireEvent.click(screen.getByRole('button', { name: 'Grant Permissions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Grant Permissions' }));
  await act(async () => {});
  expect(screen.getByText(NOT_STARTED)).toBeTruthy();
  await act(async () => { allowFirst(browser.stream); });
  // The step keeps the newest answer.
  expect(screen.getByText(NOT_STARTED)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  expect(useOnboardingStore.getState().cameraPermissionGranted).toBe(false);
  expect(browser.video.stop).toHaveBeenCalled();
});

it('a request left behind before its microphone-free second try asks the browser nothing more', async () => {
  const browser = firstVisit();
  // A device with a camera and no microphone, whose first answer is slow.
  let answerNoMicrophone!: (error: Error) => void;
  browser.getUserMedia.mockReturnValueOnce(new Promise<MediaStream>((_resolve, reject) => { answerNoMicrophone = reject; }));
  await openCameraStep();
  fireEvent.click(screen.getByRole('button', { name: 'Grant Permissions' }));
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Continue without the camera' }));
  await act(async () => {});
  await act(async () => { answerNoMicrophone(new DOMException('', 'NotFoundError')); });
  // No second request, so no camera prompt opens on a later step.
  expect(browser.getUserMedia).toHaveBeenCalledTimes(1);
  expect(browser.video.stop).not.toHaveBeenCalled();
  expect(useOnboardingStore.getState().cameraPermissionGranted).toBe(false);
  expect(useOnboardingStore.getState().microphonePermissionGranted).toBe(false);
  expect(screen.getByRole('heading', { name: /Notification Settings/ })).toBeTruthy();
});
