/**
 * Setup's step in the browser's history
 *
 * Each step is its own entry on the same address: going on to step 2 pushes
 * an entry, the browser's back button and Back on step 2 return to step 1,
 * the forward button returns to step 2, and a reload of step 2's entry opens
 * step 1. The address keeps its query, since the entry is pushed on the
 * address the page shows.
 *
 * @module lib/setup-history
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

export type StepNumber = 1 | 2;

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
