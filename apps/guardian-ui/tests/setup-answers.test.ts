/** @jest-environment jsdom */
/**
 * What a press on setup writes
 *
 * A first setup writes each answer at its press: that the statement stood,
 * with its time, and the camera's and the microphone's answers. A browser
 * that refuses to store them throws nothing, and the answers stay on the page
 * for the visit.
 */

import { writeNow } from '@/lib/setup-answers';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useCameraStore } from '@/stores/camera-store';

beforeEach(() => {
  localStorage.clear();
  useOnboardingStore.getState().reset();
});
afterEach(() => {
  jest.restoreAllMocks();
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
});
