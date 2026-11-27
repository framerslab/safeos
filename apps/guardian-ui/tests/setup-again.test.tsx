/** @jest-environment jsdom */
/**
 * Running setup again (/setup/?again=1) keeps every answer on the page and
 * saves them all with the last key, so a device left part way keeps the
 * setup it had. A device whose setup is done and opens /setup/ is sent on, in
 * place of setup in the browser's history.
 */

import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { useStorageEnds } from '@/lib/short-lived-storage';
import { forgetStorageFull } from '@/lib/storage-full';
import { forgetVisit } from '@/lib/visit-store';
import { useAlertPicturesStore } from '@/stores/alert-pictures-store';
import { useCameraStore } from '@/stores/camera-store';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useSettingsStore } from '@/stores/settings-store';
import { installCameraBrowser } from './helpers/camera-browser';
import { chooseUse, continueWithoutCamera, finishedSetup, openSetup, pressLastKey } from './helpers/setup-route';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));

const BLANK_CONFIG = { apiUrl: '', wsUrl: '', ollamaUrl: '', configured: false };
const mockBackend = { config: { ...BLANK_CONFIG } };
jest.mock('@/contexts/BackendStatusContext', () => ({ useBackendStatus: () => mockBackend }));

jest.mock('@/lib/short-lived-storage', () => ({
  ...jest.requireActual('@/lib/short-lived-storage'),
  useStorageEnds: jest.fn(() => false),
}));

const permissionsAtStart = Object.getOwnPropertyDescriptor(navigator, 'permissions');
const setupMatchMedia = window.matchMedia;

let camera: ReturnType<typeof installCameraBrowser>;

beforeEach(() => {
  mockBackend.config = { ...BLANK_CONFIG };
  jest.mocked(useStorageEnds).mockReturnValue(false);
  if (permissionsAtStart) Object.defineProperty(navigator, 'permissions', permissionsAtStart);
  else delete (navigator as unknown as { permissions?: unknown }).permissions;
  localStorage.clear();
  useOnboardingStore.getState().reset();
  useSettingsStore.getState().resetToDefaults();
  useCameraStore.getState().setDeviceId('');
  camera = installCameraBrowser();
  window.matchMedia = ((query: string) => ({ ...setupMatchMedia(query), matches: false })) as typeof window.matchMedia;
  mockRouter.push.mockClear();
  mockRouter.replace.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
  forgetStorageFull();
  forgetVisit();
  cleanup();
  window.matchMedia = setupMatchMedia;
  window.history.replaceState(null, '', '/');
});

const STEP1 = 'Use this device to watch a place';
const OFF = 'The camera is off. SafeOS cannot watch until you turn it on.';
const words = (element: Element | null | undefined) =>
  (element?.textContent || '').replace(/’/g, "'").replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

it('sends a device whose setup is done on to the dashboard, in place of setup', async () => {
  finishedSetup('pet');
  openSetup('/setup/');
  await act(async () => {});
  expect(mockRouter.replace).toHaveBeenCalledWith('/dashboard');
  expect(mockRouter.push).not.toHaveBeenCalled();
});

it('opens step 1 and stays there for a device that runs setup again', async () => {
  finishedSetup('pet');
  openSetup('/setup/?again=1');
  await act(async () => {});
  expect(screen.getByRole('heading', { level: 1, name: STEP1 })).toBeTruthy();
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(mockRouter.push).not.toHaveBeenCalled();
});

it('keeps every answer on the page until the last key: leaving part way keeps the saved setup', async () => {
  finishedSetup('pet');
  useOnboardingStore.setState({ disclaimerAcceptedAt: '2026-11-01T10:00:00.000Z' });
  const { unmount } = openSetup('/setup/?again=1');
  await act(async () => {});
  await continueWithoutCamera();
  chooseUse('A baby');
  unmount();
  const kept = useOnboardingStore.getState();
  expect(kept.selectedScenario).toBe('pet');
  expect(kept.cameraPermissionGranted).toBe(true);
  expect(kept.microphonePermissionGranted).toBe(true);
  expect(kept.disclaimerAcceptedAt).toBe('2026-11-01T10:00:00.000Z');
});

it('saves the new answers with the last key', async () => {
  finishedSetup('pet');
  useOnboardingStore.setState({ disclaimerAcceptedAt: '2026-11-01T10:00:00.000Z' });
  openSetup('/setup/?again=1');
  await act(async () => {});
  await continueWithoutCamera();
  chooseUse('A baby');
  await pressLastKey();
  const saved = useOnboardingStore.getState();
  expect(saved.selectedScenario).toBe('baby');
  expect(saved.cameraPermissionGranted).toBe(false);
  expect(saved.microphonePermissionGranted).toBe(false);
  expect(useSettingsStore.getState().activePresetId).toBe('infant_sleep');
  expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).toHaveBeenCalledWith('/dashboard');
});

it('a camera allowed after Continue without the camera keeps nothing', async () => {
  let allow!: (stream: MediaStream) => void;
  camera.getUserMedia.mockReturnValue(new Promise<MediaStream>((resolve) => { allow = resolve; }));
  finishedSetup('pet');
  openSetup('/setup/?again=1');
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Turn on the camera' }));
  await act(async () => {});
  await continueWithoutCamera();
  await act(async () => { allow(camera.stream); });
  await act(async () => {});
  expect(camera.video.stop).toHaveBeenCalled();
  expect(camera.audio.stop).toHaveBeenCalled();
  expect(words(document.querySelector('main.setup'))).toContain(OFF);
  chooseUse('A pet');
  await pressLastKey();
  expect(useOnboardingStore.getState().cameraPermissionGranted).toBe(false);
});

it('shows the saved use chosen and finishes with no other press', async () => {
  finishedSetup('baby');
  openSetup('/setup/?again=1');
  await act(async () => {});
  await continueWithoutCamera();
  const baby = screen.getByRole('radio', { name: 'A baby' }) as HTMLInputElement;
  expect(baby.checked).toBe(true);
  expect(words(document.getElementById('setup-use-words'))).toContain('For a nap while you stay close enough to hear this device.');
  await pressLastKey();
  expect(mockRouter.replace).toHaveBeenCalledWith('/dashboard');
  expect(useOnboardingStore.getState().selectedScenario).toBe('baby');
});

it('opens step 1 for a first visit, with or without the parameter', async () => {
  for (const address of ['/setup/', '/setup/?again=1']) {
    openSetup(address);
    await act(async () => {});
    expect(screen.getByRole('heading', { level: 1, name: STEP1 })).toBeTruthy();
    cleanup();
  }
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

it('leaves the notice about alert pictures for the first watch', async () => {
  useAlertPicturesStore.getState().reset();
  openSetup('/setup/');
  await act(async () => {});
  expect(screen.queryByRole('group', { name: 'Each alert keeps a picture' })).toBeNull();
  await continueWithoutCamera();
  expect(screen.queryByRole('group', { name: 'Each alert keeps a picture' })).toBeNull();
  chooseUse('A pet');
  await pressLastKey();
  const pictures = useAlertPicturesStore.getState();
  expect(pictures.noticeAnswered).toBe(false);
  expect(pictures.keep).toBe(true);
  expect(pictures.deleteAfterDays).toBe(3);
});
