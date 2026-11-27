/** @jest-environment jsdom */
/**
 * Where setup's last key goes
 *
 * The last key names the page it opens: the dashboard, or the way whose row
 * on the dashboard opened setup (/setup/?next=<way>), and opens it once, in
 * place of setup in the browser's history. The answer the address names is
 * shown chosen on a new device, and a use the device holds wins over it. A
 * use's Motion and sound setting is applied at its press on a first setup
 * and at the last key on a run again. A press with no use, or a record the
 * browser will not keep, is named beside the key.
 */

import { act, cleanup, screen } from '@testing-library/react';
import { useStorageEnds } from '@/lib/short-lived-storage';
import { forgetStorageFull } from '@/lib/storage-full';
import { forgetVisit } from '@/lib/visit-store';
import { useCameraStore } from '@/stores/camera-store';
import { canSkipOnboarding, useOnboardingStore } from '@/stores/onboarding-store';
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

beforeEach(() => {
  mockBackend.config = { ...BLANK_CONFIG };
  jest.mocked(useStorageEnds).mockReturnValue(false);
  if (permissionsAtStart) Object.defineProperty(navigator, 'permissions', permissionsAtStart);
  else delete (navigator as unknown as { permissions?: unknown }).permissions;
  localStorage.clear();
  useOnboardingStore.getState().reset();
  useSettingsStore.getState().resetToDefaults();
  useCameraStore.getState().setDeviceId('');
  installCameraBrowser();
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

const words = (element: Element | null | undefined) =>
  (element?.textContent || '').replace(/’/g, "'").replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const lastKey = () => document.querySelector('.setup-last button') as HTMLButtonElement;
const checked = (name: string) => (screen.getByRole('radio', { name }) as HTMLInputElement).checked;
const checkedNames = () =>
  (screen.getAllByRole('radio') as HTMLInputElement[]).filter((radio) => radio.checked).map((radio) => radio.value);

async function opened(address: string) {
  const shown = openSetup(address);
  await act(async () => {});
  await continueWithoutCamera();
  return shown;
}

it('names the dashboard on its last key and opens it once, in place of setup', async () => {
  await opened('/setup/');
  chooseUse('A pet');
  expect(screen.getByRole('button', { name: 'Open dashboard' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Launch Dashboard/ })).toBeNull();
  await pressLastKey();
  expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).toHaveBeenCalledWith('/dashboard');
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(canSkipOnboarding(useOnboardingStore.getState())).toBe(true);
});

it.each([
  ['monitor', 'Open Motion and sound', '/monitor/'],
  ['lost-found', 'Open Lost and Found', '/lost-found/'],
  ['security', 'Open People', '/security/'],
  ['wildlife', 'Open Wildlife', '/wildlife/'],
])('names the way %s that opened setup on its last key, and opens its page once', async (id, name, href) => {
  await opened(`/setup/?next=${id}`);
  chooseUse('A pet');
  expect(words(lastKey())).toBe(name);
  await pressLastKey();
  expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).toHaveBeenCalledWith(href);
});

it('takes any other value as no way', async () => {
  for (const address of ['/setup/?next=nap', '/setup/?next=Monitor']) {
    await opened(address);
    chooseUse('A pet');
    expect(words(lastKey())).toBe('Open dashboard');
    cleanup();
  }
});

it('sends a device whose setup is done on to the way named', async () => {
  finishedSetup('pet');
  openSetup('/setup/?next=wildlife');
  await act(async () => {});
  expect(mockRouter.replace).toHaveBeenCalledWith('/wildlife/');
});

it('running setup again keeps the way named', async () => {
  finishedSetup('pet');
  openSetup('/setup/?again=1&next=security');
  await act(async () => {});
  expect(mockRouter.replace).not.toHaveBeenCalled();
  await continueWithoutCamera();
  expect(words(lastKey())).toBe('Open People');
});

it("chooses A lost pet for Lost and Found's row and An empty place for People's, and none for the others", async () => {
  await opened('/setup/?next=lost-found');
  expect(checked('A lost pet')).toBe(true);
  expect(checked('A pet')).toBe(false);
  expect(words(lastKey())).toBe('Open Lost and Found');
  expect(useOnboardingStore.getState().selectedScenario).toBeNull();
  expect(useOnboardingStore.getState().lostFoundChosen).toBe(false);
  cleanup();

  await opened('/setup/?next=security');
  expect(checked('An empty place')).toBe(true);
  cleanup();

  for (const address of ['/setup/?next=monitor', '/setup/?next=wildlife', '/setup/']) {
    await opened(address);
    expect(checkedNames()).toEqual([]);
    cleanup();
  }
});

it('keeps a use held on the device whatever the address names', async () => {
  useOnboardingStore.setState({ selectedScenario: 'pet' });
  await opened('/setup/?next=security');
  expect(checked('A pet')).toBe(true);
  expect(words(lastKey())).toBe('Open People');
  expect(useOnboardingStore.getState().selectedScenario).toBe('pet');
  expect(useSettingsStore.getState().activePresetId).toBe('maximum');
});

it.each([
  ['A baby', 'infant_sleep', 98],
  ['A pet', 'pet_sleep', 90],
  ['An elderly relative', 'maximum', 80],
  ['An empty place', 'night', 40],
  ['A lost pet', 'pet_sleep', 90],
])('choosing %s on a first setup applies its Motion and sound setting at once', async (name, preset, motion) => {
  await opened('/setup/');
  chooseUse(name);
  const settings = useSettingsStore.getState();
  expect(settings.activePresetId).toBe(preset);
  expect(settings.globalSettings.motionSensitivity).toBe(motion);
  expect(settings.globalMute).toBe(false);
  expect(settings.globalSettings.alertVolume).toBeGreaterThan(0);
});

it('a run again applies another use\'s setting at the last key and keeps a tuned setting for the same use', async () => {
  finishedSetup('pet');
  useSettingsStore.getState().setActivePreset('pet_sleep');
  useSettingsStore.getState().updateGlobalSettings({ motionSensitivity: 33 });

  await opened('/setup/?again=1');
  expect(checked('A pet')).toBe(true);
  await pressLastKey();
  expect(useSettingsStore.getState().globalSettings.motionSensitivity).toBe(33);
  cleanup();

  await opened('/setup/?again=1');
  chooseUse('An elderly relative');
  expect(useSettingsStore.getState().globalSettings.motionSensitivity).toBe(33);
  await pressLastKey();
  expect(useSettingsStore.getState().globalSettings.motionSensitivity).toBe(80);
  expect(useSettingsStore.getState().activePresetId).toBe('maximum');
});

it('names what is missing when the last key is pressed with no use', async () => {
  await opened('/setup/');
  await pressLastKey();
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(words(document.querySelector('.setup-use-says'))).toBe('Choose what this device is watching.');
  expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'A pet' }));
});

it('names what was not saved and opens the destination on a second press', async () => {
  await opened('/setup/');
  chooseUse('A pet');
  jest.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new DOMException('full', 'QuotaExceededError');
  });
  await pressLastKey();
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(words(document.querySelector('.setup-last-says'))).toBe(
    'This browser did not save setup. SafeOS works for this visit and asks for setup again next time.'
  );
  await pressLastKey();
  expect(mockRouter.replace).toHaveBeenCalledTimes(1);
});
