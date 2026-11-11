/**
 * Monitoring Store
 *
 * Zustand store for monitoring state management.
 *
 * @module stores/monitoring-store
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { cacheAlert, getCachedMonitoringAlerts, deleteCachedMonitoringAlert, clearCachedMonitoringAlerts } from '../lib/client-db';

// =============================================================================
// Types
// =============================================================================

export interface Alert {
  id: string;
  streamId: string;
  alertType?: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  message: string;
  thumbnailUrl?: string;
  createdAt?: string;
  timestamp?: string;
  acknowledged: boolean;
}

export type MonitoringScenario = 'pet' | 'baby' | 'elderly' | 'security';

export interface StreamInfo {
  id: string;
  scenario: 'pet' | 'baby' | 'elderly' | 'security';
  status: 'active' | 'paused' | 'ended';
  startedAt: string;
  motionScore?: number;
  audioLevel?: number;
}

export interface MonitoringSettings {
  motionSensitivity: number; // 0-100
  audioSensitivity: number; // 0-100
  analysisInterval: number; // seconds
  enableMotionDetection: boolean;
  enableAudioDetection: boolean;
  enableCryDetection: boolean;
  muted: boolean;
}

export interface MonitoringState {
  // Connection state
  isConnected: boolean;
  
  // Stream state
  isStreaming: boolean;
  streamId: string | null;
  scenario: 'pet' | 'baby' | 'elderly' | 'security' | null;
  streams: StreamInfo[];

  // Real-time metrics
  motionScore: number;
  audioLevel: number;
  hasCrying: boolean;

  // Alerts
  alerts: Alert[];

  // Settings
  settings: MonitoringSettings;

  // Session timer (for pet/baby/elderly modes only)
  sessionExpiresAt: number | null;
  sessionDurationHours: number;
  sessionStartedAt: number | null;

  // Actions
  setConnected: (connected: boolean) => void;
  setStreaming: (streaming: boolean) => void;
  setStreamId: (id: string | null) => void;
  setScenario: (scenario: 'pet' | 'baby' | 'elderly' | 'security' | null) => void;
  setMotionScore: (score: number) => void;
  setAudioLevel: (level: number) => void;
  setHasCrying: (crying: boolean) => void;
  addAlert: (alert: Alert) => void;
  removeAlert: (id: string) => void;
  acknowledgeAlert: (id: string) => void;
  clearAlerts: () => void;
  hydrateAlerts: () => Promise<void>;
  addStream: (stream: StreamInfo) => void;
  removeStream: (id: string) => void;
  updateStream: (id: string, update: Partial<StreamInfo>) => void;
  updateSettings: (settings: Partial<MonitoringSettings>) => void;
  
  // Session timer actions
  startSession: (durationHours?: number) => void;
  endSession: () => void;
  extendSession: (additionalHours: number) => void;
  isSessionExpired: () => boolean;
  getSessionRemaining: () => number;
  
  reset: () => void;
}

// =============================================================================
// Initial State
// =============================================================================

const DEFAULT_SETTINGS: MonitoringSettings = {
  motionSensitivity: 50,
  audioSensitivity: 50,
  analysisInterval: 30,
  enableMotionDetection: true,
  enableAudioDetection: true,
  enableCryDetection: true,
  muted: false,
};

// =============================================================================
// Store
// =============================================================================

// Serialize writes so a quick acknowledge, dismiss or clear cannot be undone by
// an earlier save that is still waiting for IndexedDB to open.
let alertWrites: Promise<void> = Promise.resolve();
let alertRevision = 0;
function writeAlerts(write: () => Promise<void>) {
  alertRevision++;
  alertWrites = alertWrites.then(write).catch((error) => {
    console.warn('[Monitoring] Could not save alert history:', error);
  });
}
function saveAlert(alert: Alert) {
  return cacheAlert({ ...alert, monitoring: true, createdAt: alert.createdAt || alert.timestamp || new Date().toISOString() });
}

export const useMonitoringStore = create<MonitoringState>()(
  persist(
    (set, get) => ({
      // Initial state
      isConnected: false,
      isStreaming: false,
      streamId: null,
      scenario: null,
      streams: [],
      motionScore: 0,
      audioLevel: 0,
      hasCrying: false,
      alerts: [],
      settings: DEFAULT_SETTINGS,

      // Session timer state
      sessionExpiresAt: null,
      sessionDurationHours: 24,
      sessionStartedAt: null,

      // Actions
      setConnected: (connected) => set({ isConnected: connected }),
      
      setStreaming: (streaming) => set({ isStreaming: streaming }),

      setStreamId: (id) => set({ streamId: id }),

      setScenario: (scenario) => set({ scenario }),

      setMotionScore: (score) => set({ motionScore: score }),

      setAudioLevel: (level) => set({ audioLevel: level }),

      setHasCrying: (crying) => set({ hasCrying: crying }),

      addAlert: (alert) => {
        const dated = { ...alert, createdAt: alert.createdAt || alert.timestamp || new Date().toISOString() };
        set((state) => ({ alerts: [dated, ...state.alerts.filter(a => a.id !== dated.id)].slice(0, 100) }));
        writeAlerts(() => saveAlert(dated));
      },

      removeAlert: (id) => {
        set((state) => ({ alerts: state.alerts.filter(a => a.id !== id) }));
        writeAlerts(() => deleteCachedMonitoringAlert(id));
      },

      acknowledgeAlert: (id) => {
        set((state) => ({ alerts: state.alerts.map(a => a.id === id ? { ...a, acknowledged: true } : a) }));
        const alert = get().alerts.find(a => a.id === id);
        if (alert) writeAlerts(() => saveAlert(alert));
      },

      clearAlerts: () => {
        set({ alerts: [] });
        writeAlerts(clearCachedMonitoringAlerts);
      },

      hydrateAlerts: async () => {
        await alertWrites;
        const revision = alertRevision;
        const saved: Alert[] = await getCachedMonitoringAlerts();
        if (revision !== alertRevision) return get().hydrateAlerts();
        set((state) => ({
          alerts: Array.from(new Map([...saved, ...state.alerts].map(a => [a.id, a])).values())
            .sort((a, b) => (b.createdAt || b.timestamp || '').localeCompare(a.createdAt || a.timestamp || ''))
            .slice(0, 100),
        }));
      },

      addStream: (stream) =>
        set((state) => ({
          streams: [...state.streams, stream],
        })),

      removeStream: (id) =>
        set((state) => ({
          streams: state.streams.filter((s) => s.id !== id),
        })),

      updateStream: (id, update) =>
        set((state) => ({
          streams: state.streams.map((s) =>
            s.id === id ? { ...s, ...update } : s
          ),
        })),

      updateSettings: (update) =>
        set((state) => ({
          settings: { ...state.settings, ...update },
        })),

      // Session timer actions
      startSession: (durationHours = 24) => {
        const { scenario } = get();
        // Only apply timer to monitoring modes, not security or lost-found
        if (scenario === 'security') return;
        
        const clampedHours = Math.max(1, Math.min(24, durationHours));
        const now = Date.now();
        const expiresAt = now + clampedHours * 60 * 60 * 1000;
        
        set({
          sessionStartedAt: now,
          sessionExpiresAt: expiresAt,
          sessionDurationHours: clampedHours,
        });
      },

      endSession: () => {
        set({
          sessionStartedAt: null,
          sessionExpiresAt: null,
        });
      },

      extendSession: (additionalHours) => {
        const { sessionExpiresAt } = get();
        if (!sessionExpiresAt) return;

        const now = Date.now();
        const currentRemaining = sessionExpiresAt - now;
        const additionalMs = additionalHours * 60 * 60 * 1000;
        const maxDurationMs = 24 * 60 * 60 * 1000;
        
        const newRemaining = Math.min(maxDurationMs, currentRemaining + additionalMs);
        
        set({
          sessionExpiresAt: now + newRemaining,
        });
      },

      isSessionExpired: () => {
        const { sessionExpiresAt, scenario } = get();
        // Security mode never expires
        if (scenario === 'security') return false;
        if (!sessionExpiresAt) return false;
        return Date.now() >= sessionExpiresAt;
      },

      getSessionRemaining: () => {
        const { sessionExpiresAt } = get();
        if (!sessionExpiresAt) return 0;
        return Math.max(0, sessionExpiresAt - Date.now());
      },

      reset: () => {
        writeAlerts(clearCachedMonitoringAlerts);
        set({
          isConnected: false,
          isStreaming: false,
          streamId: null,
          scenario: null,
          streams: [],
          motionScore: 0,
          audioLevel: 0,
          hasCrying: false,
          alerts: [],
          settings: DEFAULT_SETTINGS,
          sessionExpiresAt: null,
          sessionDurationHours: 24,
          sessionStartedAt: null,
        });
      },
    }),
    {
      name: 'safeos-monitoring',
      partialize: (state) => ({
        settings: state.settings,
        // Don't persist real-time data
      }),
    }
  )
);

// =============================================================================
// Selectors (for performance optimization)
// =============================================================================

export const selectIsStreaming = (state: MonitoringState) => state.isStreaming;
export const selectStreamId = (state: MonitoringState) => state.streamId;
export const selectScenario = (state: MonitoringState) => state.scenario;
export const selectAlerts = (state: MonitoringState) => state.alerts;
export const selectUnacknowledgedAlerts = (state: MonitoringState) =>
  state.alerts.filter((a) => !a.acknowledged);
export const selectSettings = (state: MonitoringState) => state.settings;
export const selectMotionScore = (state: MonitoringState) => state.motionScore;
export const selectAudioLevel = (state: MonitoringState) => state.audioLevel;

export default useMonitoringStore;
