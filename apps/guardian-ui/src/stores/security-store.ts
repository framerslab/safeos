/**
 * Security Store
 * 
 * Zustand store for anti-theft/intruder detection settings
 * and intrusion event management.
 * 
 * @module stores/security-store
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// =============================================================================
// Types
// =============================================================================

export type AlertMode = 'extreme' | 'silent';

export type ArmingState = 'disarmed' | 'arming' | 'armed' | 'triggered';

export interface IntrusionFrame {
  id: string;
  frameData: string;
  thumbnailData: string;
  timestamp: number;
  personCount: number;
  allowedCount: number;
  detections: Array<{
    bbox: [number, number, number, number];
    confidence: number;
  }>;
  acknowledged: boolean;
  exported: boolean;
  notes?: string;
}

export interface TTSSettings {
  enabled: boolean;
  rate: number;
  pitch: number;
  volume: number;
  preferredVoice?: string;
  repeatDelay: number;
  randomize: boolean;
}

export interface AlertSettings {
  sirenEnabled: boolean;
  sirenVolume: number;
  flashEnabled: boolean;
  flashColor: string;
  notificationEnabled: boolean;
  tts: TTSSettings;
}

export interface SecuritySettings {
  // Person allowance
  allowedPersons: number;
  
  // Alert mode
  alertMode: AlertMode;
  
  // Detection settings
  confidenceThreshold: number;
  motionThreshold: number;
  detectionInterval: number;
  
  // Alert settings
  alerts: AlertSettings;
  
  // Custom TTS messages
  customMessages: string[];
  
  // Arming
  armingCountdown: number; // seconds
  triggerCooldown: number; // ms between triggers
  
  // Frame storage
  maxStoredFrames: number;
  autoDeleteDays: number;
}

export const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  allowedPersons: 0,
  alertMode: 'extreme',
  confidenceThreshold: 0.5,
  motionThreshold: 15,
  detectionInterval: 500,
  alerts: {
    sirenEnabled: true,
    sirenVolume: 100,
    flashEnabled: true,
    flashColor: '#ff0000',
    notificationEnabled: true,
    tts: {
      enabled: true,
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      repeatDelay: 2000,
      randomize: true,
    },
  },
  customMessages: [],
  armingCountdown: 30,
  triggerCooldown: 5000,
  maxStoredFrames: 100,
  autoDeleteDays: 30,
};

// =============================================================================
// State Interface
// =============================================================================

export interface SecurityState {
  // Core state
  armingState: ArmingState;
  settings: SecuritySettings;
  
  // Runtime state
  currentPersonCount: number;
  lastDetectionTime: number | null;
  lastTriggerTime: number | null;
  armingTimeRemaining: number;
  
  // Intrusion frames (in-memory, synced with IndexedDB)
  intrusionFrames: IntrusionFrame[];
  
  // Statistics
  totalIntrusionEvents: number;
  lastIntrusionTime: number | null;
  
  // Actions
  arm: () => void;
  disarm: () => void;
  setArmingState: (state: ArmingState) => void;
  setArmingTimeRemaining: (seconds: number) => void;
  
  updateSettings: (settings: Partial<SecuritySettings>) => void;
  updateAlertSettings: (alerts: Partial<AlertSettings>) => void;
  updateTTSSettings: (tts: Partial<TTSSettings>) => void;
  
  setAllowedPersons: (count: number) => void;
  setAlertMode: (mode: AlertMode) => void;
  
  setCurrentPersonCount: (count: number) => void;
  recordDetection: (count: number) => void;
  triggerIntrusion: (frame: IntrusionFrame) => void;
  
  addIntrusionFrame: (frame: IntrusionFrame) => void;
  removeIntrusionFrame: (id: string) => void;
  acknowledgeFrame: (id: string) => void;
  exportFrames: (ids: string[]) => void;
  updateFrameNotes: (id: string, notes: string) => void;
  clearIntrusionHistory: () => void;
  
  addCustomMessage: (message: string) => void;
  removeCustomMessage: (index: number) => void;
  setCustomMessages: (messages: string[]) => void;
  
  reset: () => void;
}

// =============================================================================
// Store
// =============================================================================

export const useSecurityStore = create<SecurityState>()(
  persist(
    (set, get) => ({
      // Initial state
      armingState: 'disarmed',
      settings: DEFAULT_SECURITY_SETTINGS,
      currentPersonCount: 0,
      lastDetectionTime: null,
      lastTriggerTime: null,
      armingTimeRemaining: 0,
      intrusionFrames: [],
      totalIntrusionEvents: 0,
      lastIntrusionTime: null,

      // Arming actions
      arm: () => {
        const { settings } = get();
        set({ 
          armingState: 'arming',
          armingTimeRemaining: settings.armingCountdown,
        });
      },

      disarm: () => {
        set({ 
          armingState: 'disarmed',
          armingTimeRemaining: 0,
          currentPersonCount: 0,
        });
      },

      setArmingState: (armingState) => {
        set({ armingState });
      },

      setArmingTimeRemaining: (armingTimeRemaining) => {
        set({ armingTimeRemaining });
        if (armingTimeRemaining <= 0 && get().armingState === 'arming') {
          set({ armingState: 'armed' });
        }
      },

      // Settings actions
      updateSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        }));
      },

      updateAlertSettings: (alerts) => {
        set((state) => ({
          settings: {
            ...state.settings,
            alerts: { ...state.settings.alerts, ...alerts },
          },
        }));
      },

      updateTTSSettings: (tts) => {
        set((state) => ({
          settings: {
            ...state.settings,
            alerts: {
              ...state.settings.alerts,
              tts: { ...state.settings.alerts.tts, ...tts },
            },
          },
        }));
      },

      setAllowedPersons: (allowedPersons) => {
        set((state) => ({
          settings: { ...state.settings, allowedPersons },
        }));
      },

      setAlertMode: (alertMode) => {
        set((state) => ({
          settings: { ...state.settings, alertMode },
        }));
      },

      // Detection actions
      setCurrentPersonCount: (currentPersonCount) => {
        set({ currentPersonCount });
      },

      recordDetection: (count) => {
        set({ 
          currentPersonCount: count,
          lastDetectionTime: Date.now(),
        });
      },

      triggerIntrusion: (frame) => {
        const { settings, lastTriggerTime, intrusionFrames } = get();
        const now = Date.now();

        // Check cooldown
        if (lastTriggerTime && now - lastTriggerTime < settings.triggerCooldown) {
          return;
        }

        // Add frame and update state
        const updatedFrames = [frame, ...intrusionFrames].slice(0, settings.maxStoredFrames);

        set({
          armingState: 'triggered',
          lastTriggerTime: now,
          lastIntrusionTime: now,
          totalIntrusionEvents: get().totalIntrusionEvents + 1,
          intrusionFrames: updatedFrames,
        });
      },

      // Frame management
      addIntrusionFrame: (frame) => {
        const { settings, intrusionFrames } = get();
        const updatedFrames = [frame, ...intrusionFrames].slice(0, settings.maxStoredFrames);
        set({ intrusionFrames: updatedFrames });
      },

      removeIntrusionFrame: (id) => {
        set((state) => ({
          intrusionFrames: state.intrusionFrames.filter((f) => f.id !== id),
        }));
      },

      acknowledgeFrame: (id) => {
        set((state) => ({
          intrusionFrames: state.intrusionFrames.map((f) =>
            f.id === id ? { ...f, acknowledged: true } : f
          ),
        }));
      },

      exportFrames: (ids) => {
        set((state) => ({
          intrusionFrames: state.intrusionFrames.map((f) =>
            ids.includes(f.id) ? { ...f, exported: true } : f
          ),
        }));
      },

      updateFrameNotes: (id, notes) => {
        set((state) => ({
          intrusionFrames: state.intrusionFrames.map((f) =>
            f.id === id ? { ...f, notes } : f
          ),
        }));
      },

      clearIntrusionHistory: () => {
        set({ intrusionFrames: [] });
      },

      // Custom messages
      addCustomMessage: (message) => {
        set((state) => ({
          settings: {
            ...state.settings,
            customMessages: [...state.settings.customMessages, message],
          },
        }));
      },

      removeCustomMessage: (index) => {
        set((state) => ({
          settings: {
            ...state.settings,
            customMessages: state.settings.customMessages.filter((_, i) => i !== index),
          },
        }));
      },

      setCustomMessages: (customMessages) => {
        set((state) => ({
          settings: { ...state.settings, customMessages },
        }));
      },

      // Reset
      reset: () => {
        set({
          armingState: 'disarmed',
          currentPersonCount: 0,
          lastDetectionTime: null,
          lastTriggerTime: null,
          armingTimeRemaining: 0,
        });
      },
    }),
    {
      name: 'safeos-security',
      partialize: (state) => ({
        settings: state.settings,
        intrusionFrames: state.intrusionFrames,
        totalIntrusionEvents: state.totalIntrusionEvents,
        lastIntrusionTime: state.lastIntrusionTime,
      }),
    }
  )
);

// =============================================================================
// Selectors
// =============================================================================

export const selectIsArmed = (state: SecurityState) => 
  state.armingState === 'armed' || state.armingState === 'triggered';

export const selectIsTriggered = (state: SecurityState) => 
  state.armingState === 'triggered';

export const selectIsArming = (state: SecurityState) => 
  state.armingState === 'arming';

export const selectPersonExcess = (state: SecurityState) => 
  Math.max(0, state.currentPersonCount - state.settings.allowedPersons);

export const selectHasExcess = (state: SecurityState) => 
  state.currentPersonCount > state.settings.allowedPersons;

export const selectUnacknowledgedFrames = (state: SecurityState) =>
  state.intrusionFrames.filter((f) => !f.acknowledged);

export const selectRecentFrames = (state: SecurityState, limit: number = 10) =>
  state.intrusionFrames.slice(0, limit);

export const selectFramesByTimeRange = (
  state: SecurityState, 
  startTime: number, 
  endTime: number
) => state.intrusionFrames.filter(
  (f) => f.timestamp >= startTime && f.timestamp <= endTime
);

// =============================================================================
// Helpers
// =============================================================================

/**
 * Create an intrusion frame from detection data
 */
export function createIntrusionFrame(
  frameData: string,
  personCount: number,
  allowedCount: number,
  detections: Array<{ bbox: [number, number, number, number]; confidence: number }>,
  timestamp = Date.now()
): IntrusionFrame {
  return {
    id: `intrusion-${timestamp}-${Math.random().toString(36).slice(2, 9)}`,
    frameData,
    thumbnailData: frameData, // Could be resized separately
    timestamp,
    personCount,
    allowedCount,
    detections,
    acknowledged: false,
    exported: false,
  };
}

/**
 * Get alert mode label
 */
export function getAlertModeLabel(mode: AlertMode): string {
  switch (mode) {
    case 'extreme':
      return 'Extreme (Full Alert)';
    case 'silent':
      return 'Silent (Record Only)';
    default:
      return mode;
  }
}

/**
 * Get alert mode description
 */
export function getAlertModeDescription(mode: AlertMode): string {
  switch (mode) {
    case 'extreme':
      return 'Maximum volume sirens, TTS warnings, screen flash, and recording';
    case 'silent':
      return 'Silent recording with optional browser notification';
    default:
      return '';
  }
}

/**
 * Get arming state label
 */
export function getArmingStateLabel(state: ArmingState): string {
  switch (state) {
    case 'disarmed':
      return 'Disarmed';
    case 'arming':
      return 'Arming...';
    case 'armed':
      return 'Armed';
    case 'triggered':
      return 'Alert';
    default:
      return state;
  }
}

/**
 * Get arming state color
 */
export function getArmingStateColor(state: ArmingState): string {
  switch (state) {
    case 'disarmed':
      return 'gray';
    case 'arming':
      return 'yellow';
    case 'armed':
      return 'green';
    case 'triggered':
      return 'red';
    default:
      return 'gray';
  }
}

export default useSecurityStore;

