/** @jest-environment jsdom */
/**
 * Setup's words
 *
 * In every state of its two steps, reached through the page's own keys,
 * setup shows its own words and no other: the alert sounds on this device,
 * setup asks for no account and offers nothing it does not build, and no
 * word beside an answer or a sighting says a finding is certain.
 */

import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { BABY_STATEMENT, LOST_PET_WORDS } from '@/components/setup/UseChoice';
import { NEEDS_SCRIPT } from '@/lib/needs-script';
import { FAILURE_WORDS } from '@/lib/setup-camera';
import { useStorageEnds } from '@/lib/short-lived-storage';
import { forgetStorageFull } from '@/lib/storage-full';
import { forgetVisit } from '@/lib/visit-store';
import { useCameraStore } from '@/stores/camera-store';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useSettingsStore } from '@/stores/settings-store';
import { installCameraBrowser } from './helpers/camera-browser';
import { chooseUse, continueWithoutCamera, openSetup, pressLastKey } from './helpers/setup-route';

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

const plain = (text: string) => text.replace(/’/g, "'").replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const words = (element: Element | null | undefined) => plain(element?.textContent || '');

/** Every phrase setup may show, as a reader takes it. */
const PHRASES = [
  // The frame.
  'Back',
  'Skip to content',
  'Switch to the dark look',
  'Switch to the light look',
  'Step 1 of 2',
  'Step 2 of 2',
  'Dark look on',
  'Light look on',
  // Step 1.
  'Use this device to watch a place',
  'SafeOS watches with the camera and microphone and sounds an alert here when something moves, makes a sound or, for a lost pet, when its colours come into view.',
  'Turn on the camera',
  'Your browser will ask you to allow the camera and microphone.',
  'Waiting for your answer…',
  'Continue without the camera',
  'SafeOS adds an alert. It does not replace a person nearby. A phone or a browser can sleep, lose power or drop the camera, so stay within reach.',
  'The picture stays on this device.',
  'This device sends the picture to your own server while it watches.',
  'This browser forgets SafeOS when the window closes. Your settings and alerts last for this visit.',
  // The failures.
  ...Object.values(FAILURE_WORDS),
  'Try again',
  'How to allow the camera',
  'Use the default camera',
  // The place and its test.
  'What is it watching?',
  'Live picture from this device’s camera',
  'Motion',
  'Sound',
  'Alert',
  'No alert',
  'below its line',
  'at its line or past it',
  'no alert for this use',
  'Prop this device where it sees the spot to watch, plugged in. Wave or clap to test it. While SafeOS watches, a bar past its line sounds an alert on this device.',
  'Starting the camera…',
  'The camera is off. SafeOS cannot watch until you turn it on.',
  'The camera stopped. Check the device, then press Try again.',
  'No microphone found. SafeOS watches for movement only.',
  'Motion reached its line.',
  'Sound reached its line.',
  // The answers.
  'A pet',
  'A baby',
  'An elderly relative',
  'An empty place',
  'A lost pet',
  'SafeOS sounds an alert here when your pet moves. History lists each alert with its time, for when you get back.',
  'For a nap while you stay close enough to hear this device.',
  BABY_STATEMENT,
  'Safe-sleep guidance from the NIH',
  'Keep this device and its cord at least 3 feet (1 metre) from the crib.',
  'Cord safety from the CPSC',
  'SafeOS sounds an alert here when they move or make a sound, and, if you set a time in Settings, when nothing moves for that long.',
  'Ask before you watch or listen to another adult. Laws on recording sound differ by place.',
  'SafeOS sounds an alert here when anything moves in the picture or this device hears a sound. Point it at a room, a doorway or a yard.',
  LOST_PET_WORDS,
  'Choose what this device is watching.',
  // The last key.
  'Open dashboard',
  'Open Motion and sound',
  'Open Lost and Found',
  'Open People',
  'Open Wildlife',
  'Opening the dashboard…',
  'Opening Motion and sound…',
  'Opening Lost and Found…',
  'Opening People…',
  'Opening Wildlife…',
  'This browser did not save setup. SafeOS works for this visit and asks for setup again next time.',
  NEEDS_SCRIPT,
  ', opens in a new tab',
]
  .map(plain)
  .sort((a, b) => b.length - a.length);

const named = (name: string) => Object.assign(new Error(name), { name });

/** The camera's permission as the browser reports it. */
function cameraPermission(state: PermissionState) {
  const status = { state, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined };
  const other = { state: 'prompt', onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined };
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: jest.fn(async ({ name }: { name: string }) => (name === 'camera' ? status : other)) },
  });
}

const settle = async () => {
  await act(async () => {});
  await act(async () => {});
};

async function step1() {
  openSetup('/setup/');
  await settle();
}

async function pressTurnOn() {
  fireEvent.click(screen.getByRole('button', { name: 'Turn on the camera' }));
  await settle();
}

async function failedWith(name: string) {
  camera.getUserMedia.mockRejectedValue(named(name));
  await step1();
  await pressTurnOn();
}

async function cameraOn() {
  await step1();
  await pressTurnOn();
  await screen.findByRole('heading', { level: 1, name: 'What is it watching?' });
}

async function cameraOff() {
  await step1();
  await continueWithoutCamera();
}

const STATES: Array<[string, () => Promise<void>]> = [
  ['step 1 at rest', step1],
  ['step 1 waiting', async () => {
    camera.getUserMedia.mockReturnValue(new Promise<MediaStream>(() => undefined));
    await step1();
    await pressTurnOn();
  }],
  ['step 1 with the camera blocked', async () => {
    cameraPermission('denied');
    await step1();
  }],
  ['step 1 with the question closed', async () => {
    cameraPermission('prompt');
    await failedWith('NotAllowedError');
  }],
  ['step 1 with the camera in use', () => failedWith('NotReadableError')],
  ['step 1 with no camera', () => failedWith('NotFoundError')],
  ['step 1 with the saved camera gone', async () => {
    useCameraStore.getState().setDeviceId('usb');
    await failedWith('OverconstrainedError');
  }],
  ['step 1 with no camera request', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    await step1();
  }],
  ['step 1 with another failure', () => failedWith('TypeError')],
  ['step 1 in a private window', async () => {
    jest.mocked(useStorageEnds).mockReturnValue(true);
    await step1();
  }],
  ['step 1 with a server saved', async () => {
    mockBackend.config = { ...BLANK_CONFIG, apiUrl: 'https://server.example', configured: true };
    await step1();
  }],
  ['step 2 with the camera on and no use', cameraOn],
  ...(['A pet', 'A baby', 'An elderly relative', 'An empty place', 'A lost pet'].map((name) => [
    `step 2 with ${name} chosen`,
    async () => {
      await cameraOn();
      chooseUse(name);
      await settle();
    },
  ]) as Array<[string, () => Promise<void>]>),
  ['step 2 with the camera off', cameraOff],
  ['step 2 stopped', async () => {
    await cameraOn();
    await act(async () => {
      camera.video.end();
    });
    await settle();
  }],
  ['step 2 with no microphone', async () => {
    camera.getUserMedia.mockRejectedValueOnce(named('NotFoundError')).mockResolvedValueOnce(camera.stream);
    await cameraOn();
  }],
  ['step 2 with the blocked failure', async () => {
    await cameraOff();
    camera.getUserMedia.mockRejectedValue(named('NotAllowedError'));
    await pressTurnOn();
  }],
  ['the last key pressed with no use', async () => {
    await cameraOff();
    await pressLastKey();
  }],
  ['the last key with the record refused', async () => {
    await cameraOff();
    chooseUse('A pet');
    jest.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await pressLastKey();
  }],
  ['the last key opening', async () => {
    await cameraOff();
    chooseUse('A pet');
    await pressLastKey();
  }],
];

it.each(STATES)('says only its own words: %s', async (_state, reach) => {
  await reach();
  const main = document.querySelector('main.setup') as Element;
  expect(main).not.toBeNull();
  const seen = main.cloneNode(true) as Element;
  seen.querySelectorAll('script').forEach((script) => script.remove());
  const all = words(seen);
  let rest = all;
  for (const phrase of PHRASES) rest = rest.split(phrase).join(' ');
  expect(rest.replace(/[\s.,]/g, '')).toBe('');
  expect(all).not.toMatch(
    /your phone|another phone|another device|\baccount|\bsign ?in\b|\blog ?in\b|notification|platform|\bcloud\b|subscription|\bfree\b|\bprice\b|\bmonitor\b|\bAI\b/i
  );
  expect(all).not.toMatch(/\bmatch(es|ed|ing)?\b|detected|identif|recogni[sz]|confidence|%|intruder|threat/i);
});
