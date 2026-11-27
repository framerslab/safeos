/**
 * Setup's step in the browser's history
 *
 * Each step is its own entry on the same address: going on to step 2 pushes
 * an entry, the browser's back button and Back on step 2 return to step 1,
 * the forward button returns to step 2, and a reload of step 2's entry opens
 * step 1. The address keeps its query, since the entry is pushed on the
 * address the page shows. The page setup opens at its end takes the place of
 * step 1's entry, so the browser's back button on that page never returns to
 * setup.
 *
 * @module lib/setup-history
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

export type StepNumber = 1 | 2;

/** True from setup's last press on step 2 until the browser is back on step 1's entry. */
let leaving = false;

/** How long a browser may take to return to step 1's entry before the page opens all the same. */
const RETURN_MS = 1000;

/**
 * Opens the page setup ends on, through `open`, in place of setup's entries:
 * on step 2's entry the browser first returns to step 1's, and the step shown
 * stays as it is meanwhile; then `open` replaces that entry. On step 1's entry
 * `open` runs at once.
 */
export function leaveSetup(open: () => void): void {
  const state = window.history.state as { setupStep?: unknown } | null;
  if (state?.setupStep !== 2) {
    open();
    return;
  }
  leaving = true;
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const opened = () => {
    if (done) return;
    done = true;
    window.removeEventListener('popstate', opened);
    if (timer !== undefined) clearTimeout(timer);
    leaving = false;
    open();
  };
  window.addEventListener('popstate', opened);
  timer = setTimeout(opened, RETURN_MS);
  window.history.back();
}

/**
 * The step setup shows, each its own entry in the browser's history on the
 * same address: toStep2 pushes an entry, the browser's back button and
 * backToStep1 return to step 1, forward returns to step 2, and a reload of
 * step 2's entry opens step 1. `entered` is 'change' once the step has
 * changed in this page's life.
 */
export function useSetupStep(): { step: StepNumber; entered: 'first' | 'change'; toStep2: () => void; backToStep1: () => void } {
  const [step, setStep] = useState<StepNumber>(1);
  const [entered, setEntered] = useState<'first' | 'change'>('first');

  useEffect(() => {
    // A reload of step 2's entry opens step 1, and its entry says so.
    const kept = window.history.state as { setupStep?: unknown } | null;
    if (kept?.setupStep === 2) window.history.replaceState({ ...kept, setupStep: 1 }, '');

    const moved = (event: PopStateEvent) => {
      // The return to step 1's entry that the last key makes leaves the step shown as it is.
      if (leaving) return;
      const state = event.state as { setupStep?: unknown } | null;
      setStep(state?.setupStep === 2 ? 2 : 1);
      setEntered('change');
    };
    window.addEventListener('popstate', moved);
    return () => window.removeEventListener('popstate', moved);
  }, []);

  const toStep2 = useCallback(() => {
    window.history.pushState({ setupStep: 2 }, '', window.location.href);
    setStep(2);
    setEntered('change');
  }, []);

  const backToStep1 = useCallback(() => {
    window.history.back();
  }, []);

  return { step, entered, toStep2, backToStep1 };
}
