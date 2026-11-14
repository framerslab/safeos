import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// =============================================================================
// Types
// =============================================================================

/**
 * Processing mode determines how detection is handled:
 * - 'local': 100% on-device, instant response, no internet required
 * - 'ai_enhanced': Uses AI for advanced analysis, may be queued
 * - 'hybrid': Local first for instant response, AI enhancement queued
 */
export type ProcessingMode = 'local' | 'ai_enhanced' | 'hybrid';

export interface SecurityPreset {
  id: string;
  name: string;
  description: string;
  motionSensitivity: number;      // 0-100
  audioSensitivity: number;       // 0-100
  pixelThreshold: number;         // 0-100 (lower = more sensitive)
  absolutePixelThreshold: number; // 1-1000 pixels (absolute count, not percentage)
  analysisInterval: number;       // seconds (1-60)
  alertDelay: number;             // seconds before escalation (0-300)
  alertVolume: number;            // 0-100
  emergencyMode: boolean;         // Auto-escalate to emergency
  pixelDetectionEnabled: boolean; // Enable pixel-by-pixel detection
  motionDetectionEnabled: boolean;
  audioDetectionEnabled: boolean;
  processingMode: ProcessingMode; // How detection is processed
  useAbsoluteThreshold: boolean;  // Use absolute pixel count vs percentage
}

export interface ScenarioOverrides {
  pet?: Partial<SecurityPreset>;
  baby?: Partial<SecurityPreset>;
  elderly?: Partial<SecurityPreset>;
  security?: Partial<SecurityPreset>;
}

export interface ZoneSensitivityOverride {
  motion?: number;  // 0-100, undefined = use global
  audio?: number;   // 0-100, undefined = use global
  pixel?: number;   // 1-1000 pixels, absolute count threshold, undefined = use global
}

export interface DetectionZone {
  id: string;
  name: string;
  enabled: boolean;
  x: number;      // 0-100 percentage
  y: number;      // 0-100 percentage
  width: number;  // 0-100 percentage
  height: number; // 0-100 percentage
  sensitivityOverride?: ZoneSensitivityOverride;  // Per-zone sensitivity override
}

export interface AudioSettings {
  frequencyRange: 'all' | 'baby_cry' | 'pet_sounds' | 'elderly_fall' | 'custom';
  backgroundNoiseFilter: boolean;
  customLowFreq: number;   // Hz
  customHighFreq: number;  // Hz
}

export interface TimingSettings {
  cooldownPeriod: number;         // seconds between alerts (10-300)
  minimumMotionDuration: number;  // ms to prevent false positives
  emergencyEscalationDelay: number; // seconds before auto-emergency (0 = disabled)
}

/**
 * Per-severity cooldown periods (seconds)
 */
export interface SeverityCooldowns {
  info: number;     // Default: 5s
  low: number;      // Default: 10s
  medium: number;   // Default: 30s
  high: number;     // Default: 60s
  critical: number; // Default: 0s (no cooldown)
}

export type AlertSeverity = keyof SeverityCooldowns;

/**
 * Quiet hours settings - mute or reduce alerts during specified times
 */
export interface QuietHoursSettings {
  enabled: boolean;
  startTime: string;    // "22:00" format (24h)
  endTime: string;      // "07:00" format
  days: number[];       // 0-6, where 0 = Sunday
  mode: 'silent' | 'reduced' | 'emergency_only';
  reducedVolume: number; // 0-100, used when mode = 'reduced'
}

/**
 * Detection feature settings - controls for AI detection types and inactivity monitoring
 */
export interface DetectionFeatureSettings {
  // AI Detection toggles
  personDetectionEnabled: boolean;
  animalDetectionEnabled: boolean;

  // Person detection config
  personConfidenceThreshold: number;  // 0.1-1.0
  maxPersonDetections: number;        // 1-20

  // Animal detection config
  animalConfidenceThreshold: number;  // 0.1-1.0
  alertOnLargeAnimals: boolean;
  alertOnDangerousAnimals: boolean;

  // Inactivity monitoring
  inactivityMonitoringEnabled: boolean;
  inactivityAlertMinutes: number;     // 1-60
  inactivitySeverity: AlertSeverity;
}

/**
 * Alert escalation levels determine how unacknowledged alerts become more
 * noticeable over time.
 */
export type AlertSoundType = 'notification' | 'alert' | 'warning' | 'alarm' | 'emergency';

export interface AlertEscalationLevel {
  level: number;             // 1-5
  name: string;
  description: string;
  volumeMultiplier: number;  // Multiplier applied to effective volume (1.0 = 100%)
  delaySeconds: number;      // Seconds after previous level (level 1 is always 0)
  soundType: AlertSoundType;
}

export type PresetId = 'silent' | 'night' | 'maximum' | 'ultimate' | 'infant_sleep' | 'pet_sleep' | 'deep_sleep_minimal' | 'custom';
export type SleepPresetId = 'infant_sleep' | 'pet_sleep' | 'deep_sleep_minimal';
export type ScenarioType = 'pet' | 'baby' | 'elderly' | 'security';

/**
 * Check if a preset is a sleep monitoring preset
 */
export function isSleepPreset(presetId: PresetId): presetId is SleepPresetId {
  return ['infant_sleep', 'pet_sleep', 'deep_sleep_minimal'].includes(presetId);
}

/**
 * Get the processing mode badge info
 */
export function getProcessingModeInfo(mode: ProcessingMode): {
  mode: ProcessingMode;
  label: string;
  description: string;
  color: 'green' | 'amber' | 'blue';
  isInstant: boolean;
} {
  switch (mode) {
    case 'local':
      return {
        mode,
        label: 'LOCAL INSTANT',
        description: '100% on-device processing. No internet required. Zero latency.',
        color: 'green',
        isInstant: true,
      };
    case 'ai_enhanced':
      return {
        mode,
        label: 'AI QUEUE',
        description: 'Advanced AI analysis. May be queued based on server load.',
        color: 'amber',
        isInstant: false,
      };
    case 'hybrid':
      return {
        mode,
        label: 'HYBRID',
        description: 'Instant local detection + AI enhancement queued in background.',
        color: 'blue',
        isInstant: true,
      };
  }
}

// =============================================================================
// Default Presets
// =============================================================================

export const DEFAULT_PRESETS: Record<PresetId, SecurityPreset> = {
  silent: {
    id: 'silent',
    name: 'Silent Mode',
    description: 'All sounds off, visual alerts only. Perfect for quiet environments.',
    motionSensitivity: 50,
    audioSensitivity: 50,
    pixelThreshold: 30,
    absolutePixelThreshold: 100,
    analysisInterval: 10,
    alertDelay: 60,
    alertVolume: 0,
    emergencyMode: false,
    pixelDetectionEnabled: false,
    motionDetectionEnabled: true,
    audioDetectionEnabled: true,
    processingMode: 'local',
    useAbsoluteThreshold: false,
  },
  night: {
    id: 'night',
    name: 'Night Mode',
    description: 'Reduced sensitivity, lower volume (50%), longer intervals for sleeping.',
    motionSensitivity: 40,
    audioSensitivity: 60,
    pixelThreshold: 40,
    absolutePixelThreshold: 150,
    analysisInterval: 15,
    alertDelay: 120,
    alertVolume: 50,
    emergencyMode: false,
    pixelDetectionEnabled: false,
    motionDetectionEnabled: true,
    audioDetectionEnabled: true,
    processingMode: 'local',
    useAbsoluteThreshold: false,
  },
  maximum: {
    id: 'maximum',
    name: 'Maximum Alert',
    description: 'High sensitivity (80%), max volume, 5-second intervals.',
    motionSensitivity: 80,
    audioSensitivity: 80,
    pixelThreshold: 20,
    absolutePixelThreshold: 50,
    analysisInterval: 5,
    alertDelay: 30,
    alertVolume: 100,
    emergencyMode: false,
    pixelDetectionEnabled: true,
    motionDetectionEnabled: true,
    audioDetectionEnabled: true,
    processingMode: 'hybrid',
    useAbsoluteThreshold: false,
  },
  ultimate: {
    id: 'ultimate',
    name: 'Ultimate Secure',
    description: 'Emergency mode ON, max everything (100%), 2-second intervals, all detection enabled.',
    motionSensitivity: 100,
    audioSensitivity: 100,
    pixelThreshold: 10,
    absolutePixelThreshold: 20,
    analysisInterval: 2,
    alertDelay: 10,
    alertVolume: 100,
    emergencyMode: true,
    pixelDetectionEnabled: true,
    motionDetectionEnabled: true,
    audioDetectionEnabled: true,
    processingMode: 'hybrid',
    useAbsoluteThreshold: true,
  },
  
  // ==========================================================================
  // Sleep Monitoring Presets - Ultra-sensitive, 100% local processing
  // ==========================================================================
  
  infant_sleep: {
    id: 'infant_sleep',
    name: 'Infant Sleep Monitor',
    description: 'Ultra-sensitive: 5px movement triggers alert. 100% local, instant response. For co-sleeping or nearby infant monitoring.',
    motionSensitivity: 98,
    audioSensitivity: 95,
    pixelThreshold: 2, // Very low percentage threshold
    absolutePixelThreshold: 5, // Just 5 pixels of movement = alert
    analysisInterval: 1, // Check every second
    alertDelay: 0, // Immediate alert
    alertVolume: 100,
    emergencyMode: false,
    pixelDetectionEnabled: true,
    motionDetectionEnabled: true,
    audioDetectionEnabled: true, // Listen for baby sounds
    processingMode: 'local', // 100% on-device, instant
    useAbsoluteThreshold: true, // Use absolute pixel count
  },
  
  pet_sleep: {
    id: 'pet_sleep',
    name: 'Pet Sleep Monitor',
    description: 'Sensitive: 10px movement triggers alert. For monitoring sleeping pets. 100% local processing.',
    motionSensitivity: 90,
    audioSensitivity: 70,
    pixelThreshold: 5,
    absolutePixelThreshold: 10, // 10 pixels of movement = alert
    analysisInterval: 2,
    alertDelay: 5, // Small delay to reduce false positives from pet breathing
    alertVolume: 80,
    emergencyMode: false,
    pixelDetectionEnabled: true,
    motionDetectionEnabled: true,
    audioDetectionEnabled: false, // Pets make sounds while sleeping
    processingMode: 'local',
    useAbsoluteThreshold: true,
  },
  
  deep_sleep_minimal: {
    id: 'deep_sleep_minimal',
    name: 'Deep Sleep Ultra-Sensitive',
    description: 'Maximum sensitivity: 3px triggers alert. For when any movement at all should raise an alert. Zero latency.',
    motionSensitivity: 100,
    audioSensitivity: 100,
    pixelThreshold: 1,
    absolutePixelThreshold: 3, // Just 3 pixels = alert
    analysisInterval: 1,
    alertDelay: 0,
    alertVolume: 100,
    emergencyMode: true, // Auto-escalate to emergency
    pixelDetectionEnabled: true,
    motionDetectionEnabled: true,
    audioDetectionEnabled: true,
    processingMode: 'local', // Always local for instant response
    useAbsoluteThreshold: true,
  },
  
  custom: {
    id: 'custom',
    name: 'Custom',
    description: 'Your personalized settings.',
    motionSensitivity: 50,
    audioSensitivity: 50,
    pixelThreshold: 30,
    absolutePixelThreshold: 100,
    analysisInterval: 10,
    alertDelay: 60,
    alertVolume: 70,
    emergencyMode: false,
    pixelDetectionEnabled: false,
    motionDetectionEnabled: true,
    audioDetectionEnabled: true,
    processingMode: 'local',
    useAbsoluteThreshold: false,
  },
};

// =============================================================================
// Sleep Presets (convenience export)
// =============================================================================

export const SLEEP_PRESETS: Record<SleepPresetId, SecurityPreset> = {
  infant_sleep: DEFAULT_PRESETS.infant_sleep,
  pet_sleep: DEFAULT_PRESETS.pet_sleep,
  deep_sleep_minimal: DEFAULT_PRESETS.deep_sleep_minimal,
};

// =============================================================================
// Default Detection Zones
// =============================================================================

export const DEFAULT_DETECTION_ZONES: DetectionZone[] = [
  {
    id: 'full',
    name: 'Full Screen',
    enabled: true,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  },
  {
    id: 'center',
    name: 'Center Focus',
    enabled: false,
    x: 25,
    y: 25,
    width: 50,
    height: 50,
  },
  {
    id: 'left',
    name: 'Left Side',
    enabled: false,
    x: 0,
    y: 0,
    width: 50,
    height: 100,
  },
  {
    id: 'right',
    name: 'Right Side',
    enabled: false,
    x: 50,
    y: 0,
    width: 50,
    height: 100,
  },
];

// =============================================================================
// Default Alert Escalation Levels
// =============================================================================

export const DEFAULT_ALERT_ESCALATION_LEVELS: AlertEscalationLevel[] = [
  {
    level: 1,
    name: 'Gentle Reminder',
    description: 'Soft notification sound at set volume',
    volumeMultiplier: 1.0,
    delaySeconds: 0,
    soundType: 'notification',
  },
  {
    level: 2,
    name: 'Attention',
    description: 'Louder alert, repeated attention grab',
    volumeMultiplier: 1.3,
    delaySeconds: 30,
    soundType: 'alert',
  },
  {
    level: 3,
    name: 'Urgent',
    description: 'Warning sound at increased volume',
    volumeMultiplier: 1.5,
    delaySeconds: 60,
    soundType: 'warning',
  },
  {
    level: 4,
    name: 'Critical',
    description: 'Alarm sound at near-max volume',
    volumeMultiplier: 1.8,
    delaySeconds: 120,
    soundType: 'alarm',
  },
  {
    level: 5,
    name: 'Emergency',
    description: 'Maximum volume, continuous until acknowledged',
    volumeMultiplier: 2.0,
    delaySeconds: 180,
    soundType: 'emergency',
  },
];

// =============================================================================
// Store State
// =============================================================================

interface SettingsState {
  settingsSourceId: string | null;
  // Current active preset
  activePresetId: PresetId;
  
  // Active sleep preset (null if not using sleep mode)
  activeSleepPreset: SleepPresetId | null;
  
  // Global settings (derived from preset or custom)
  globalSettings: SecurityPreset;
  
  // Per-scenario overrides
  scenarioOverrides: ScenarioOverrides;
  
  // Detection zones
  detectionZones: DetectionZone[];
  
  // Audio settings
  audioSettings: AudioSettings;
  
  // Timing settings
  timingSettings: TimingSettings;

  // Per-severity cooldowns
  severityCooldowns: SeverityCooldowns;

  // Quiet hours settings
  quietHoursSettings: QuietHoursSettings;

  // Detection feature settings (AI detection, inactivity monitoring)
  detectionFeatureSettings: DetectionFeatureSettings;

  // Alert escalation levels
  alertEscalationLevels: AlertEscalationLevel[];

  // Emergency mode state
  emergencyModeActive: boolean;
  emergencyAlertId: string | null;
  
  // Mute state (except emergency)
  globalMute: boolean;
  
  // Custom presets created by user
  customPresets: SecurityPreset[];
  
  // Actions
  setActivePreset: (presetId: PresetId) => void;
  activateSleepMode: (sleepPresetId: SleepPresetId) => void;
  deactivateSleepMode: () => void;
  updateGlobalSettings: (settings: Partial<SecurityPreset>) => void;
  setScenarioOverride: (scenario: ScenarioType, overrides: Partial<SecurityPreset> | null) => void;
  getEffectiveSettings: (scenario?: ScenarioType) => SecurityPreset;
  
  // Detection zone actions
  updateDetectionZone: (zoneId: string, updates: Partial<DetectionZone>) => void;
  addDetectionZone: (zone: Omit<DetectionZone, 'id'>) => void;
  removeDetectionZone: (zoneId: string) => void;
  
  // Audio settings actions
  updateAudioSettings: (settings: Partial<AudioSettings>) => void;
  
  // Timing settings actions
  updateTimingSettings: (settings: Partial<TimingSettings>) => void;

  // Severity cooldown actions
  updateSeverityCooldowns: (cooldowns: Partial<SeverityCooldowns>) => void;
  getCooldownForSeverity: (severity: AlertSeverity) => number;

  // Quiet hours actions
  updateQuietHoursSettings: (settings: Partial<QuietHoursSettings>) => void;
  isQuietHoursActive: () => boolean;
  getEffectiveVolume: () => number;

  // Detection feature settings actions
  updateDetectionFeatureSettings: (settings: Partial<DetectionFeatureSettings>) => void;

  // Alert escalation actions
  updateAlertEscalationLevel: (level: number, updates: Partial<AlertEscalationLevel>) => void;
  resetAlertEscalationLevels: () => void;

  // Emergency mode actions
  activateEmergencyMode: (alertId: string) => void;
  deactivateEmergencyMode: () => void;
  
  // Mute actions
  toggleGlobalMute: () => void;
  setGlobalMute: (muted: boolean) => void;
  
  // Custom preset actions
  saveCustomPreset: (name: string, description: string) => void;
  loadCustomPreset: (presetId: string) => void;
  deleteCustomPreset: (presetId: string) => void;
  
  // Import/Export
  exportSettings: () => string;
  importSettings: (json: string) => boolean;
  
  // Reset
  resetToDefaults: () => void;
}

// =============================================================================
// Store
// =============================================================================

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      // Initial state
      settingsSourceId: null,
      activePresetId: 'maximum',
      activeSleepPreset: null,
      globalSettings: { ...DEFAULT_PRESETS.maximum },
      scenarioOverrides: {},
      detectionZones: [...DEFAULT_DETECTION_ZONES],
      audioSettings: {
        frequencyRange: 'all',
        backgroundNoiseFilter: true,
        customLowFreq: 20,
        customHighFreq: 20000,
      },
      timingSettings: {
        cooldownPeriod: 30,
        minimumMotionDuration: 500,
        emergencyEscalationDelay: 300, // 5 minutes
      },
      severityCooldowns: {
        info: 5,
        low: 10,
        medium: 30,
        high: 60,
        critical: 0, // No cooldown for critical alerts
      },
      quietHoursSettings: {
        enabled: false,
        startTime: '22:00',
        endTime: '07:00',
        days: [0, 1, 2, 3, 4, 5, 6], // All days by default
        mode: 'reduced',
        reducedVolume: 30,
      },
      detectionFeatureSettings: {
        personDetectionEnabled: false,
        animalDetectionEnabled: false,
        personConfidenceThreshold: 0.5,
        maxPersonDetections: 10,
        animalConfidenceThreshold: 0.5,
        alertOnLargeAnimals: true,
        alertOnDangerousAnimals: true,
        inactivityMonitoringEnabled: false,
        inactivityAlertMinutes: 10,
        inactivitySeverity: 'medium',
      },
      alertEscalationLevels: [...DEFAULT_ALERT_ESCALATION_LEVELS],
      emergencyModeActive: false,
      emergencyAlertId: null,
      globalMute: false,
      customPresets: [],
      
      // Actions
      setActivePreset: (presetId) => {
        const preset = presetId === 'custom' 
          ? get().globalSettings 
          : DEFAULT_PRESETS[presetId];
        
        // Track if this is a sleep preset
        const sleepPreset = isSleepPreset(presetId) ? presetId : null;
        
        set({
          activePresetId: presetId,
          activeSleepPreset: sleepPreset,
          globalSettings: { ...preset, id: presetId },
        });
      },
      
      // Activate a sleep preset (convenience method)
      activateSleepMode: (sleepPresetId: SleepPresetId) => {
        const preset = SLEEP_PRESETS[sleepPresetId];
        set({
          activePresetId: sleepPresetId,
          activeSleepPreset: sleepPresetId,
          globalSettings: { ...preset },
        });
      },
      
      // Deactivate sleep mode and return to previous preset
      deactivateSleepMode: () => {
        set({
          activePresetId: 'maximum',
          activeSleepPreset: null,
          globalSettings: { ...DEFAULT_PRESETS.maximum },
        });
      },
      
      updateGlobalSettings: (settings) => {
        set((state) => ({
          activePresetId: 'custom',
          globalSettings: {
            ...state.globalSettings,
            ...settings,
            id: 'custom',
          },
        }));
      },
      
      setScenarioOverride: (scenario, overrides) => {
        set((state) => ({
          scenarioOverrides: {
            ...state.scenarioOverrides,
            [scenario]: overrides,
          },
        }));
      },
      
      getEffectiveSettings: (scenario) => {
        const state = get();
        const base = state.globalSettings;
        
        if (!scenario || !state.scenarioOverrides[scenario]) {
          return base;
        }
        
        return {
          ...base,
          ...state.scenarioOverrides[scenario],
        } as SecurityPreset;
      },
      
      // Detection zone actions
      updateDetectionZone: (zoneId, updates) => {
        set((state) => ({
          detectionZones: state.detectionZones.map((zone) =>
            zone.id === zoneId ? { ...zone, ...updates } : zone
          ),
        }));
      },
      
      addDetectionZone: (zone) => {
        const id = `custom-${Date.now()}`;
        set((state) => ({
          detectionZones: [...state.detectionZones, { ...zone, id }],
        }));
      },
      
      removeDetectionZone: (zoneId) => {
        set((state) => ({
          detectionZones: state.detectionZones.filter((z) => z.id !== zoneId),
        }));
      },
      
      // Audio settings actions
      updateAudioSettings: (settings) => {
        set((state) => ({
          audioSettings: { ...state.audioSettings, ...settings },
        }));
      },
      
      // Timing settings actions
      updateTimingSettings: (settings) => {
        set((state) => ({
          timingSettings: { ...state.timingSettings, ...settings },
        }));
      },

      // Severity cooldown actions
      updateSeverityCooldowns: (cooldowns) => {
        set((state) => ({
          severityCooldowns: { ...state.severityCooldowns, ...cooldowns },
        }));
      },

      getCooldownForSeverity: (severity) => {
        const state = get();
        return state.severityCooldowns[severity];
      },

      // Quiet hours actions
      updateQuietHoursSettings: (settings) => {
        set((state) => ({
          quietHoursSettings: { ...state.quietHoursSettings, ...settings },
        }));
      },

      isQuietHoursActive: () => {
        const state = get();
        const { enabled, startTime, endTime, days } = state.quietHoursSettings;

        if (!enabled) return false;

        const now = new Date();
        const currentDay = now.getDay();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        // Check if today is in the enabled days
        if (!days.includes(currentDay)) return false;

        // Parse start and end times
        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;

        // Handle overnight quiet hours (e.g., 22:00 - 07:00)
        if (startMinutes > endMinutes) {
          // Overnight: active if current time is after start OR before end
          return currentMinutes >= startMinutes || currentMinutes < endMinutes;
        } else {
          // Same day: active if current time is between start and end
          return currentMinutes >= startMinutes && currentMinutes < endMinutes;
        }
      },

      getEffectiveVolume: () => {
        const state = get();

        // Emergency mode always overrides to max
        if (state.emergencyModeActive) return 100;

        // Global mute takes precedence (except emergency)
        if (state.globalMute) return 0;

        // Check quiet hours
        const isQuietHours = get().isQuietHoursActive();
        if (isQuietHours) {
          const { mode, reducedVolume } = state.quietHoursSettings;
          switch (mode) {
            case 'silent':
              return 0;
            case 'reduced':
              return reducedVolume;
            case 'emergency_only':
              return 0; // Non-emergency alerts are silent
          }
        }

        return state.globalSettings.alertVolume;
      },

      // Detection feature settings actions
      updateDetectionFeatureSettings: (settings) => {
        set((state) => ({
          detectionFeatureSettings: { ...state.detectionFeatureSettings, ...settings },
        }));
      },

      // Alert escalation actions
      updateAlertEscalationLevel: (level, updates) => {
        set((state) => {
          const next = state.alertEscalationLevels.map((l) =>
            l.level === level ? { ...l, ...updates, level: l.level } : l
          );
          next.sort((a, b) => a.level - b.level);
          return { alertEscalationLevels: next };
        });
      },

      resetAlertEscalationLevels: () => {
        set({ alertEscalationLevels: [...DEFAULT_ALERT_ESCALATION_LEVELS] });
      },

      // Emergency mode actions
      activateEmergencyMode: (alertId) => {
        set({
          emergencyModeActive: true,
          emergencyAlertId: alertId,
        });
      },
      
      deactivateEmergencyMode: () => {
        set({
          emergencyModeActive: false,
          emergencyAlertId: null,
        });
      },
      
      // Mute actions
      toggleGlobalMute: () => {
        set((state) => ({ globalMute: !state.globalMute }));
      },
      
      setGlobalMute: (muted) => {
        set({ globalMute: muted });
      },
      
      // Custom preset actions
      saveCustomPreset: (name, description) => {
        const state = get();
        const preset: SecurityPreset = {
          ...state.globalSettings,
          id: `custom-${Date.now()}`,
          name,
          description,
        };
        
        set((state) => ({
          customPresets: [...state.customPresets, preset],
        }));
      },
      
      loadCustomPreset: (presetId) => {
        const state = get();
        const preset = state.customPresets.find((p) => p.id === presetId);
        
        if (preset) {
          set({
            activePresetId: 'custom',
            globalSettings: { ...preset },
          });
        }
      },
      
      deleteCustomPreset: (presetId) => {
        set((state) => ({
          customPresets: state.customPresets.filter((p) => p.id !== presetId),
        }));
      },
      
      // Import/Export
      exportSettings: () => {
        const state = get();
        return JSON.stringify({
          activePresetId: state.activePresetId,
          globalSettings: state.globalSettings,
          scenarioOverrides: state.scenarioOverrides,
          detectionZones: state.detectionZones,
          audioSettings: state.audioSettings,
          timingSettings: state.timingSettings,
          severityCooldowns: state.severityCooldowns,
          quietHoursSettings: state.quietHoursSettings,
          detectionFeatureSettings: state.detectionFeatureSettings,
          alertEscalationLevels: state.alertEscalationLevels,
          customPresets: state.customPresets,
        }, null, 2);
      },
      
      importSettings: (json) => {
        try {
          const data = JSON.parse(json);
          set({
            activePresetId: data.activePresetId || 'maximum',
            globalSettings: data.globalSettings || DEFAULT_PRESETS.maximum,
            scenarioOverrides: data.scenarioOverrides || {},
            detectionZones: data.detectionZones || DEFAULT_DETECTION_ZONES,
            audioSettings: data.audioSettings || get().audioSettings,
            timingSettings: data.timingSettings || get().timingSettings,
            severityCooldowns: data.severityCooldowns || get().severityCooldowns,
            quietHoursSettings: data.quietHoursSettings || get().quietHoursSettings,
            detectionFeatureSettings: data.detectionFeatureSettings || get().detectionFeatureSettings,
            alertEscalationLevels: data.alertEscalationLevels || get().alertEscalationLevels,
            customPresets: data.customPresets || [],
          });
          return true;
        } catch {
          return false;
        }
      },
      
      // Reset
      resetToDefaults: () => {
        set({
          settingsSourceId: null,
          activePresetId: 'maximum',
          globalSettings: { ...DEFAULT_PRESETS.maximum },
          activeSleepPreset: null,
          scenarioOverrides: {},
          detectionZones: [...DEFAULT_DETECTION_ZONES],
          audioSettings: {
            frequencyRange: 'all',
            backgroundNoiseFilter: true,
            customLowFreq: 20,
            customHighFreq: 20000,
          },
          timingSettings: {
            cooldownPeriod: 30,
            minimumMotionDuration: 500,
            emergencyEscalationDelay: 300,
          },
          severityCooldowns: {
            info: 5,
            low: 10,
            medium: 30,
            high: 60,
            critical: 0,
          },
          quietHoursSettings: {
            enabled: false,
            startTime: '22:00',
            endTime: '07:00',
            days: [0, 1, 2, 3, 4, 5, 6],
            mode: 'reduced',
            reducedVolume: 30,
          },
          detectionFeatureSettings: {
            personDetectionEnabled: false,
            animalDetectionEnabled: false,
            personConfidenceThreshold: 0.5,
            maxPersonDetections: 10,
            animalConfidenceThreshold: 0.5,
            alertOnLargeAnimals: true,
            alertOnDangerousAnimals: true,
            inactivityMonitoringEnabled: false,
            inactivityAlertMinutes: 10,
            inactivitySeverity: 'medium',
          },
          alertEscalationLevels: [...DEFAULT_ALERT_ESCALATION_LEVELS],
          emergencyModeActive: false,
          emergencyAlertId: null,
          globalMute: false,
          customPresets: [],
        });
      },
    }),
    {
      name: 'safeos-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        settingsSourceId: state.settingsSourceId,
        activePresetId: state.activePresetId,
        activeSleepPreset: state.activeSleepPreset,
        globalSettings: state.globalSettings,
        scenarioOverrides: state.scenarioOverrides,
        detectionZones: state.detectionZones,
        audioSettings: state.audioSettings,
        timingSettings: state.timingSettings,
        severityCooldowns: state.severityCooldowns,
        quietHoursSettings: state.quietHoursSettings,
        detectionFeatureSettings: state.detectionFeatureSettings,
        alertEscalationLevels: state.alertEscalationLevels,
        globalMute: state.globalMute,
        customPresets: state.customPresets,
      }),
    }
  )
);

// =============================================================================
// Helper Hooks
// =============================================================================

export function useCurrentPreset(): SecurityPreset {
  return useSettingsStore((state) => state.globalSettings);
}

export function useEmergencyMode(): { active: boolean; alertId: string | null } {
  return useSettingsStore((state) => ({
    active: state.emergencyModeActive,
    alertId: state.emergencyAlertId,
  }));
}

export function useVolumeOverride(): number {
  const { globalSettings, emergencyModeActive, globalMute } = useSettingsStore();
  
  // Emergency mode always overrides to max
  if (emergencyModeActive) return 100;
  
  // Global mute (except emergency)
  if (globalMute) return 0;
  
  return globalSettings.alertVolume;
}

/**
 * Hook for sleep mode status
 */
export function useSleepMode(): {
  isActive: boolean;
  presetId: SleepPresetId | null;
  preset: SecurityPreset | null;
  activate: (presetId: SleepPresetId) => void;
  deactivate: () => void;
} {
  const { activeSleepPreset, activateSleepMode, deactivateSleepMode } = useSettingsStore();
  
  return {
    isActive: activeSleepPreset !== null,
    presetId: activeSleepPreset,
    preset: activeSleepPreset ? SLEEP_PRESETS[activeSleepPreset] : null,
    activate: activateSleepMode,
    deactivate: deactivateSleepMode,
  };
}

/**
 * Hook for processing mode info
 */
export function useProcessingModeInfo(): {
  mode: ProcessingMode;
  label: string;
  description: string;
  color: 'green' | 'amber' | 'blue';
  isInstant: boolean;
} {
  const { globalSettings } = useSettingsStore();
  return getProcessingModeInfo(globalSettings.processingMode);
}
