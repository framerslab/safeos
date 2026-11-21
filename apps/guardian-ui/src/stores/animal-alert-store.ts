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
  /** When a tab last cleared History, in ms; 0 when none has. Saved with the list, in the same write. */
  historyClearedAt: number;
  
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
  /** Marks sightings as put in a downloaded bundle, so an incremental bundle leaves them out. */
  markDetectionsExported: (ids: string[]) => void;
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

const STORE_NAME = 'safeos-animal-alerts';

/** The sightings as the last write of any tab left them; null when storage cannot be read. */
function storedSightings(): DetectionHistoryEntry[] | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORE_NAME) ?? 'null') as {
      state?: { detectionHistory?: unknown };
    } | null;
    const list = saved?.state?.detectionHistory;
    return Array.isArray(list)
      ? list.filter((entry): entry is DetectionHistoryEntry => typeof entry?.id === 'string')
      : [];
  } catch {
    return null;
  }
}

const seenAt = (entry: DetectionHistoryEntry) => (Number.isFinite(entry.timestamp) ? entry.timestamp : 0);

/**
 * When a tab last cleared History, as the stored list records it; null when
 * none has or storage cannot be read. A sighting a tab could not save before
 * then went with the rest, so no tab's later write brings it back. The time is
 * saved with the cleared list, in the same write, so storage never holds the
 * one without the other.
 */
function storedClearedAt(): number | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORE_NAME) ?? 'null') as {
      state?: { historyClearedAt?: unknown };
    } | null;
    const at = saved?.state?.historyClearedAt;
    return typeof at === 'number' && Number.isFinite(at) && at > 0 ? at : null;
  } catch {
    return null;
  }
}

// The sightings this tab saved that storage has not held yet: the last
// write has not been read back, or storage refused it on a device out of
// room. Each leaves the list once storage holds it.
const unstored = new Set<string>();

/** Notes this tab's new sightings, and lets go of each that storage holds now. */
function noteStored(added: string[] = []): void {
  added.forEach((id) => unstored.add(id));
  const stored = storedSightings();
  if (stored) stored.forEach((entry) => unstored.delete(entry.id));
}

/**
 * Every open tab writes the one stored list: the watching tab saves a
 * sighting each second an animal stays in view, and any tab marks sightings
 * seen or deletes them. A tab's copy can be seconds old, so each write starts
 * from the list as stored, joined by id with the tab's own copy: a sighting
 * is seen when either side has seen it, and a sighting the stored list lacks
 * is kept only while this tab saved it and storage has not held it (a device
 * out of room holds this visit's sightings that storage refused). So no
 * tab's write takes back what another saved, marked or deleted.
 */
function withStored(own: DetectionHistoryEntry[]): DetectionHistoryEntry[] {
  const stored = storedSightings();
  if (!stored) return own;
  const mine = new Map(own.map((entry) => [entry.id, entry]));
  const byId = new Map<string, DetectionHistoryEntry>();
  for (const entry of stored) {
    const kept = mine.get(entry.id);
    byId.set(entry.id, kept ? { ...entry, acknowledged: entry.acknowledged === true || kept.acknowledged } : entry);
  }
  const cleared = storedClearedAt();
  for (const entry of own) {
    if (byId.has(entry.id) || !unstored.has(entry.id)) continue;
    // Seen before another tab cleared History, it went with the rest.
    if (cleared !== null && seenAt(entry) <= cleared) continue;
    byId.set(entry.id, entry);
  }
  // A sighting this tab no longer holds, or one a clear took, is no longer waited on.
  for (const id of Array.from(unstored)) if (!mine.has(id) || !byId.has(id)) unstored.delete(id);
  return Array.from(byId.values()).sort((a, b) => seenAt(b) - seenAt(a));
}

// The list this tab last wrote or read from storage, by reference. A write
// whose list is still that one changes no sighting (the store persists its
// whole state after every action, a live sighting cleared or the watch
// stopped too), so storage keeps the list as stored, which another tab may
// have changed since: this tab's copy never takes back another tab's mark or
// delete.
let historyWritten: DetectionHistoryEntry[] | null = null;
function historyToWrite(own: DetectionHistoryEntry[]): DetectionHistoryEntry[] {
  if (own === historyWritten) return storedSightings() ?? own;
  historyWritten = own;
  return own;
}

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
      historyClearedAt: 0,
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
        const newHistory = [entry, ...withStored(detectionHistory)].slice(0, settings.maxStoredFrames);
        
        set({
          currentDetections: [...get().currentDetections, detection],
          detectionHistory: newHistory,
          lastDetectionTime: Date.now(),
          totalDetections: get().totalDetections + 1,
        });
        noteStored([entry.id]);
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
        
        const newHistory = [...entries, ...withStored(detectionHistory)].slice(0, settings.maxStoredFrames);
        
        set({
          currentDetections: [...get().currentDetections, ...detections],
          detectionHistory: newHistory,
          lastDetectionTime: Date.now(),
          totalDetections: get().totalDetections + detections.length,
        });
        noteStored(entries.map((entry) => entry.id));
        alertsChanged();
      },

      clearCurrentDetections: () => set({ currentDetections: [] }),

      // History actions
      acknowledgeDetection: (id) => {
        set((state) => ({
          detectionHistory: withStored(state.detectionHistory).map((d) =>
            d.id === id ? { ...d, acknowledged: true } : d
          ),
        }));
        alertsChanged();
      },

      acknowledgeDetections: (ids) => {
        set((state) => {
          const marked = new Set(ids);
          return { detectionHistory: withStored(state.detectionHistory).map((d) => (marked.has(d.id) ? { ...d, acknowledged: true } : d)) };
        });
        alertsChanged();
      },

      updateDetectionNotes: (id, notes) =>
        set((state) => ({
          detectionHistory: withStored(state.detectionHistory).map((d) =>
            d.id === id ? { ...d, notes } : d
          ),
        })),

      markDetectionsExported: (ids) => {
        const put = new Set(ids);
        set((state) => ({
          detectionHistory: withStored(state.detectionHistory).map((d) => (put.has(d.id) ? { ...d, exported: true } : d)),
        }));
      },

      deleteDetection: (id) => {
        set((state) => ({
          detectionHistory: withStored(state.detectionHistory).filter((d) => d.id !== id),
        }));
        alertsChanged();
      },

      clearHistory: () => {
        set({ detectionHistory: [], totalDetections: 0, historyClearedAt: Date.now() });
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
      name: STORE_NAME,
      // A full device keeps the sighting for the visit and the alert goes on.
      // A sighting read from storage again calls none of the actions above,
      // so two tabs never answer each other without end.
      storage: createJSONStorage(() => guardedStorage),
      onRehydrateStorage: () => (state) => {
        if (state) historyWritten = state.detectionHistory;
      },
      partialize: (state) => ({
        settings: state.settings,
        detectionHistory: historyToWrite(state.detectionHistory),
        totalDetections: state.totalDetections,
        // The newest clear any tab saved: a tab that has not heard of another's clear keeps it.
        historyClearedAt: Math.max(state.historyClearedAt || 0, storedClearedAt() ?? 0),
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

