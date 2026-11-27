/**
 * Setup on its route, walked through the page's own keys: the address
 * opened, a device whose setup is done, step 1 left by Continue without the
 * camera, an answer chosen by its name and the last key pressed. The mocks
 * each file needs (the router, the server's address, a window's storage)
 * stand in that file.
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import SetupPage from '@/app/setup/page';
import type { SetupUse } from '@/lib/setup-steps';
import { useOnboardingStore } from '@/stores/onboarding-store';

/** Opens setup at `address`, as the browser shows it. */
export function openSetup(address: string) {
  window.history.replaceState(null, '', address);
  return render(<SetupPage />);
}

/** A device whose setup is done with `use`, and Lost and Found chosen where `lostFound`. */
export function finishedSetup(use: SetupUse, lostFound = false) {
  useOnboardingStore.setState({
    isComplete: true,
    selectedScenario: use,
    lostFoundChosen: lostFound,
    acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
    cameraPermissionGranted: true,
    microphonePermissionGranted: true,
  });
}

/** Step 1 left by Continue without the camera; resolves once step 2's heading shows. */
export async function continueWithoutCamera() {
  fireEvent.click(screen.getByRole('button', { name: 'Continue without the camera' }));
  await act(async () => {});
  return screen.findByRole('heading', { level: 1, name: 'What is it watching?' });
}

/** A press on the answer of that name. */
export function chooseUse(name: string) {
  fireEvent.click(screen.getByRole('radio', { name }));
}

/**
 * A press on the last key, whatever it reads, and the browser's return to
 * step 1's entry that a press on step 2 makes before the page opens (jsdom
 * moves through its history after a timer).
 */
export async function pressLastKey() {
  const key = document.querySelector('.setup-last button') as HTMLButtonElement | null;
  if (!key) throw new Error('setup shows no last key');
  fireEvent.click(key);
  await act(async () => {});
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}
