/** @jest-environment jsdom */
/**
 * What a press on setup writes
 *
 * A first setup writes each answer at its press: that the statement stood,
 * with its time, and the camera's and the microphone's answers. A browser
 * that refuses to store them throws nothing, and the answers stay on the page
 * for the visit.
 */

import { answerFor, chosenOf, initialChoice, writeNow } from '@/lib/setup-answers';
import { wayFromParam } from '@/lib/app-routes';
import { forgetStorageFull } from '@/lib/storage-full';
import { useSettingsStore } from '@/stores/settings-store';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useCameraStore } from '@/stores/camera-store';

beforeEach(() => {
  localStorage.clear();
  useOnboardingStore.getState().reset();
  useSettingsStore.getState().resetToDefaults();
});
afterEach(() => {
  jest.restoreAllMocks();
  forgetStorageFull();
});

describe('what a press on setup writes', () => {
  it('records that the statement stood, with its time, and leaves the other two flags', () => {
    expect(Object.values(useOnboardingStore.getState().acceptedDisclaimers).every((flag) => flag === false)).toBe(true);
    expect(writeNow({ statement: true })).toBe(true);
    const state = useOnboardingStore.getState();
    expect(state.acceptedDisclaimers.main).toBe(true);
    expect(state.acceptedDisclaimers.scenario).toBe(true);
    expect(state.acceptedDisclaimers.privacy).toBe(false);
    expect(state.acceptedDisclaimers.terms).toBe(false);
    expect(Number.isNaN(Date.parse(state.disclaimerAcceptedAt ?? ''))).toBe(false);
  });

  it('writes the camera and microphone answers', () => {
    writeNow({ camera: false, microphone: false });
    expect(useOnboardingStore.getState().cameraPermissionGranted).toBe(false);
    expect(useOnboardingStore.getState().microphonePermissionGranted).toBe(false);
    writeNow({ camera: true, microphone: false });
    expect(useOnboardingStore.getState().cameraPermissionGranted).toBe(true);
    expect(useOnboardingStore.getState().microphonePermissionGranted).toBe(false);
  });

  it('keeps the answers for the visit when the browser refuses to store them', () => {
    jest.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    let result = true;
    expect(() => {
      result = writeNow({ statement: true });
    }).not.toThrow();
    expect(result).toBe(false);
  });

  it('removes the saved camera for Use the default camera', () => {
    useCameraStore.getState().setDeviceId('usb');
    expect(writeNow({ defaultCamera: true })).toBe(true);
    expect(useCameraStore.getState().deviceId).toBe('');
  });

  it('writes a use pressed on a first setup, with its setting', () => {
    const before = useOnboardingStore.getState().lostFoundChosen;
    expect(writeNow({ use: 'baby' })).toBe(true);
    expect(useOnboardingStore.getState().selectedScenario).toBe('baby');
    expect(useSettingsStore.getState().activePresetId).toBe('infant_sleep');
    expect(useSettingsStore.getState().globalSettings.motionSensitivity).toBe(98);
    expect(useOnboardingStore.getState().lostFoundChosen).toBe(before);
  });

  it('keeps a tuned setting when the use pressed is the one the device holds', () => {
    useOnboardingStore.setState({ selectedScenario: 'pet' });
    useSettingsStore.getState().setActivePreset('pet_sleep');
    useSettingsStore.getState().updateGlobalSettings({ motionSensitivity: 33 });
    writeNow({ use: 'pet' });
    expect(useSettingsStore.getState().globalSettings.motionSensitivity).toBe(33);
  });

  it('keeps the use for the visit when the browser refuses to store it', () => {
    jest.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    let answer = true;
    expect(() => {
      answer = writeNow({ use: 'pet' });
    }).not.toThrow();
    expect(answer).toBe(false);
    expect(useOnboardingStore.getState().selectedScenario).toBe('pet');
  });

  it('writes A lost pet at its press: the pet use, its setting and Lost and Found chosen, and another answer writes it not chosen', () => {
    expect(writeNow(answerFor('lost_found'))).toBe(true);
    expect(useOnboardingStore.getState().selectedScenario).toBe('pet');
    expect(useSettingsStore.getState().activePresetId).toBe('pet_sleep');
    expect(useOnboardingStore.getState().lostFoundChosen).toBe(true);
    writeNow(answerFor('baby'));
    expect(useOnboardingStore.getState().selectedScenario).toBe('baby');
    expect(useSettingsStore.getState().activePresetId).toBe('infant_sleep');
    expect(useOnboardingStore.getState().lostFoundChosen).toBe(false);
  });

  it.each([
    [null, false, null, null, null],
    [null, false, 'lost-found', 'lost_found', 'pet'],
    [null, false, 'security', 'security', 'security'],
    [null, false, 'monitor', null, null],
    [null, false, 'wildlife', null, null],
    ['baby', false, 'lost-found', 'baby', 'baby'],
    ['pet', false, 'security', 'pet', 'pet'],
    ['elderly', false, null, 'elderly', 'elderly'],
    ['pet', true, null, 'lost_found', 'pet'],
    ['pet', true, 'wildlife', 'lost_found', 'pet'],
    ['baby', true, 'monitor', 'lost_found', 'baby'],
    [null, true, null, 'lost_found', 'pet'],
  ] as const)(
    'a device holding %s, with Lost and Found saved as %s, opened from the row %s, shows %s chosen and saves %s',
    (saved, lostFoundSaved, next, shown, use) => {
      const answers = initialChoice(saved, lostFoundSaved, wayFromParam(next));
      expect(chosenOf(answers)).toBe(shown);
      expect(answers.use).toBe(use);
    }
  );
});
