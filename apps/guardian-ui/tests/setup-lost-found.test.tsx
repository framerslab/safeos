/** @jest-environment jsdom */
/**
 * A lost pet in setup. The question of what the device is watching offers A
 * lost pet beside the four uses. It watches with Lost and Found, which
 * compares the camera's picture with a pet's photos, so choosing it saves the
 * pet use and Lost and Found as chosen, and the last key reads Open Lost and
 * Found and opens that page, where the photos are added, whatever row opened
 * setup. The watch's Watch for keeps the same choice, so setup shows the one
 * the watch last had, over the use the device holds.
 */

import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { LOST_PET_WORDS } from '@/components/setup/UseChoice';
import { useStorageEnds } from '@/lib/short-lived-storage';
import { forgetStorageFull } from '@/lib/storage-full';
import { forgetVisit } from '@/lib/visit-store';
import { readLastWay, rememberWay } from '@/lib/watch-session';
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
const plain = (text: string) => text.replace(/’/g, "'").replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const lastKey = () => document.querySelector('.setup-last button') as HTMLButtonElement;
const checked = (name: string) => (screen.getByRole('radio', { name }) as HTMLInputElement).checked;
const lineAt = (meter: 'Motion' | 'Sound') =>
  (screen.getByRole('meter', { name: meter }).querySelector('.setup-track__line') as HTMLElement | null)?.style.left ?? null;

async function opened(address: string) {
  const shown = openSetup(address);
  await act(async () => {});
  await continueWithoutCamera();
  return shown;
}

async function openedWithCamera(address: string) {
  openSetup(address);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Turn on the camera' }));
  await act(async () => {});
  await act(async () => {});
  await screen.findByRole('heading', { level: 1, name: 'What is it watching?' });
}

it('offers A lost pet as the fifth answer', async () => {
  await opened('/setup/');
  const radios = screen.getAllByRole('radio') as HTMLInputElement[];
  expect(radios).toHaveLength(5);
  expect(radios.map((radio) => words(radio.closest('label')))).toEqual(['A pet', 'A baby', 'An elderly relative', 'An empty place', 'A lost pet']);
  expect(radios.filter((radio) => radio.checked)).toEqual([]);
  expect(screen.queryByRole('button', { name: /Lost & Found/ })).toBeNull();
});

it('saves the pet use and Lost and Found as chosen at the press, and its last key opens the Lost and Found page', async () => {
  await opened('/setup/');
  chooseUse('A lost pet');
  expect(words(document.getElementById('setup-use-words'))).toBe(plain(LOST_PET_WORDS));
  const saved = useOnboardingStore.getState();
  expect(saved.selectedScenario).toBe('pet');
  expect(saved.lostFoundChosen).toBe(true);
  expect(useSettingsStore.getState().activePresetId).toBe('pet_sleep');
  expect(readLastWay()).toBeNull();
  expect(words(lastKey())).toBe('Open Lost and Found');
  await pressLastKey();
  expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).toHaveBeenCalledWith('/lost-found/');
  expect(useOnboardingStore.getState().isComplete).toBe(true);
  expect(readLastWay()).toEqual({ way: 'lost-found' });
});

it("draws A pet's lines with A lost pet chosen: no Sound line and No alert", async () => {
  await openedWithCamera('/setup/');
  chooseUse('A lost pet');
  expect(lineAt('Motion')).toBe('10%');
  const sound = screen.getByRole('meter', { name: 'Sound' });
  expect(sound.querySelector('.setup-track__line')).toBeNull();
  expect(words(sound.closest('.setup-meter')?.querySelector('.setup-meter__label'))).toContain('No alert');
});

it('opens the Lost and Found page whatever row opened setup', async () => {
  await opened('/setup/?next=wildlife');
  chooseUse('A lost pet');
  expect(words(lastKey())).toBe('Open Lost and Found');
  await pressLastKey();
  expect(mockRouter.replace).toHaveBeenCalledWith('/lost-found/');
});

it('another answer sets Lost and Found as not chosen', async () => {
  await opened('/setup/');
  chooseUse('A lost pet');
  chooseUse('A baby');
  const saved = useOnboardingStore.getState();
  expect(saved.selectedScenario).toBe('baby');
  expect(saved.lostFoundChosen).toBe(false);
  expect(useSettingsStore.getState().activePresetId).toBe('infant_sleep');
  expect(words(lastKey())).toBe('Open dashboard');
});

it('shows A lost pet chosen on a run again whose saved choice is Lost and Found, and ends on its page again', async () => {
  finishedSetup('pet', true);
  await opened('/setup/?again=1');
  expect(checked('A lost pet')).toBe(true);
  expect(checked('A pet')).toBe(false);
  await pressLastKey();
  expect(mockRouter.replace).toHaveBeenCalledWith('/lost-found/');
  const saved = useOnboardingStore.getState();
  expect(saved.selectedScenario).toBe('pet');
  expect(saved.lostFoundChosen).toBe(true);
});

it("keeps a baby device's use when A lost pet is shown chosen from the watch", async () => {
  finishedSetup('baby', true);
  useSettingsStore.getState().setActivePreset('infant_sleep');
  await openedWithCamera('/setup/?again=1');
  expect(checked('A lost pet')).toBe(true);
  expect(checked('A baby')).toBe(false);
  expect(lineAt('Sound')).toBe('5%');
  await pressLastKey();
  expect(mockRouter.replace).toHaveBeenCalledWith('/lost-found/');
  const saved = useOnboardingStore.getState();
  expect(saved.selectedScenario).toBe('baby');
  expect(saved.lostFoundChosen).toBe(true);
  expect(useSettingsStore.getState().activePresetId).toBe('infant_sleep');
});

it('shows the use again once the watch chose Motion and sound', async () => {
  finishedSetup('baby', true);
  useOnboardingStore.getState().setLostFoundChosen(false);
  await opened('/setup/?again=1');
  expect(checked('A baby')).toBe(true);
  expect(checked('A lost pet')).toBe(false);
  expect(words(lastKey())).toBe('Open dashboard');
});

it('keeps the saved choice when a run again is left part way', async () => {
  finishedSetup('pet', true);
  const { unmount } = await opened('/setup/?again=1');
  chooseUse('A baby');
  unmount();
  const saved = useOnboardingStore.getState();
  expect(saved.selectedScenario).toBe('pet');
  expect(saved.lostFoundChosen).toBe(true);
});

it('a press on A lost pet from another answer on a run again saves the pet use at the last key', async () => {
  finishedSetup('baby');
  useSettingsStore.getState().setActivePreset('infant_sleep');
  await opened('/setup/?again=1');
  chooseUse('A lost pet');
  expect(useOnboardingStore.getState().selectedScenario).toBe('baby');
  expect(useSettingsStore.getState().activePresetId).toBe('infant_sleep');
  await pressLastKey();
  const saved = useOnboardingStore.getState();
  expect(saved.selectedScenario).toBe('pet');
  expect(useSettingsStore.getState().activePresetId).toBe('pet_sleep');
  expect(saved.lostFoundChosen).toBe(true);
  expect(mockRouter.replace).toHaveBeenCalledWith('/lost-found/');
});

it("takes back the dashboard's Lost and Found start when a later run ends on another answer", async () => {
  finishedSetup('pet', true);
  rememberWay('lost-found');
  await opened('/setup/?again=1');
  chooseUse('A baby');
  await pressLastKey();
  expect(readLastWay()).toEqual({ way: 'monitor' });
  const saved = useOnboardingStore.getState();
  expect(saved.selectedScenario).toBe('baby');
  expect(saved.lostFoundChosen).toBe(false);
});
