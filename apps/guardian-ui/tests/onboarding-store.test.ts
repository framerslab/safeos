/** @jest-environment jsdom */
/**
 * The setup record: what setup writes, what counts as done, and what an
 * earlier setup saved.
 */

import * as onboarding from '@/stores/onboarding-store';
import { canSkipOnboarding, useOnboardingStore, type OnboardingState } from '@/stores/onboarding-store';

const stored = () => JSON.parse(localStorage.getItem('safeos-onboarding') || '{}') as { state?: Record<string, unknown> };

const NOTHING_ANSWERED = {
  isComplete: false,
  selectedScenario: null,
  lostFoundChosen: false,
  acceptedDisclaimers: { main: false, scenario: false, privacy: false, terms: false },
  disclaimerAcceptedAt: null,
  cameraPermissionGranted: false,
  microphonePermissionGranted: false,
};

const answered = () => {
  const state = useOnboardingStore.getState();
  return {
    isComplete: state.isComplete,
    selectedScenario: state.selectedScenario,
    lostFoundChosen: state.lostFoundChosen,
    acceptedDisclaimers: state.acceptedDisclaimers,
    disclaimerAcceptedAt: state.disclaimerAcceptedAt,
    cameraPermissionGranted: state.cameraPermissionGranted,
    microphonePermissionGranted: state.microphonePermissionGranted,
  };
};

beforeEach(() => {
  localStorage.clear();
  useOnboardingStore.getState().reset();
});

it('starts with nothing answered', () => {
  expect(answered()).toEqual(NOTHING_ANSWERED);
});

it('keeps the choice of Lost and Found that setup and the watch share', () => {
  useOnboardingStore.getState().setLostFoundChosen(true);
  expect(useOnboardingStore.getState().lostFoundChosen).toBe(true);
  expect(stored().state?.lostFoundChosen).toBe(true);
  useOnboardingStore.getState().reset();
  expect(useOnboardingStore.getState().lostFoundChosen).toBe(false);
});

it('counts setup as done only with the record marked complete, the statement\'s two flags and a use', () => {
  // Each of the statement's two flags is read on its own: a record with one of them alone is not done.
  const rows: Array<[boolean, boolean, boolean, boolean]> = [];
  for (const complete of [false, true]) {
    for (const main of [false, true]) {
      for (const scenario of [false, true]) {
        for (const use of [false, true]) rows.push([complete, main, scenario, use]);
      }
    }
  }
  const done = rows.filter(([complete, main, scenario, use]) =>
    canSkipOnboarding({
      ...useOnboardingStore.getState(),
      isComplete: complete,
      acceptedDisclaimers: { main, scenario, privacy: false, terms: false },
      selectedScenario: use ? 'pet' : null,
    } as OnboardingState)
  );
  expect(rows).toHaveLength(16);
  expect(done).toEqual([[true, true, true, true]]);
});

it('records that the statement stood, with its time, and leaves the other two flags', () => {
  useOnboardingStore.setState({ acceptedDisclaimers: { main: false, scenario: false, privacy: true, terms: false } });
  useOnboardingStore.getState().recordStatement();
  const state = useOnboardingStore.getState();
  expect(state.acceptedDisclaimers).toEqual({ main: true, scenario: true, privacy: true, terms: false });
  expect(Number.isFinite(Date.parse(state.disclaimerAcceptedAt || ''))).toBe(true);
});

it('keeps the fields an earlier setup saved', async () => {
  localStorage.setItem(
    'safeos-onboarding',
    JSON.stringify({
      state: {
        isComplete: false,
        selectedScenario: null,
        acceptedDisclaimers: { main: false, scenario: false, privacy: false, terms: false },
        profileName: 'Kitchen',
        completedSteps: [0, 1],
        telegramChatId: '123',
      },
      version: 0,
    })
  );
  await useOnboardingStore.persist.rehydrate();
  useOnboardingStore.getState().setScenario('pet');
  const saved = stored().state || {};
  expect(saved.profileName).toBe('Kitchen');
  expect(saved.completedSteps).toEqual([0, 1]);
  expect(saved.telegramChatId).toBe('123');
  expect(saved.selectedScenario).toBe('pet');
});

it('has no list of six steps and no actions only they used', () => {
  expect(Object.keys(onboarding)).not.toContain('getOnboardingSteps');
  const actions = Object.keys(useOnboardingStore.getState());
  for (const gone of ['setStep', 'completeStep', 'acceptDisclaimer', 'acceptAllDisclaimers', 'setProfileName', 'setNotifications']) {
    expect(actions).not.toContain(gone);
  }
});

it('reset leaves nothing answered', () => {
  const store = useOnboardingStore.getState();
  store.recordStatement();
  store.setScenario('baby');
  store.setComplete(true);
  useOnboardingStore.getState().reset();
  expect(answered()).toEqual(NOTHING_ANSWERED);
});
