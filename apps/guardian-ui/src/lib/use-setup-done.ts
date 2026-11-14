/**
 * Whether setup is done on this device
 *
 * Reads the setup state this browser stores. It answers false until script
 * has read the stored state, and false when the state cannot be read, so a
 * start key reads "Start setup" before script runs and after a failed read.
 *
 * @module lib/use-setup-done
 */

'use client';

import { useEffect, useState } from 'react';
import { useOnboardingStore, canSkipOnboarding } from '@/stores/onboarding-store';

export function useSetupDone(): boolean {
  const onboarding = useOnboardingStore();
  const [read, setRead] = useState(false);

  useEffect(() => {
    setRead(true);
  }, []);

  if (!read) return false;
  try {
    return canSkipOnboarding(onboarding);
  } catch {
    return false;
  }
}
