/**
 * Lost & Found Store
 * 
 * Zustand store for managing lost pet/person watch mode,
 * including subject profiles, match history, and settings.
 * 
 * @module stores/lost-found-store
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { EARLIER_SPOKEN_DEFAULT, SPOKEN_DEFAULT } from '../lib/lost-found-words';
import type { VisualFingerprint } from '../lib/visual-fingerprint';
import type { MatchResult, MatcherSettings } from '../lib/subject-matcher';

// =============================================================================
// Types
// =============================================================================

export type SubjectType = 'pet' | 'person' | 'other';

export interface SubjectProfile {
  id: string;
  name: string;
  type: SubjectType;
  description: string;
  fingerprint: VisualFingerprint;
  referenceImages: string[];      // Base64 thumbnails
  createdAt: string;
  lastActiveAt: string | null;
  matchCount: number;
}

export interface MatchFrame {
  id: string;
  subjectId: string;
  frameData: string;              // Base64 image
  thumbnailData: string;          // Smaller thumbnail
  confidence: number;
  timestamp: number;
  details: {
    colorMatch: number;
    dominantMatch: number;
    edgeMatch: number;
    sizeMatch: number;
  };
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  acknowledged: boolean;
  notes: string;
  exported: boolean;
  /**
   * True when the check that saved this frame raised the alert, false when it
   * only recorded it. A frame saved before this field existed has none.
   */
  alerted?: boolean;
}

export interface LostFoundSettings {
  // Detection thresholds
  minConfidenceForAlert: number;
  minConfidenceForRecord: number;
  colorSensitivity: number;
  sizeTolerance: number;
  
  // Processing
  processingMode: 'local' | 'hybrid';
  scanGridSize: number;
  adaptiveLighting: boolean;
  motionPriority: boolean;
  
  // Alerts
  alertSound: boolean;
  alertNotification: boolean;
  alertVolume: number;
  alertRepeat: boolean;
  
  // Storage
  maxStoredFrames: number;
  autoDeleteDays: number;
  
  // Display
  showConfidenceOverlay: boolean;
  highlightMatchRegion: boolean;
  
  // Custom media playback (new)
  customMediaEnabled: boolean;
  customMediaPlaybackMode: 'count' | 'loop' | 'timer';
  customMediaRepeatCount: number;
  customMediaTimerMs: number;
  customMediaImageIntervalMs: number;
  customMediaTTSEnabled: boolean;
  customMediaTTSMessages: string[];
}

export interface LostFoundState {
  // Active subject
  activeSubject: SubjectProfile | null;
  isWatching: boolean;
  /**
   * The pet the watch compares with when Lost and Found is chosen, kept on
   * this device so a reload keeps it. The pet itself is read from the saved
   * pets; null until one is chosen. A person an earlier version saved is
   * never it.
   */
  chosenPetId: string | null;
  
  // Saved subjects
  subjects: SubjectProfile[];
  
  // Match history
  matchFrames: MatchFrame[];
  recentMatches: MatchResult[];
  
  // Real-time state
  currentConfidence: number;
  consecutiveMatches: number;
  lastAlertTime: number | null;
  
  // Settings
  settings: LostFoundSettings;
  
  // Actions - Subject Management
  setActiveSubject: (subject: SubjectProfile | null) => void;
  addSubject: (subject: SubjectProfile) => void;
  updateSubject: (id: string, updates: Partial<SubjectProfile>) => void;
  removeSubject: (id: string) => void;
  
  // Actions - Watching
  startWatching: () => void;
  stopWatching: () => void;
  
  // Actions - Match Handling
  addMatchFrame: (frame: MatchFrame) => void;
  removeMatchFrame: (id: string) => void;
  acknowledgeMatch: (id: string) => void;
  updateMatchNotes: (id: string, notes: string) => void;
  markExported: (ids: string[]) => void;
  clearMatchHistory: (subjectId?: string) => void;
  
  // Actions - Real-time Updates
  updateCurrentConfidence: (confidence: number) => void;
  updateConsecutiveMatches: (count: number) => void;
  recordAlert: () => void;
  addRecentMatch: (match: MatchResult) => void;
  
  // Actions - Settings
  updateSettings: (settings: Partial<LostFoundSettings>) => void;
  
  // Actions - Cleanup
  cleanupOldFrames: () => void;
  reset: () => void;
}

// =============================================================================
// Default Settings
// =============================================================================

export const DEFAULT_SETTINGS: LostFoundSettings = {
  // Detection
  minConfidenceForAlert: 70,
  minConfidenceForRecord: 50,
  colorSensitivity: 50,
  sizeTolerance: 50,
  
  // Processing
  processingMode: 'local',
  scanGridSize: 8,
  adaptiveLighting: true,
  motionPriority: true,
  
  // Alerts
  alertSound: true,
  alertNotification: true,
  alertVolume: 80,
  alertRepeat: false,
  
  // Storage
  maxStoredFrames: 500,
  autoDeleteDays: 7,
  
  // Display
  showConfidenceOverlay: true,
  highlightMatchRegion: true,
  
  // Custom media playback
  customMediaEnabled: false,
  customMediaPlaybackMode: 'count',
  customMediaRepeatCount: 3,
  customMediaTimerMs: 60000,
  customMediaImageIntervalMs: 3000,
  customMediaTTSEnabled: true,
  customMediaTTSMessages: [SPOKEN_DEFAULT],
};

/** Update the factory spoken line on devices that saved it before. */
export function migrateLostFound(persisted: unknown, version: number): unknown {
  if (version !== 0 || !persisted || typeof persisted !== 'object' || !('settings' in persisted)) {
    return persisted;
  }

  const { settings } = persisted;
  if (!settings || typeof settings !== 'object' || !('customMediaTTSMessages' in settings)) {
    return persisted;
  }

  const { customMediaTTSMessages } = settings;
  if (!Array.isArray(customMediaTTSMessages) || !customMediaTTSMessages.includes(EARLIER_SPOKEN_DEFAULT)) {
    return persisted;
  }

  return {
    ...persisted,
    settings: {
      ...settings,
      customMediaTTSMessages: customMediaTTSMessages.map((line) =>
        line === EARLIER_SPOKEN_DEFAULT ? SPOKEN_DEFAULT : line
      ),
    },
  };
}

// =============================================================================
// Store
// =============================================================================

export const useLostFoundStore = create<LostFoundState>()(
  persist(
    (set, get) => ({
      // Initial state
      activeSubject: null,
      isWatching: false,
      chosenPetId: null,
      subjects: [],
      matchFrames: [],
      recentMatches: [],
      currentConfidence: 0,
      consecutiveMatches: 0,
      lastAlertTime: null,
      settings: DEFAULT_SETTINGS,

      // Subject Management
      setActiveSubject: (subject) => {
        set((state) => {
          // A person an earlier version saved can be opened on the Lost & Found
          // page but is never the watch's: opening one, or closing it again,
          // leaves the chosen pet as it was.
          const person = (subject ?? state.activeSubject)?.type === 'person';
          const changed = (subject?.id ?? null) !== (state.activeSubject?.id ?? null);
          return {
            activeSubject: subject,
            chosenPetId: person ? state.chosenPetId : subject?.id ?? null,
            // The live results are the subject's they were read for: another
            // subject starts with none. The same subject (photos added) keeps them.
            ...(changed ? { recentMatches: [], currentConfidence: 0, consecutiveMatches: 0 } : {}),
          };
        });
        if (subject) {
          // Update lastActiveAt
          const subjects = get().subjects.map(s =>
            s.id === subject.id
              ? { ...s, lastActiveAt: new Date().toISOString() }
              : s
          );
          set({ subjects });
        }
      },

      addSubject: (subject) => {
        set((state) => ({
          subjects: [...state.subjects, subject],
        }));
      },

      updateSubject: (id, updates) => {
        set((state) => ({
          subjects: state.subjects.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
          // Also update activeSubject if it's the same
          activeSubject:
            state.activeSubject?.id === id
              ? { ...state.activeSubject, ...updates }
              : state.activeSubject,
        }));
      },

      removeSubject: (id) => {
        set((state) => ({
          subjects: state.subjects.filter((s) => s.id !== id),
          activeSubject:
            state.activeSubject?.id === id ? null : state.activeSubject,
          chosenPetId: state.chosenPetId === id ? null : state.chosenPetId,
          matchFrames: state.matchFrames.filter((f) => f.subjectId !== id),
        }));
      },

      // Watching
      startWatching: () => {
        const { activeSubject } = get();
        if (!activeSubject) return;
        
        set({
          isWatching: true,
          currentConfidence: 0,
          consecutiveMatches: 0,
          recentMatches: [],
        });
      },

      stopWatching: () => {
        set({
          isWatching: false,
          currentConfidence: 0,
          consecutiveMatches: 0,
        });
      },

      // Match Handling
      addMatchFrame: (frame) => {
        set((state) => {
          const newFrames = [frame, ...state.matchFrames];
          
          // Enforce max limit
          const maxFrames = state.settings.maxStoredFrames;
          const trimmedFrames = newFrames.slice(0, maxFrames);
          
          // Update subject match count
          const subjects = state.subjects.map((s) =>
            s.id === frame.subjectId
              ? { ...s, matchCount: s.matchCount + 1 }
              : s
          );
          
          return {
            matchFrames: trimmedFrames,
            subjects,
          };
        });
      },

      removeMatchFrame: (id) => {
        set((state) => ({
          matchFrames: state.matchFrames.filter((f) => f.id !== id),
        }));
      },

      acknowledgeMatch: (id) => {
        set((state) => ({
          matchFrames: state.matchFrames.map((f) =>
            f.id === id ? { ...f, acknowledged: true } : f
          ),
        }));
      },

      updateMatchNotes: (id, notes) => {
        set((state) => ({
          matchFrames: state.matchFrames.map((f) =>
            f.id === id ? { ...f, notes } : f
          ),
        }));
      },

      markExported: (ids) => {
        set((state) => ({
          matchFrames: state.matchFrames.map((f) =>
            ids.includes(f.id) ? { ...f, exported: true } : f
          ),
        }));
      },

      clearMatchHistory: (subjectId) => {
        set((state) => ({
          matchFrames: subjectId
            ? state.matchFrames.filter((f) => f.subjectId !== subjectId)
            : [],
        }));
      },

      // Real-time Updates
      updateCurrentConfidence: (confidence) => {
        set({ currentConfidence: confidence });
      },

      updateConsecutiveMatches: (count) => {
        set({ consecutiveMatches: count });
      },

      recordAlert: () => {
        set({ lastAlertTime: Date.now() });
      },

      addRecentMatch: (match) => {
        set((state) => ({
          recentMatches: [match, ...state.recentMatches].slice(0, 20),
        }));
      },

      // Settings
      updateSettings: (updates) => {
        set((state) => ({
          settings: { ...state.settings, ...updates },
        }));
      },

      // Cleanup
      cleanupOldFrames: () => {
        const { settings, matchFrames } = get();
        const cutoffTime = Date.now() - settings.autoDeleteDays * 24 * 60 * 60 * 1000;
        
        const filteredFrames = matchFrames.filter(
          (f) => f.timestamp > cutoffTime || !f.acknowledged
        );
        
        set({ matchFrames: filteredFrames });
      },

      reset: () => {
        set({
          activeSubject: null,
          isWatching: false,
          chosenPetId: null,
          matchFrames: [],
          recentMatches: [],
          currentConfidence: 0,
          consecutiveMatches: 0,
          lastAlertTime: null,
        });
      },
    }),
    {
      name: 'safeos-lost-found',
      version: 1,
      migrate: migrateLostFound,
      partialize: (state) => ({
        subjects: state.subjects,
        settings: state.settings,
        chosenPetId: state.chosenPetId,
        // Don't persist match frames - they go to IndexedDB
        // Don't persist real-time state
      }),
    }
  )
);

// =============================================================================
// Selectors
// =============================================================================

export const selectActiveSubject = (state: LostFoundState) => state.activeSubject;
export const selectIsWatching = (state: LostFoundState) => state.isWatching;
export const selectSubjects = (state: LostFoundState) => state.subjects;
export const selectSettings = (state: LostFoundState) => state.settings;
export const selectMatchFrames = (state: LostFoundState) => state.matchFrames;
export const selectCurrentConfidence = (state: LostFoundState) => state.currentConfidence;
export const selectRecentMatches = (state: LostFoundState) => state.recentMatches;

export const selectUnacknowledgedMatches = (state: LostFoundState) =>
  state.matchFrames.filter((f) => !f.acknowledged);

export const selectMatchesBySubject = (state: LostFoundState, subjectId: string) =>
  state.matchFrames.filter((f) => f.subjectId === subjectId);

export const selectHighConfidenceMatches = (state: LostFoundState) =>
  state.matchFrames.filter((f) => f.confidence >= state.settings.minConfidenceForAlert);

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a new subject profile
 */
export function createSubjectProfile(
  name: string,
  type: SubjectType,
  description: string,
  fingerprint: VisualFingerprint,
  referenceImages: string[]
): SubjectProfile {
  return {
    id: `subject-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name,
    type,
    description,
    fingerprint,
    referenceImages,
    createdAt: new Date().toISOString(),
    lastActiveAt: null,
    matchCount: 0,
  };
}

/**
 * Create a match frame from a match result and whether its check raised the alert
 */
export function createMatchFrame(
  subjectId: string,
  matchResult: MatchResult,
  alerted: boolean,
  thumbnailData?: string
): MatchFrame {
  return {
    id: matchResult.id,
    subjectId,
    frameData: matchResult.frameData || '',
    thumbnailData: thumbnailData || matchResult.frameData || '',
    confidence: matchResult.confidence,
    timestamp: matchResult.timestamp,
    details: matchResult.details,
    region: matchResult.region,
    acknowledged: false,
    notes: '',
    exported: false,
    alerted,
  };
}

/**
 * Get matcher settings from store settings
 */
export function getMatcherSettings(storeSettings: LostFoundSettings): Partial<MatcherSettings> {
  return {
    minConfidenceForAlert: storeSettings.minConfidenceForAlert,
    minConfidenceForRecord: storeSettings.minConfidenceForRecord,
    colorSensitivity: storeSettings.colorSensitivity,
    sizeTolerance: storeSettings.sizeTolerance,
    scanGridSize: storeSettings.scanGridSize,
    processingMode: storeSettings.processingMode,
    adaptiveLighting: storeSettings.adaptiveLighting,
    motionPriority: storeSettings.motionPriority,
  };
}

/**
 * Get subject type label
 */
export function getSubjectTypeLabel(type: SubjectType): string {
  switch (type) {
    case 'pet':
      return 'Pet';
    case 'person':
      return 'Person';
    case 'other':
      return 'Other';
  }
}

/**
 * Get subject type icon name
 */
export function getSubjectTypeIcon(type: SubjectType): string {
  switch (type) {
    case 'pet':
      return 'paw';
    case 'person':
      return 'user';
    case 'other':
      return 'search';
  }
}

export default useLostFoundStore;

