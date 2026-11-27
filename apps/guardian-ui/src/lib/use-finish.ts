/**
 * The last key of setup: a press with no use names what is missing; a press
 * with a use writes setup's record, then ends the camera and opens the
 * dashboard or the way named, in place of setup in the browser's history.
 * When the browser refuses to store the record, the first press says so and
 * the second opens the page for this visit.
 *
 * @module lib/use-finish
 */

'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WAYS, type Way } from './app-routes';
import { finishSetup, type SetupAnswers, type SetupRun } from './setup-answers';
import type { SetupUse } from './setup-steps';

export type LastKeyState = 'rest' | 'opening' | 'unsaved';

export interface FinishOptions {
  answers: SetupAnswers;
  run: SetupRun;
  /** The use this device held when setup opened, read once; null when none. */
  usedBefore: SetupUse | null;
  /** The page the last key names; null opens the dashboard. */
  way: Way | null;
  /** Ends every track of setup's camera; runs before the destination opens. */
  closeCamera: () => void;
  /** A press with no use chosen. */
  onMissingUse: () => void;
  /** A press with a use chosen, before anything is written, so setup sends nobody on by itself. */
  onFinished: () => void;
}

/** Where the last key goes: the way's page, or the dashboard. */
export function finishHref(way: Way | null): string {
  return way ? way.href : '/dashboard';
}

/**
 * The page the last key names and opens: Lost and Found's while A lost pet is
 * the answer chosen, whatever row opened setup; otherwise the way named;
 * otherwise none, which is the dashboard.
 */
export function finishWay(lostFound: boolean, named: Way | null): Way | null {
  if (lostFound) return WAYS.find((way) => way.id === 'lost-found') ?? null;
  return named;
}

/** The last key's press: one write and one page opened, however many presses. */
export function useFinish(options: FinishOptions): { state: LastKeyState; press: () => void } {
  const router = useRouter();
  const [state, setState] = useState<LastKeyState>('rest');
  const stage = useRef<LastKeyState>('rest');
  const latest = useRef(options);
  latest.current = options;

  const press = useCallback(() => {
    if (stage.current === 'opening') return;
    const { answers, run, usedBefore, way, closeCamera, onMissingUse, onFinished } = latest.current;
    if (answers.use === null) {
      onMissingUse();
      return;
    }
    onFinished();
    const took = finishSetup(answers, run, usedBefore);
    if (stage.current === 'rest' && !took) {
      stage.current = 'unsaved';
      setState('unsaved');
      return;
    }
    stage.current = 'opening';
    setState('opening');
    closeCamera();
    router.replace(finishHref(way));
  }, [router]);

  return { state, press };
}
