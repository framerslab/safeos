/** @jest-environment jsdom */
/**
 * The camera through setup's two steps
 *
 * Step 1's key asks once for the camera and the microphone, as the watch
 * asks, and step 2 opens on the live picture. Continue without the camera
 * goes on with both off. A camera blocked earlier is named before any press
 * and again whenever step 1 shows, and setup goes on by itself once the site
 * allows it. Every way off a step ends the camera, so an answer that arrives
 * after the person left keeps nothing. Step 2's lines stand where the watch
 * alerts for the use shown chosen.
 */

import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { sendsToServer } from '@/components/setup/SetupFlow';
import { useStorageEnds } from '@/lib/short-lived-storage';
import { forgetStorageFull } from '@/lib/storage-full';
import { forgetVisit } from '@/lib/visit-store';
import { useCameraStore } from '@/stores/camera-store';
import { canSkipOnboarding, useOnboardingStore } from '@/stores/onboarding-store';
import { useSettingsStore, type ProcessingMode } from '@/stores/settings-store';
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
  // The browser's back button: history.back() announces step 1's entry, as a browser does.
  jest.spyOn(window.history, 'back').mockImplementation(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  });
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
const STEP2 = 'What is it watching?';
const OFF = "The camera is off. SafeOS cannot watch until you turn it on.";
const BLOCKED = "The camera is blocked for safeos.sh in this browser. Allow it in the site's settings, then press Try again.";
const UNSUPPORTED = 'This browser cannot use a camera on this page.';
const SERVER_LINE = 'This device sends the picture to your own server while it watches.';
const STAYS_LINE = 'The picture stays on this device.';

const words = (element: Element | null | undefined) =>
  (element?.textContent || '').replace(/’/g, "'").replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const setupWords = () => words(document.querySelector('main.setup'));
const h1 = () => words(screen.getByRole('heading', { level: 1 }));
const lineAt = (meter: 'Motion' | 'Sound') =>
  (screen.getByRole('meter', { name: meter }).querySelector('.setup-track__line') as HTMLElement | null)?.style.left ?? null;

/** The camera's permission as the browser reports it, with a way to change it as the site's settings do. */
function cameraPermission(initial: PermissionState) {
  const listeners = new Set<(event: Event) => void>();
  const status = {
    state: initial,
    onchange: null as ((event: Event) => void) | null,
    addEventListener: (type: string, listener: (event: Event) => void) => {
      if (type === 'change') listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (event: Event) => void) => {
      listeners.delete(listener);
    },
  };
  const other = { state: 'prompt', onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined };
  const query = jest.fn(async ({ name }: { name: string }) => (name === 'camera' ? status : other));
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query } });
  return {
    set(state: PermissionState) {
      status.state = state;
      const event = new Event('change');
      status.onchange?.(event);
      listeners.forEach((listener) => listener(event));
    },
  };
}

/** An answer the case gives when it chooses. */
function heldCamera() {
  let allow!: (stream: MediaStream) => void;
  camera.getUserMedia.mockReturnValueOnce(new Promise<MediaStream>((resolve) => { allow = resolve; }));
  return { allow: () => allow(camera.stream) };
}

async function turnOn() {
  fireEvent.click(screen.getByRole('button', { name: 'Turn on the camera' }));
  await act(async () => {});
  await act(async () => {});
}

it('asks once for the camera and the microphone, as the watch asks, and opens step 2 with the picture', async () => {
  openSetup('/setup/');
  await act(async () => {});
  await turnOn();
  await screen.findByRole('heading', { level: 1, name: STEP2 });
  expect(screen.getByLabelText('Live picture from this device’s camera').tagName).toBe('VIDEO');
  expect(camera.getUserMedia).toHaveBeenCalledTimes(1);
  const asked = camera.getUserMedia.mock.calls[0][0];
  expect(asked.video).toEqual(expect.objectContaining({ facingMode: 'environment' }));
  expect(asked.audio).toBe(true);
  const saved = useOnboardingStore.getState();
  expect(saved.cameraPermissionGranted).toBe(true);
  expect(saved.microphonePermissionGranted).toBe(true);
  expect(saved.acceptedDisclaimers.main).toBe(true);
  expect(saved.acceptedDisclaimers.scenario).toBe(true);
});

it('asks for the camera saved on this device', async () => {
  useCameraStore.getState().setDeviceId('usb');
  openSetup('/setup/');
  await act(async () => {});
  await turnOn();
  const asked = camera.getUserMedia.mock.calls[0][0];
  expect(asked.video).toEqual(expect.objectContaining({ deviceId: { exact: 'usb' } }));
});

it('Continue without the camera records both as off and opens step 2 with the camera off', async () => {
  openSetup('/setup/');
  await act(async () => {});
  await continueWithoutCamera();
  expect(setupWords()).toContain(OFF);
  const again = screen.getByRole('button', { name: 'Turn on the camera' });
  expect(again.className).toContain('key--outline');
  expect(camera.getUserMedia).not.toHaveBeenCalled();
  const saved = useOnboardingStore.getState();
  expect(saved.cameraPermissionGranted).toBe(false);
  expect(saved.microphonePermissionGranted).toBe(false);
});

it('names a camera blocked earlier before any press', async () => {
  cameraPermission('denied');
  openSetup('/setup/');
  await act(async () => {});
  await act(async () => {});
  expect(setupWords()).toContain(BLOCKED);
  expect(screen.getByRole('link', { name: 'How to allow the camera' })).toBeTruthy();
  expect(camera.getUserMedia).not.toHaveBeenCalled();
});

it('goes on by itself once the browser allows the camera, and counts the statement as read', async () => {
  const permission = cameraPermission('denied');
  openSetup('/setup/');
  await act(async () => {});
  await act(async () => {});
  expect(setupWords()).toContain(BLOCKED);
  await act(async () => {
    permission.set('granted');
  });
  await act(async () => {});
  await screen.findByRole('heading', { level: 1, name: STEP2 });
  expect(camera.getUserMedia).toHaveBeenCalledTimes(1);
  chooseUse('A pet');
  await pressLastKey();
  const saved = useOnboardingStore.getState();
  expect(saved.acceptedDisclaimers.main).toBe(true);
  expect(saved.acceptedDisclaimers.scenario).toBe(true);
  expect(saved.isComplete).toBe(true);
  expect(canSkipOnboarding(useOnboardingStore.getState())).toBe(true);
});

it.each([['Back'], ['the browser’s back button']])(
  'names the blocked camera again on step 1 after Continue and %s, and goes on once the site allows it',
  async (way) => {
    const permission = cameraPermission('denied');
    openSetup('/setup/');
    await act(async () => {});
    await act(async () => {});
    expect(setupWords()).toContain(BLOCKED);
    await continueWithoutCamera();
    expect(setupWords()).toContain(OFF);
    expect(setupWords()).not.toContain(BLOCKED);
    if (way === 'Back') {
      fireEvent.click(screen.getByRole('link', { name: 'Back' }));
    } else {
      act(() => {
        window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
      });
    }
    await act(async () => {});
    await act(async () => {});
    expect(h1()).toBe(STEP1);
    const frame = document.querySelector('.setup-frame[data-state="failed"]');
    expect(frame).not.toBeNull();
    expect(words(frame)).toContain(BLOCKED);
    expect(frame?.querySelector('button')?.textContent).toBe('Try again');
    expect(screen.getByRole('link', { name: 'How to allow the camera' })).toBeTruthy();
    expect(document.getElementById('setup-frame-line')).toBeNull();
    expect(camera.getUserMedia).not.toHaveBeenCalled();
    await act(async () => {
      permission.set('granted');
    });
    await act(async () => {});
    await screen.findByRole('heading', { level: 1, name: STEP2 });
    expect(camera.getUserMedia).toHaveBeenCalledTimes(1);
  }
);

it('names a browser with no camera request again on step 1 after Continue and Back', async () => {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  openSetup('/setup/');
  await act(async () => {});
  expect(setupWords()).toContain(UNSUPPORTED);
  await continueWithoutCamera();
  fireEvent.click(screen.getByRole('link', { name: 'Back' }));
  await act(async () => {});
  expect(h1()).toBe(STEP1);
  expect(setupWords()).toContain(UNSUPPORTED);
  expect(screen.queryByRole('button', { name: 'Turn on the camera' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
});

it("draws step 2's Motion line where the watch alerts for the use, with Motion set for it on Detection", async () => {
  finishedSetup('baby');
  useSettingsStore.getState().setActivePreset('infant_sleep');
  useSettingsStore.getState().setScenarioOverride('baby', { motionSensitivity: 60 });
  openSetup('/setup/?again=1');
  await act(async () => {});
  await turnOn();
  await screen.findByRole('heading', { level: 1, name: STEP2 });
  const watched = 100 - useSettingsStore.getState().getEffectiveSettings('baby').motionSensitivity;
  expect(lineAt('Motion')).toBe('40%');
  expect(lineAt('Motion')).toBe(`${watched}%`);
  expect(lineAt('Sound')).toBe('5%');
  chooseUse('A pet');
  expect(lineAt('Motion')).toBe('10%');
  await pressLastKey();
  expect(useSettingsStore.getState().scenarioOverrides.baby).toEqual(expect.objectContaining({ motionSensitivity: 60 }));
});

it('ends every track on Back from step 2 and shows step 1', async () => {
  openSetup('/setup/');
  await act(async () => {});
  await turnOn();
  await screen.findByRole('heading', { level: 1, name: STEP2 });
  fireEvent.click(screen.getByRole('link', { name: 'Back' }));
  await act(async () => {});
  expect(camera.video.stop).toHaveBeenCalled();
  expect(camera.audio.stop).toHaveBeenCalled();
  expect(h1()).toBe(STEP1);
});

it('ends every track before the destination opens', async () => {
  openSetup('/setup/');
  await act(async () => {});
  await turnOn();
  await screen.findByRole('heading', { level: 1, name: STEP2 });
  chooseUse('A pet');
  await pressLastKey();
  expect(camera.video.stop).toHaveBeenCalled();
  expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  expect(camera.video.stop.mock.invocationCallOrder[0]).toBeLessThan(mockRouter.replace.mock.invocationCallOrder[0]);
});

it.each([['Back on step 2'], ['the browser’s back button'], ['the last key']])(
  'a camera answer that arrives after %s is closed and keeps nothing',
  async (way) => {
    openSetup('/setup/');
    await act(async () => {});
    await continueWithoutCamera();
    if (way === 'the last key') chooseUse('A pet');
    const answer = heldCamera();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on the camera' }));
    await act(async () => {});
    if (way === 'Back on step 2') {
      fireEvent.click(screen.getByRole('link', { name: 'Back' }));
    } else if (way === 'the last key') {
      await pressLastKey();
    } else {
      act(() => {
        window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
      });
    }
    await act(async () => {});
    await act(async () => {
      answer.allow();
    });
    await act(async () => {});
    expect(camera.video.stop).toHaveBeenCalled();
    expect(camera.audio.stop).toHaveBeenCalled();
    expect(useOnboardingStore.getState().cameraPermissionGranted).toBe(false);
    if (way === 'the last key') {
      expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    } else {
      expect(h1()).toBe(STEP1);
      expect(screen.queryByRole('heading', { name: STEP2 })).toBeNull();
    }
  }
);

it("shows step 2 with the camera off after the browser's back and forward buttons", async () => {
  openSetup('/setup/');
  await act(async () => {});
  await turnOn();
  await screen.findByRole('heading', { level: 1, name: STEP2 });
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  });
  await act(async () => {});
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state: { setupStep: 2 } }));
  });
  await act(async () => {});
  expect(camera.video.stop).toHaveBeenCalled();
  expect(camera.audio.stop).toHaveBeenCalled();
  expect(h1()).toBe(STEP2);
  expect(setupWords()).toContain(OFF);
});

it.each([
  ['', 'hybrid', false],
  ['https://server.example', 'local', false],
  ['https://server.example', 'hybrid', true],
  ['https://server.example', 'ai_enhanced', true],
] as Array<[string, ProcessingMode, boolean]>)(
  'says the picture goes to a server saved as %s only while the setting processes there (%s)',
  async (apiUrl, mode, sends) => {
    expect(sendsToServer(apiUrl, mode)).toBe(sends);
    mockBackend.config = { ...BLANK_CONFIG, apiUrl, configured: apiUrl !== '' };
    if (mode !== useSettingsStore.getState().globalSettings.processingMode) {
      useSettingsStore.getState().updateGlobalSettings({ processingMode: mode });
    }
    openSetup('/setup/');
    await act(async () => {});
    if (sends) {
      expect(setupWords()).toContain(SERVER_LINE);
      expect(setupWords()).not.toContain(STAYS_LINE);
    } else {
      expect(setupWords()).toContain(STAYS_LINE);
      expect(setupWords()).not.toContain(SERVER_LINE);
    }
  }
);
