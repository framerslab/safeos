/**
 * Onboarding Store
 *
 * Zustand store for onboarding and consent management. Setup writes the
 * statement's two flags, the use, the choice of Lost and Found and the camera
 * answers. Fields an earlier setup saved stay in the saved record.
 *
 * @module stores/onboarding-store
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// =============================================================================
// Types
// =============================================================================

export interface OnboardingState {
  // Onboarding progress
  isComplete: boolean;

  // Disclaimers
  acceptedDisclaimers: {
    main: boolean;
    scenario: boolean;
    privacy: boolean;
    terms: boolean;
  };
  disclaimerAcceptedAt: string | null;

  // Profile selection
  selectedScenario: 'pet' | 'baby' | 'elderly' | 'security' | null;
  /**
   * Lost & Found is chosen: in setup, where it saves the pet use, on the
   * watch's Watch for, and by the Lost & Found page's start key. Setup run
   * again shows it chosen and ends on Lost & Found, and the watch opens with
   * Lost and Found, so setup and the watch show the same choice.
   */
  lostFoundChosen: boolean;

  // Camera permissions
  cameraPermissionGranted: boolean;
  microphonePermissionGranted: boolean;

  // Actions
  setComplete: (complete: boolean) => void;
  setScenario: (scenario: 'pet' | 'baby' | 'elderly' | 'security' | null) => void;
  setLostFoundChosen: (chosen: boolean) => void;
  setCameraPermission: (granted: boolean) => void;
  setMicrophonePermission: (granted: boolean) => void;
  /** Records that setup's statement stood on the step the person went on from: the two flags the done-check reads, and the time. */
  recordStatement: () => void;
  reset: () => void;
}

// =============================================================================
// Initial State
// =============================================================================

const INITIAL_DISCLAIMERS = {
  main: false,
  scenario: false,
  privacy: false,
  terms: false,
};

// =============================================================================
// Store
// =============================================================================

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      // Initial state
      isComplete: false,
      acceptedDisclaimers: INITIAL_DISCLAIMERS,
      disclaimerAcceptedAt: null,
      selectedScenario: null,
      lostFoundChosen: false,
      cameraPermissionGranted: false,
      microphonePermissionGranted: false,

      // Actions
      setComplete: (complete) => set({ isComplete: complete }),

      setScenario: (scenario) => set({ selectedScenario: scenario }),

      setLostFoundChosen: (chosen) => set({ lostFoundChosen: chosen }),

      setCameraPermission: (granted) => set({ cameraPermissionGranted: granted }),

      setMicrophonePermission: (granted) => set({ microphonePermissionGranted: granted }),

      recordStatement: () =>
        set((state) => ({
          acceptedDisclaimers: { ...state.acceptedDisclaimers, main: true, scenario: true },
          disclaimerAcceptedAt: new Date().toISOString(),
        })),

      reset: () =>
        set({
          isComplete: false,
          acceptedDisclaimers: INITIAL_DISCLAIMERS,
          disclaimerAcceptedAt: null,
          selectedScenario: null,
          lostFoundChosen: false,
          cameraPermissionGranted: false,
          microphonePermissionGranted: false,
        }),
    }),
    {
      name: 'safeos-onboarding',
    }
  )
);

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if all required disclaimers are accepted
 */
export function areDisclaimersAccepted(
  disclaimers: OnboardingState['acceptedDisclaimers']
): boolean {
  return disclaimers.main && disclaimers.scenario;
}

/**
 * Check if onboarding can be skipped (returning user)
 */
export function canSkipOnboarding(state: OnboardingState): boolean {
  return (
    state.isComplete &&
    areDisclaimersAccepted(state.acceptedDisclaimers) &&
    state.selectedScenario !== null
  );
}

export default useOnboardingStore;
