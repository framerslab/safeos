/**
 * Setup's answers
 *
 * The answers setup keeps on the page while it runs, and what a press
 * writes. A first setup writes each answer at its press, straight to this
 * device's stores. A refused write throws nothing: the answers stay on the
 * page for the visit. No press writes the way the dashboard's start reads;
 * only the last key does, and the last key marks setup complete last.
 *
 * @module lib/setup-answers
 */

import type { Way } from './app-routes';
import { USE_SETTING, type SetupChoice, type SetupUse } from './setup-steps';
import { readLastWay, rememberWay } from './watch-session';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useCameraStore } from '@/stores/camera-store';
import { useSettingsStore } from '@/stores/settings-store';

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

/** The answer shown chosen for these answers: A lost pet while `lostFound`, otherwise the use, or none. */
export function chosenOf(answers: Pick<SetupAnswers, 'use' | 'lostFound'>): SetupChoice | null {
  return answers.lostFound ? 'lost_found' : answers.use;
}

/** What a press on an answer gives: the use it saves, and whether Lost and Found is chosen. A lost pet saves the pet use. */
export function answerFor(choice: SetupChoice): Pick<SetupAnswers, 'use' | 'lostFound'> {
  return choice === 'lost_found' ? { use: 'pet', lostFound: true } : { use: choice, lostFound: false };
}

/**
 * The answer shown chosen when step 2 opens. A device whose saved choice is
 * Lost and Found shows A lost pet over the use it holds, which stays (the pet
 * use where it holds none). Otherwise the use this device holds, whatever the
 * address names. Otherwise A lost pet for Lost and Found's row and An empty
 * place for People's. Otherwise none. Page state only: nothing is written
 * until a press or the last key.
 */
export function initialChoice(
  saved: SetupUse | null,
  lostFoundSaved: boolean,
  way: Way | null
): Pick<SetupAnswers, 'use' | 'lostFound'> {
  if (lostFoundSaved) return { use: saved ?? 'pet', lostFound: true };
  if (saved) return { use: saved, lostFound: false };
  if (way?.id === 'lost-found') return answerFor('lost_found');
  if (way?.id === 'security') return answerFor('security');
  return { use: null, lostFound: false };
}

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
 * first setup does at each press: the use's setting when the use differs
 * from the one the device holds, then the use, then the saved choice of Lost
 * and Found where the patch gives one. A refused write throws nothing; the
 * answers stay on the page for the visit. True when every write took.
 */
export function writeNow(patch: Partial<SetupAnswers>): boolean {
  const store = useOnboardingStore.getState();
  let took = true;
  if (patch.statement) took = tried(() => store.recordStatement()) && took;
  const use = patch.use;
  if (use) {
    // The settings store holds a refused write for the visit and throws nothing.
    if (use !== useOnboardingStore.getState().selectedScenario) {
      tried(() => useSettingsStore.getState().setActivePreset(USE_SETTING[use]));
    }
    took = tried(() => useOnboardingStore.getState().setScenario(use)) && took;
  }
  if (typeof patch.lostFound === 'boolean') {
    const lostFound = patch.lostFound;
    took = tried(() => useOnboardingStore.getState().setLostFoundChosen(lostFound)) && took;
  }
  if (typeof patch.camera === 'boolean') {
    const camera = patch.camera;
    took = tried(() => store.setCameraPermission(camera)) && took;
  }
  if (typeof patch.microphone === 'boolean') {
    const microphone = patch.microphone;
    took = tried(() => store.setMicrophonePermission(microphone)) && took;
  }
  if (patch.defaultCamera) took = tried(() => useCameraStore.getState().setDeviceId('')) && took;
  return took;
}

export type SetupRun = 'first' | 'again';

/**
 * What the last key writes, each write through the store's own action and in
 * its own try, so a refused write throws nothing: the statement's two flags
 * with their time on a run again (a first setup wrote them at its step-1
 * press and keeps that time); the use, with its Motion and sound setting only
 * when the use differs from `usedBefore`; the camera and the microphone where
 * answered; the saved camera removed when Use the default camera was pressed;
 * the saved choice of Lost and Found on every run; the way the dashboard's
 * start reads, so the dashboard follows setup's answer until a watch has run:
 * Lost and Found with no pet when a lost pet is the answer, and Motion and
 * sound when another answer follows a finish that left Lost and Found with no
 * pet; then isComplete. True when every write of the setup record took.
 */
export function finishSetup(answers: SetupAnswers, run: SetupRun, usedBefore: SetupUse | null): boolean {
  let took = true;
  const onboarding = () => useOnboardingStore.getState();
  if (run === 'again' && answers.statement) took = tried(() => onboarding().recordStatement()) && took;
  const use = answers.use;
  if (use) {
    // The settings store holds a refused write for the visit and throws nothing.
    if (use !== usedBefore) tried(() => useSettingsStore.getState().setActivePreset(USE_SETTING[use]));
    took = tried(() => onboarding().setScenario(use)) && took;
  }
  if (answers.camera !== null) {
    const camera = answers.camera;
    took = tried(() => onboarding().setCameraPermission(camera)) && took;
  }
  if (answers.microphone !== null) {
    const microphone = answers.microphone;
    took = tried(() => onboarding().setMicrophonePermission(microphone)) && took;
  }
  if (answers.defaultCamera) took = tried(() => useCameraStore.getState().setDeviceId('')) && took;
  took = tried(() => onboarding().setLostFoundChosen(answers.lostFound)) && took;
  // The way the dashboard's start reads; a refused write is held for the visit.
  if (answers.lostFound) {
    rememberWay('lost-found');
  } else {
    const last = readLastWay();
    if (last?.way === 'lost-found' && last.pet === undefined) rememberWay('monitor');
  }
  took = tried(() => onboarding().setComplete(true)) && took;
  return took;
}
