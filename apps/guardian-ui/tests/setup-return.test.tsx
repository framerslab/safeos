/** @jest-environment jsdom */
/**
 * Where setup ends
 *
 * A row of the dashboard opens setup with its way named in the address
 * (/setup/?next=lost-found). Setup's last key names where its press goes,
 * that way's page or the dashboard, and opens it once; any other value names
 * no way. A device whose setup is done goes on to the way named. Choosing a
 * use applies the Motion and sound setting it stands for, unless it is the
 * use this device has already, so a second run keeps a person's own setting.
 * The camera step and the use step name the two pages as the app names them,
 * and the uses name a place the device can watch, a yard as well as a room.
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import SetupPage from '@/app/setup/page';
import { canSkipOnboarding, useOnboardingStore } from '@/stores/onboarding-store';
import { useSettingsStore } from '@/stores/settings-store';
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
  useSettingsStore.getState().resetToDefaults();
  mockRouter.push.mockClear();
  installCameraBrowser();
});
afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

/** Opens setup at `address`, once the page has read it. */
async function open(address: string) {
  window.history.replaceState({}, '', address);
  render(<SetupPage />);
  await act(async () => {});
}

/** Through the first two steps to the use step. */
function toUseStep() {
  fireEvent.click(screen.getByRole('button', { name: /Begin Setup/ }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /Accept & Continue/ }));
}

/**
 * Through setup's steps to its last: the notice, the use given, the camera
 * step left with no request, and the notification step. Returns the last
 * step's key, whatever it reads.
 */
async function toLastStep(use: RegExp = /Pet/): Promise<HTMLElement> {
  toUseStep();
  fireEvent.click(screen.getByRole('button', { name: use }));
  fireEvent.click(await screen.findByRole('button', { name: 'Continue without the camera' }));
  fireEvent.click(await screen.findByRole('button', { name: /Enable & Continue/ }));
  const done = await screen.findByRole('heading', { name: 'Setup Complete' });
  return within(done.closest('.panel') as HTMLElement).getByRole('button');
}

async function press(key: HTMLElement) {
  fireEvent.click(key);
  await act(async () => {});
}

const pushed = () => mockRouter.push.mock.calls.map(([to]) => to);

it('names the dashboard on its last key and opens it once', async () => {
  await open('/setup/');
  await toLastStep();
  const key = await screen.findByRole('button', { name: 'Open dashboard' });
  expect(screen.queryByRole('button', { name: /Launch Dashboard/ })).toBeNull();
  await press(key);
  expect(pushed()).toEqual(['/dashboard']);
  expect(canSkipOnboarding(useOnboardingStore.getState())).toBe(true);
});

it.each([
  ['monitor', 'Open Motion and sound', '/monitor/'],
  ['lost-found', 'Open Lost and Found', '/lost-found/'],
  ['security', 'Open People', '/security/'],
  ['wildlife', 'Open Wildlife', '/wildlife/'],
])('names the way %s that opened setup on its last key, and opens its page once', async (way, name, address) => {
  await open(`/setup/?next=${way}`);
  await toLastStep();
  await press(await screen.findByRole('button', { name }));
  expect(pushed()).toEqual([address]);
});

it('takes any other value as no way', async () => {
  for (const address of ['/setup/?next=nap', '/setup/?next=Monitor']) {
    await open(address);
    await toLastStep();
    expect(await screen.findByRole('button', { name: 'Open dashboard' })).toBeTruthy();
    cleanup();
    useOnboardingStore.getState().reset();
  }
});

it('sends a device whose setup is done on to the way named, or to the dashboard', async () => {
  finishSetup();
  await open('/setup/?next=wildlife');
  expect(mockRouter.push).toHaveBeenCalledWith('/wildlife/');

  cleanup();
  mockRouter.push.mockClear();
  await open('/setup/');
  expect(mockRouter.push).toHaveBeenCalledWith('/dashboard');
});

it('running setup again keeps the way named', async () => {
  finishSetup();
  await open('/setup/?again=1&next=security');
  expect(mockRouter.push).not.toHaveBeenCalled();
  await toLastStep();
  await press(await screen.findByRole('button', { name: 'Open People' }));
  expect(pushed()).toEqual(['/security/']);
});

it.each([
  ['Baby', 'infant_sleep', 98],
  ['Pet', 'pet_sleep', 90],
  ['Elderly', 'maximum', 80],
  ['Security', 'night', 40],
])('choosing the %s use applies its Motion and sound setting', async (use, preset, motion) => {
  await open('/setup/');
  toUseStep();
  fireEvent.click(screen.getByRole('button', { name: new RegExp(use) }));
  await act(async () => {});
  const settings = useSettingsStore.getState();
  expect(settings.activePresetId).toBe(preset);
  expect(settings.globalSettings.motionSensitivity).toBe(motion);
  expect(settings.globalMute).toBe(false);
  expect(settings.globalSettings.alertVolume).toBeGreaterThan(0);
});

it("a second run applies a different use's setting at its last step, and keeps the person's own setting for the same use", async () => {
  finishSetup();
  useSettingsStore.getState().updateGlobalSettings({ motionSensitivity: 33 });

  await open('/setup/?again=1');
  await press(await toLastStep(/Pet/));
  expect(useSettingsStore.getState().globalSettings.motionSensitivity).toBe(33);

  cleanup();
  await open('/setup/?again=1');
  const key = await toLastStep(/Elderly/);
  expect(useSettingsStore.getState().globalSettings.motionSensitivity).toBe(33);
  await press(key);
  expect(useSettingsStore.getState().globalSettings.motionSensitivity).toBe(80);
  expect(useSettingsStore.getState().activePresetId).toBe('maximum');
});

it('names the two pages as they are named', async () => {
  await open('/setup/');
  toUseStep();
  const emptyPlace = screen.getByRole('button', { name: /Security Mode/ });
  expect(emptyPlace.textContent).toContain('The People page counts the people in view.');
  expect(document.body.textContent).not.toMatch(/The Security page|on the Monitor page/);

  fireEvent.click(screen.getByRole('button', { name: /Pet Monitoring/ }));
  await screen.findByRole('heading', { name: /Device Access/ });
  expect(screen.getByText('You can allow the camera later, on the Motion and sound page.').tagName).toBe('P');
  expect(document.body.textContent).not.toMatch(/The Security page|on the Monitor page/);
});

it('names a place a use can watch, a yard as well as a room', async () => {
  await open('/setup/');
  toUseStep();
  expect(screen.getByRole('button', { name: /Pet Monitoring/ }).textContent)
    .toContain('Motion and sound alerts while your pet is in another room or in the yard');
  expect(screen.getByRole('button', { name: /Security Mode/ }).textContent)
    .toContain('Motion and sound alerts while the place is empty.');
  expect(document.body.textContent).not.toMatch(/the room is empty|in another room(?! or in the yard)/);
});
