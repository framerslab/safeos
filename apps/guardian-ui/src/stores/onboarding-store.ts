/**
 * Onboarding Store
 *
 * Zustand store for onboarding and consent management.
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
  currentStep: number;
  completedSteps: number[];
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
   * Setup's Lost & Found choice was made: it saves the pet use, and this
   * marks it, so setup run again shows it chosen and ends on Lost & Found.
   */
  lostFoundChosen: boolean;
  profileName: string;

  // Notifications
  notificationsEnabled: boolean;
  browserPushEnabled: boolean;
  smsEnabled: boolean;
  telegramEnabled: boolean;
  telegramChatId: string | null;

  // Camera permissions
  cameraPermissionGranted: boolean;
  microphonePermissionGranted: boolean;

  // Actions
  setStep: (step: number) => void;
  completeStep: (step: number) => void;
  setComplete: (complete: boolean) => void;
  acceptDisclaimer: (type: keyof OnboardingState['acceptedDisclaimers']) => void;
  acceptAllDisclaimers: () => void;
  setScenario: (scenario: 'pet' | 'baby' | 'elderly' | 'security' | null) => void;
  setLostFoundChosen: (chosen: boolean) => void;
  setProfileName: (name: string) => void;
  setNotifications: (settings: Partial<NotificationSettings>) => void;
  setCameraPermission: (granted: boolean) => void;
  setMicrophonePermission: (granted: boolean) => void;
  reset: () => void;
}

interface NotificationSettings {
  notificationsEnabled: boolean;
  browserPushEnabled: boolean;
  smsEnabled: boolean;
  telegramEnabled: boolean;
  telegramChatId: string | null;
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
      currentStep: 0,
      completedSteps: [],
      isComplete: false,
      acceptedDisclaimers: INITIAL_DISCLAIMERS,
      disclaimerAcceptedAt: null,
      selectedScenario: null,
      lostFoundChosen: false,
      profileName: '',
      notificationsEnabled: true,
      browserPushEnabled: false,
      smsEnabled: false,
      telegramEnabled: false,
      telegramChatId: null,
      cameraPermissionGranted: false,
      microphonePermissionGranted: false,

      // Actions
      setStep: (step) => set({ currentStep: step }),

      completeStep: (step) =>
        set((state) => ({
          completedSteps: state.completedSteps.includes(step)
            ? state.completedSteps
            : [...state.completedSteps, step],
          currentStep: Math.max(state.currentStep, step + 1),
        })),

      setComplete: (complete) => set({ isComplete: complete }),

      acceptDisclaimer: (type) =>
        set((state) => ({
          acceptedDisclaimers: {
            ...state.acceptedDisclaimers,
            [type]: true,
          },
          disclaimerAcceptedAt: new Date().toISOString(),
        })),

      acceptAllDisclaimers: () =>
        set({
          acceptedDisclaimers: {
            main: true,
            scenario: true,
            privacy: true,
            terms: true,
          },
          disclaimerAcceptedAt: new Date().toISOString(),
        }),

      setScenario: (scenario) => set({ selectedScenario: scenario }),

      setLostFoundChosen: (chosen) => set({ lostFoundChosen: chosen }),

      setProfileName: (name) => set({ profileName: name }),

      setNotifications: (settings) =>
        set((state) => ({
          notificationsEnabled: settings.notificationsEnabled ?? state.notificationsEnabled,
          browserPushEnabled: settings.browserPushEnabled ?? state.browserPushEnabled,
          smsEnabled: settings.smsEnabled ?? state.smsEnabled,
          telegramEnabled: settings.telegramEnabled ?? state.telegramEnabled,
          telegramChatId: settings.telegramChatId ?? state.telegramChatId,
        })),

      setCameraPermission: (granted) => set({ cameraPermissionGranted: granted }),

      setMicrophonePermission: (granted) => set({ microphonePermissionGranted: granted }),

      reset: () =>
        set({
          currentStep: 0,
          completedSteps: [],
          isComplete: false,
          acceptedDisclaimers: INITIAL_DISCLAIMERS,
          disclaimerAcceptedAt: null,
          selectedScenario: null,
          lostFoundChosen: false,
          profileName: '',
          notificationsEnabled: true,
          browserPushEnabled: false,
          smsEnabled: false,
          telegramEnabled: false,
          telegramChatId: null,
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
 * Get onboarding steps configuration
 */
export function getOnboardingSteps() {
  return [
    {
      id: 0,
      name: 'Welcome',
      description: 'Introduction to SafeOS Guardian',
      required: true,
    },
    {
      id: 1,
      name: 'Safety Disclaimer',
      description: 'Read and accept important safety information',
      required: true,
    },
    {
      id: 2,
      name: 'Select Scenario',
      description: 'Choose what you want to monitor',
      required: true,
    },
    {
      id: 3,
      name: 'Camera Access',
      description: 'Grant camera and microphone permissions',
      required: true,
    },
    {
      id: 4,
      name: 'Notifications',
      description: 'Set up alert notifications',
      required: false,
    },
    {
      id: 5,
      name: 'Ready',
      description: 'Start monitoring',
      required: false,
    },
  ];
}

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
