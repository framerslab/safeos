/**
 * Setup's answers
 *
 * The answers setup keeps on the page while it runs, and what a press
 * writes. A first setup writes each answer at its press, straight to this
 * device's stores. A refused write throws nothing: the answers stay on the
 * page for the visit. No press writes the way the dashboard's start reads;
 * only the last key does.
 *
 * @module lib/setup-answers
 */

import type { SetupUse } from './setup-steps';
import { useOnboardingStore } from '@/stores/onboarding-store';

export interface SetupAnswers {
  /** The statement stood on step 1 when a key there was pressed. */
  statement: boolean;
  use: SetupUse | null;
  camera: boolean | null;
  microphone: boolean | null;
  /** Use the default camera was pressed. */
  defaultCamera: boolean;
  /** A lost pet is the answer chosen; `use` is the use it stands on. */
  lostFound: boolean;
}

export const NO_ANSWERS: SetupAnswers = {
  statement: false,
  use: null,
  camera: null,
  microphone: null,
  defaultCamera: false,
  lostFound: false,
};

function tried(write: () => void): boolean {
  try {
    write();
    return true;
  } catch {
    return false;
  }
}

/**
 * Writes the answers a press gives straight to this device's stores, as a
 * first setup does at each press. A refused write throws nothing; the
 * answers stay on the page for the visit. True when every write took.
 */
export function writeNow(patch: Partial<SetupAnswers>): boolean {
  const store = useOnboardingStore.getState();
  let took = true;
  if (patch.statement) took = tried(() => store.recordStatement()) && took;
  if (typeof patch.camera === 'boolean') {
    const camera = patch.camera;
    took = tried(() => store.setCameraPermission(camera)) && took;
  }
  if (typeof patch.microphone === 'boolean') {
    const microphone = patch.microphone;
    took = tried(() => store.setMicrophonePermission(microphone)) && took;
  }
  return took;
}
