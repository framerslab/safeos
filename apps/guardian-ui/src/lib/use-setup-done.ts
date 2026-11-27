/**
 * Whether setup is done on this device
 *
 * Reads the setup state this browser stores. It answers false until script
 * has read the stored state, and false when the state cannot be read, so a
 * start key reads "Start setup" before script runs and after a failed read.
 * `useSetupState` answers null until then, for a page that holds its place
 * while it reads. `useSavedUse` and `useSavedLostFound` answer undefined
 * until then, for setup's answers, which show none chosen until the record
 * is read.
 *
 * @module lib/use-setup-done
 */

'use client';

import { useEffect, useState } from 'react';
import { useOnboardingStore, canSkipOnboarding } from '@/stores/onboarding-store';
import type { SetupUse } from './setup-steps';

/** null until script has read this device's setup record; false before setup and when the record cannot be read. */
export function useSetupState(): boolean | null {
  const onboarding = useOnboardingStore();
  const [read, setRead] = useState(false);

  useEffect(() => {
    setRead(true);
  }, []);

  if (!read) return null;
  try {
    return canSkipOnboarding(onboarding);
  } catch {
    return false;
  }
}

export function useSetupDone(): boolean {
  return useSetupState() === true;
}

/** True once script has read this device's setup record; false on the first render. */
function useRecordRead(): boolean {
  const [read, setRead] = useState(false);
  useEffect(() => {
    setRead(true);
  }, []);
  return read;
}

/** undefined until script has read this device's setup record; then the use it holds, or null. */
export function useSavedUse(): SetupUse | null | undefined {
  const read = useRecordRead();
  if (!read) return undefined;
  try {
    return useOnboardingStore.getState().selectedScenario ?? null;
  } catch {
    return null;
  }
}

/** undefined until script has read this device's setup record; then whether Lost and Found is its saved choice. */
export function useSavedLostFound(): boolean | undefined {
  const read = useRecordRead();
  if (!read) return undefined;
  try {
    return useOnboardingStore.getState().lostFoundChosen === true;
  } catch {
    return false;
  }
}
