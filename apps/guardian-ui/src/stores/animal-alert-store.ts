/**
 * Animal Alert Store
 * 
 * Zustand store for animal/wildlife detection settings
 * and detection history management.
 * 
 * @module stores/animal-alert-store
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AnimalDetection, SizeCategory, DangerLevel } from '../lib/animal-detection';
import { guardedStorage } from '../lib/storage-full';
import { alertsChanged } from '../lib/tab-channel';

// =============================================================================
// Types
// =============================================================================

export type AlertMode = 'voice' | 'sound' | 'both' | 'silent';

export interface AnimalAlertSettings {
  // Enable/disable by size
  largeAnimalAlertEnabled: boolean;
  smallAnimalAlertEnabled: boolean;
  mediumAnimalAlertEnabled: boolean;
  
  // Enable/disable by danger level
  dangerAlertEnabled: boolean;
  cautionAlertEnabled: boolean;
  
  // Alert modes
  alertMode: AlertMode;
  alertVolume: number;
  voiceRate: number;
  
  // Detection settings
  confidenceThreshold: number;
  motionThreshold: number;
  
  // Notifications
  browserNotifications: boolean;
  flashScreen: boolean;
  
  // Recording
  captureFrames: boolean;
  maxStoredFrames: number;
  autoDeleteDays: number;
}

export const DEFAULT_ANIMAL_SETTINGS: AnimalAlertSettings = {
  largeAnimalAlertEnabled: true,
  smallAnimalAlertEnabled: true,
  mediumAnimalAlertEnabled: true,
  dangerAlertEnabled: true,
  cautionAlertEnabled: true,
  alertMode: 'voice',
  alertVolume: 80,
  voiceRate: 1.0,
  confidenceThreshold: 0.5,
  motionThreshold: 15,
  browserNotifications: true,
  flashScreen: true,
  captureFrames: true,
  maxStoredFrames: 100,
  autoDeleteDays: 7,
};

export interface DetectionHistoryEntry extends AnimalDetection {
  acknowledged: boolean;
  notes: string;
  exported: boolean;
}

export interface AnimalAlertState {
  // Settings
  settings: AnimalAlertSettings;
  
  // Runtime state
  isMonitoring: boolean;
  lastDetectionTime: number | null;
  currentDetections: AnimalDetection[];
  
  // History
  detectionHistory: DetectionHistoryEntry[];
  totalDetections: number;
  
  // Filters for UI
  sizeFilter: SizeCategory[];
  dangerFilter: DangerLevel[];
  
  // Actions
  updateSettings: (settings: Partial<AnimalAlertSettings>) => void;
  
  setMonitoring: (monitoring: boolean) => void;
  
  addDetection: (detection: AnimalDetection) => void;
  addDetections: (detections: AnimalDetection[]) => void;
  clearCurrentDetections: () => void;
  
  acknowledgeDetection: (id: string) => void;
  acknowledgeDetections: (ids: string[]) => void;
  updateDetectionNotes: (id: string, notes: string) => void;
  deleteDetection: (id: string) => void;
  clearHistory: () => void;
  
  setSizeFilter: (sizes: SizeCategory[]) => void;
  setDangerFilter: (levels: DangerLevel[]) => void;
  
  getFilteredHistory: () => DetectionHistoryEntry[];
  getLargeAnimalCount: () => number;
  getSmallAnimalCount: () => number;
  getDangerousCount: () => number;
  
  reset: () => void;
}

// =============================================================================
// Store
// =============================================================================

export const useAnimalAlertStore = create<AnimalAlertState>()(
  persist(
    (set, get) => ({
      // Initial state
      settings: DEFAULT_ANIMAL_SETTINGS,
      isMonitoring: false,
      lastDetectionTime: null,
      currentDetections: [],
      detectionHistory: [],
      totalDetections: 0,
      sizeFilter: ['small', 'medium', 'large'],
      dangerFilter: ['none', 'low', 'medium', 'high', 'extreme'],

      // Settings actions
      updateSettings: (update) =>
        set((state) => ({
          settings: { ...state.settings, ...update },
        })),

      // Monitoring actions
      setMonitoring: (monitoring) => set({ isMonitoring: monitoring }),

      // Detection actions
      addDetection: (detection) => {
        const { settings, detectionHistory } = get();
        
        const entry: DetectionHistoryEntry = {
          ...detection,
          acknowledged: false,
          notes: '',
          exported: false,
        };
        
        // Limit history size
        const newHistory = [entry, ...detectionHistory].slice(0, settings.maxStoredFrames);
        
        set({
          currentDetections: [...get().currentDetections, detection],
          detectionHistory: newHistory,
          lastDetectionTime: Date.now(),
          totalDetections: get().totalDetections + 1,
        });
        alertsChanged();
      },

      addDetections: (detections) => {
        const { settings, detectionHistory } = get();
        
        const entries: DetectionHistoryEntry[] = detections.map(d => ({
          ...d,
          acknowledged: false,
          notes: '',
          exported: false,
        }));
        
        const newHistory = [...entries, ...detectionHistory].slice(0, settings.maxStoredFrames);
        
        set({
          currentDetections: [...get().currentDetections, ...detections],
          detectionHistory: newHistory,
          lastDetectionTime: Date.now(),
          totalDetections: get().totalDetections + detections.length,
        });
        alertsChanged();
      },

      clearCurrentDetections: () => set({ currentDetections: [] }),

      // History actions
      acknowledgeDetection: (id) => {
        set((state) => ({
          detectionHistory: state.detectionHistory.map((d) =>
            d.id === id ? { ...d, acknowledged: true } : d
          ),
        }));
        alertsChanged();
      },

      acknowledgeDetections: (ids) => {
        set((state) => {
          const marked = new Set(ids);
          return { detectionHistory: state.detectionHistory.map((d) => (marked.has(d.id) ? { ...d, acknowledged: true } : d)) };
        });
        alertsChanged();
      },

      updateDetectionNotes: (id, notes) =>
        set((state) => ({
          detectionHistory: state.detectionHistory.map((d) =>
            d.id === id ? { ...d, notes } : d
          ),
        })),

      deleteDetection: (id) => {
        set((state) => ({
          detectionHistory: state.detectionHistory.filter((d) => d.id !== id),
        }));
        alertsChanged();
      },

      clearHistory: () => {
        set({ detectionHistory: [], totalDetections: 0 });
        alertsChanged();
      },

      // Filter actions
      setSizeFilter: (sizeFilter) => set({ sizeFilter }),
      setDangerFilter: (dangerFilter) => set({ dangerFilter }),

      // Selectors
      getFilteredHistory: () => {
        const { detectionHistory, sizeFilter, dangerFilter } = get();
        return detectionHistory.filter(
          (d) => sizeFilter.includes(d.sizeCategory) && dangerFilter.includes(d.dangerLevel)
        );
      },

      getLargeAnimalCount: () => {
        const { detectionHistory } = get();
        return detectionHistory.filter((d) => d.sizeCategory === 'large').length;
      },

      getSmallAnimalCount: () => {
        const { detectionHistory } = get();
        return detectionHistory.filter((d) => d.sizeCategory === 'small').length;
      },

      getDangerousCount: () => {
        const { detectionHistory } = get();
        return detectionHistory.filter(
          (d) => d.dangerLevel === 'high' || d.dangerLevel === 'extreme'
        ).length;
      },

      // Reset
      reset: () =>
        set({
          isMonitoring: false,
          lastDetectionTime: null,
          currentDetections: [],
        }),
    }),
    {
      name: 'safeos-animal-alerts',
      // A full device keeps the sighting for the visit and the alert goes on.
      // A sighting read from storage again calls none of the actions above,
      // so two tabs never answer each other without end.
      storage: createJSONStorage(() => guardedStorage),
      partialize: (state) => ({
        settings: state.settings,
        detectionHistory: state.detectionHistory,
        totalDetections: state.totalDetections,
        sizeFilter: state.sizeFilter,
        dangerFilter: state.dangerFilter,
      }),
    }
  )
);

// =============================================================================
// Selectors
// =============================================================================

export const selectSettings = (state: AnimalAlertState) => state.settings;
export const selectIsMonitoring = (state: AnimalAlertState) => state.isMonitoring;
export const selectCurrentDetections = (state: AnimalAlertState) => state.currentDetections;
export const selectDetectionHistory = (state: AnimalAlertState) => state.detectionHistory;

export const selectUnacknowledgedCount = (state: AnimalAlertState) =>
  state.detectionHistory.filter((d) => !d.acknowledged).length;

export const selectRecentDetections = (state: AnimalAlertState, limit = 10) =>
  state.detectionHistory.slice(0, limit);

export const selectDangerousDetections = (state: AnimalAlertState) =>
  state.detectionHistory.filter(
    (d) => d.dangerLevel === 'high' || d.dangerLevel === 'extreme'
  );

export const selectLargeAnimals = (state: AnimalAlertState) =>
  state.detectionHistory.filter((d) => d.sizeCategory === 'large');

export const selectSmallAnimals = (state: AnimalAlertState) =>
  state.detectionHistory.filter((d) => d.sizeCategory === 'small');

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if detection should trigger alert based on settings
 */
export function shouldAlert(
  detection: AnimalDetection,
  settings: AnimalAlertSettings
): boolean {
  // Check size-based settings
  if (detection.sizeCategory === 'large' && !settings.largeAnimalAlertEnabled) {
    return false;
  }
  if (detection.sizeCategory === 'small' && !settings.smallAnimalAlertEnabled) {
    return false;
  }
  if (detection.sizeCategory === 'medium' && !settings.mediumAnimalAlertEnabled) {
    return false;
  }
  
  // Check danger-based settings
  const isDangerous = detection.dangerLevel === 'high' || detection.dangerLevel === 'extreme';
  const isCaution = detection.dangerLevel === 'medium';
  
  if (isDangerous && !settings.dangerAlertEnabled) {
    return false;
  }
  if (isCaution && !settings.cautionAlertEnabled) {
    return false;
  }
  
  return true;
}

/**
 * Get alert priority for detection
 */
export function getAlertPriority(detection: AnimalDetection): number {
  const dangerWeight: Record<DangerLevel, number> = {
    extreme: 100,
    high: 80,
    medium: 50,
    low: 20,
    none: 0,
  };
  
  const sizeWeight: Record<SizeCategory, number> = {
    large: 30,
    medium: 20,
    small: 10,
  };
  
  return dangerWeight[detection.dangerLevel] + sizeWeight[detection.sizeCategory];
}

/**
 * Sort detections by priority
 */
export function sortByPriority(detections: AnimalDetection[]): AnimalDetection[] {
  return [...detections].sort((a, b) => getAlertPriority(b) - getAlertPriority(a));
}

export default useAnimalAlertStore;

