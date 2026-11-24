/**
 * Settings Store Tests
 *
 * Unit tests for the settings store, presets, detection zones,
 * and helper functions.
 *
 * @module tests/settings-store.test
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { DEFAULT_PRESETS as STORE_PRESETS } from '@/stores/settings-store';

// =============================================================================
// Types (extracted for testing)
// =============================================================================

type ProcessingMode = 'local' | 'ai_enhanced' | 'hybrid';
type PresetId = 'silent' | 'night' | 'maximum' | 'ultimate' | 'infant_sleep' | 'pet_sleep' | 'deep_sleep_minimal' | 'custom';
type SleepPresetId = 'infant_sleep' | 'pet_sleep' | 'deep_sleep_minimal';
type ScenarioType = 'pet' | 'baby' | 'elderly' | 'security';

interface SecurityPreset {
  id: string;
  name: string;
  description: string;
  motionSensitivity: number;
  audioSensitivity: number;
  pixelThreshold: number;
  absolutePixelThreshold: number;
  analysisInterval: number;
  alertDelay: number;
  alertVolume: number;
  emergencyMode: boolean;
  pixelDetectionEnabled: boolean;
  motionDetectionEnabled: boolean;
  audioDetectionEnabled: boolean;
  processingMode: ProcessingMode;
  useAbsoluteThreshold: boolean;
}

interface DetectionZone {
  id: string;
  name: string;
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AudioSettings {
  frequencyRange: 'all' | 'baby_cry' | 'pet_sounds' | 'elderly_fall' | 'custom';
  backgroundNoiseFilter: boolean;
  customLowFreq: number;
  customHighFreq: number;
}

interface TimingSettings {
  cooldownPeriod: number;
  minimumMotionDuration: number;
  emergencyEscalationDelay: number;
}

// =============================================================================
// Helper Functions (extracted for testing)
// =============================================================================

function isSleepPreset(presetId: PresetId): presetId is SleepPresetId {
  return ['infant_sleep', 'pet_sleep', 'deep_sleep_minimal'].includes(presetId);
}

function getProcessingModeInfo(mode: ProcessingMode): {
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
// Constants (extracted for testing)
// =============================================================================

const DEFAULT_PRESETS: Record<PresetId, SecurityPreset> = {
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
  infant_sleep: {
    id: 'infant_sleep',
    name: 'Infant Sleep Monitor',
    description: 'Ultra-sensitive: 5px movement triggers alert. 100% local, instant response.',
    motionSensitivity: 98,
    audioSensitivity: 95,
    pixelThreshold: 2,
    absolutePixelThreshold: 5,
    analysisInterval: 1,
    alertDelay: 0,
    alertVolume: 100,
    emergencyMode: false,
    pixelDetectionEnabled: true,
    motionDetectionEnabled: true,
    audioDetectionEnabled: true,
    processingMode: 'local',
    useAbsoluteThreshold: true,
  },
  pet_sleep: {
    id: 'pet_sleep',
    name: 'Pet Sleep Monitor',
    description: 'Sensitive: 10px movement triggers alert. For monitoring sleeping pets.',
    motionSensitivity: 90,
    audioSensitivity: 70,
    pixelThreshold: 5,
    absolutePixelThreshold: 10,
    analysisInterval: 2,
    alertDelay: 5,
    alertVolume: 80,
    emergencyMode: false,
    pixelDetectionEnabled: true,
    motionDetectionEnabled: true,
    audioDetectionEnabled: false,
    processingMode: 'local',
    useAbsoluteThreshold: true,
  },
  deep_sleep_minimal: {
    id: 'deep_sleep_minimal',
    name: 'Deep Sleep Ultra-Sensitive',
    description: 'Maximum sensitivity: 3px triggers alert. For critical monitoring.',
    motionSensitivity: 100,
    audioSensitivity: 100,
    pixelThreshold: 1,
    absolutePixelThreshold: 3,
    analysisInterval: 1,
    alertDelay: 0,
    alertVolume: 100,
    emergencyMode: true,
    pixelDetectionEnabled: true,
    motionDetectionEnabled: true,
    audioDetectionEnabled: true,
    processingMode: 'local',
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

const DEFAULT_DETECTION_ZONES: DetectionZone[] = [
  { id: 'full', name: 'Full Screen', enabled: true, x: 0, y: 0, width: 100, height: 100 },
  { id: 'center', name: 'Center Focus', enabled: false, x: 25, y: 25, width: 50, height: 50 },
  { id: 'left', name: 'Left Side', enabled: false, x: 0, y: 0, width: 50, height: 100 },
  { id: 'right', name: 'Right Side', enabled: false, x: 50, y: 0, width: 50, height: 100 },
];

// =============================================================================
// Mock Store Implementation (for testing logic)
// =============================================================================

class SettingsStore {
  activePresetId: PresetId = 'maximum';
  activeSleepPreset: SleepPresetId | null = null;
  globalSettings: SecurityPreset = { ...DEFAULT_PRESETS.maximum };
  scenarioOverrides: Partial<Record<ScenarioType, Partial<SecurityPreset>>> = {};
  detectionZones: DetectionZone[] = [...DEFAULT_DETECTION_ZONES];
  audioSettings: AudioSettings = {
    frequencyRange: 'all',
    backgroundNoiseFilter: true,
    customLowFreq: 20,
    customHighFreq: 20000,
  };
  timingSettings: TimingSettings = {
    cooldownPeriod: 30,
    minimumMotionDuration: 500,
    emergencyEscalationDelay: 300,
  };
  emergencyModeActive: boolean = false;
  emergencyAlertId: string | null = null;
  globalMute: boolean = false;
  customPresets: SecurityPreset[] = [];

  setActivePreset(presetId: PresetId) {
    const preset = presetId === 'custom' ? this.globalSettings : DEFAULT_PRESETS[presetId];
    const sleepPreset = isSleepPreset(presetId) ? presetId : null;
    this.activePresetId = presetId;
    this.activeSleepPreset = sleepPreset;
    this.globalSettings = { ...preset, id: presetId };
  }

  activateSleepMode(sleepPresetId: SleepPresetId) {
    const preset = DEFAULT_PRESETS[sleepPresetId];
    this.activePresetId = sleepPresetId;
    this.activeSleepPreset = sleepPresetId;
    this.globalSettings = { ...preset };
  }

  deactivateSleepMode() {
    this.activePresetId = 'maximum';
    this.activeSleepPreset = null;
    this.globalSettings = { ...DEFAULT_PRESETS.maximum };
  }

  updateGlobalSettings(settings: Partial<SecurityPreset>) {
    this.activePresetId = 'custom';
    this.globalSettings = {
      ...this.globalSettings,
      ...settings,
      id: 'custom',
    };
  }

  setScenarioOverride(scenario: ScenarioType, overrides: Partial<SecurityPreset> | null) {
    if (overrides === null) {
      delete this.scenarioOverrides[scenario];
    } else {
      this.scenarioOverrides[scenario] = overrides;
    }
  }

  getEffectiveSettings(scenario?: ScenarioType): SecurityPreset {
    const base = this.globalSettings;
    if (!scenario || !this.scenarioOverrides[scenario]) {
      return base;
    }
    return { ...base, ...this.scenarioOverrides[scenario] } as SecurityPreset;
  }

  updateDetectionZone(zoneId: string, updates: Partial<DetectionZone>) {
    this.detectionZones = this.detectionZones.map((zone) =>
      zone.id === zoneId ? { ...zone, ...updates } : zone
    );
  }

  addDetectionZone(zone: Omit<DetectionZone, 'id'>) {
    const id = `custom-${Date.now()}`;
    this.detectionZones = [...this.detectionZones, { ...zone, id }];
  }

  removeDetectionZone(zoneId: string) {
    this.detectionZones = this.detectionZones.filter((z) => z.id !== zoneId);
  }

  updateAudioSettings(settings: Partial<AudioSettings>) {
    this.audioSettings = { ...this.audioSettings, ...settings };
  }

  updateTimingSettings(settings: Partial<TimingSettings>) {
    this.timingSettings = { ...this.timingSettings, ...settings };
  }

  activateEmergencyMode(alertId: string) {
    this.emergencyModeActive = true;
    this.emergencyAlertId = alertId;
  }

  deactivateEmergencyMode() {
    this.emergencyModeActive = false;
    this.emergencyAlertId = null;
  }

  toggleGlobalMute() {
    this.globalMute = !this.globalMute;
  }

  setGlobalMute(muted: boolean) {
    this.globalMute = muted;
  }

  saveCustomPreset(name: string, description: string) {
    const preset: SecurityPreset = {
      ...this.globalSettings,
      id: `custom-${Date.now()}`,
      name,
      description,
    };
    this.customPresets = [...this.customPresets, preset];
    return preset.id;
  }

  loadCustomPreset(presetId: string) {
    const preset = this.customPresets.find((p) => p.id === presetId);
    if (preset) {
      this.activePresetId = 'custom';
      this.globalSettings = { ...preset };
      return true;
    }
    return false;
  }

  deleteCustomPreset(presetId: string) {
    this.customPresets = this.customPresets.filter((p) => p.id !== presetId);
  }

  exportSettings(): string {
    return JSON.stringify({
      activePresetId: this.activePresetId,
      globalSettings: this.globalSettings,
      scenarioOverrides: this.scenarioOverrides,
      detectionZones: this.detectionZones,
      audioSettings: this.audioSettings,
      timingSettings: this.timingSettings,
      customPresets: this.customPresets,
    }, null, 2);
  }

  importSettings(json: string): boolean {
    try {
      const data = JSON.parse(json);
      this.activePresetId = data.activePresetId || 'maximum';
      this.globalSettings = data.globalSettings || DEFAULT_PRESETS.maximum;
      this.scenarioOverrides = data.scenarioOverrides || {};
      this.detectionZones = data.detectionZones || [...DEFAULT_DETECTION_ZONES];
      this.audioSettings = data.audioSettings || this.audioSettings;
      this.timingSettings = data.timingSettings || this.timingSettings;
      this.customPresets = data.customPresets || [];
      return true;
    } catch {
      return false;
    }
  }

  resetToDefaults() {
    this.activePresetId = 'maximum';
    this.globalSettings = { ...DEFAULT_PRESETS.maximum };
    this.activeSleepPreset = null;
    this.scenarioOverrides = {};
    this.detectionZones = [...DEFAULT_DETECTION_ZONES];
    this.audioSettings = {
      frequencyRange: 'all',
      backgroundNoiseFilter: true,
      customLowFreq: 20,
      customHighFreq: 20000,
    };
    this.timingSettings = {
      cooldownPeriod: 30,
      minimumMotionDuration: 500,
      emergencyEscalationDelay: 300,
    };
    this.emergencyModeActive = false;
    this.emergencyAlertId = null;
    this.globalMute = false;
    this.customPresets = [];
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('Settings Store', () => {
  describe('isSleepPreset helper', () => {
    it('should return true for sleep presets', () => {
      expect(isSleepPreset('infant_sleep')).toBe(true);
      expect(isSleepPreset('pet_sleep')).toBe(true);
      expect(isSleepPreset('deep_sleep_minimal')).toBe(true);
    });

    it('should return false for non-sleep presets', () => {
      expect(isSleepPreset('silent')).toBe(false);
      expect(isSleepPreset('night')).toBe(false);
      expect(isSleepPreset('maximum')).toBe(false);
      expect(isSleepPreset('ultimate')).toBe(false);
      expect(isSleepPreset('custom')).toBe(false);
    });
  });

  describe('getProcessingModeInfo helper', () => {
    it('should return correct info for local mode', () => {
      const info = getProcessingModeInfo('local');
      expect(info.mode).toBe('local');
      expect(info.label).toBe('LOCAL INSTANT');
      expect(info.color).toBe('green');
      expect(info.isInstant).toBe(true);
      expect(info.description).toContain('on-device');
    });

    it('should return correct info for ai_enhanced mode', () => {
      const info = getProcessingModeInfo('ai_enhanced');
      expect(info.mode).toBe('ai_enhanced');
      expect(info.label).toBe('AI QUEUE');
      expect(info.color).toBe('amber');
      expect(info.isInstant).toBe(false);
      expect(info.description).toContain('queued');
    });

    it('should return correct info for hybrid mode', () => {
      const info = getProcessingModeInfo('hybrid');
      expect(info.mode).toBe('hybrid');
      expect(info.label).toBe('HYBRID');
      expect(info.color).toBe('blue');
      expect(info.isInstant).toBe(true);
      expect(info.description).toContain('local detection');
    });
  });

  describe('DEFAULT_PRESETS', () => {
    it('should have 8 presets', () => {
      expect(Object.keys(DEFAULT_PRESETS)).toHaveLength(8);
    });

    it('should have all required preset IDs', () => {
      const presetIds: PresetId[] = [
        'silent', 'night', 'maximum', 'ultimate',
        'infant_sleep', 'pet_sleep', 'deep_sleep_minimal', 'custom'
      ];
      presetIds.forEach((id) => {
        expect(DEFAULT_PRESETS[id]).toBeDefined();
        expect(DEFAULT_PRESETS[id].id).toBe(id);
      });
    });

    it('should have silent mode with zero volume', () => {
      expect(DEFAULT_PRESETS.silent.alertVolume).toBe(0);
    });

    it('should have night mode with 50% volume', () => {
      expect(DEFAULT_PRESETS.night.alertVolume).toBe(50);
    });

    it('should have ultimate mode with emergency enabled', () => {
      expect(DEFAULT_PRESETS.ultimate.emergencyMode).toBe(true);
    });

    it('should have all sleep presets use local processing', () => {
      expect(DEFAULT_PRESETS.infant_sleep.processingMode).toBe('local');
      expect(DEFAULT_PRESETS.pet_sleep.processingMode).toBe('local');
      expect(DEFAULT_PRESETS.deep_sleep_minimal.processingMode).toBe('local');
    });

    it('should have infant_sleep as most sensitive', () => {
      expect(DEFAULT_PRESETS.infant_sleep.absolutePixelThreshold).toBe(5);
      expect(DEFAULT_PRESETS.infant_sleep.alertDelay).toBe(0);
    });

    it('should have deep_sleep_minimal with emergency mode', () => {
      expect(DEFAULT_PRESETS.deep_sleep_minimal.emergencyMode).toBe(true);
      expect(DEFAULT_PRESETS.deep_sleep_minimal.absolutePixelThreshold).toBe(3);
    });
  });

  describe('DEFAULT_DETECTION_ZONES', () => {
    it('should have 4 default zones', () => {
      expect(DEFAULT_DETECTION_ZONES).toHaveLength(4);
    });

    it('should have full screen zone enabled by default', () => {
      const fullZone = DEFAULT_DETECTION_ZONES.find((z) => z.id === 'full');
      expect(fullZone).toBeDefined();
      expect(fullZone?.enabled).toBe(true);
      expect(fullZone?.width).toBe(100);
      expect(fullZone?.height).toBe(100);
    });

    it('should have other zones disabled by default', () => {
      const otherZones = DEFAULT_DETECTION_ZONES.filter((z) => z.id !== 'full');
      otherZones.forEach((zone) => {
        expect(zone.enabled).toBe(false);
      });
    });

    it('should have center zone at 25,25 with 50x50 size', () => {
      const centerZone = DEFAULT_DETECTION_ZONES.find((z) => z.id === 'center');
      expect(centerZone?.x).toBe(25);
      expect(centerZone?.y).toBe(25);
      expect(centerZone?.width).toBe(50);
      expect(centerZone?.height).toBe(50);
    });
  });

  describe('Preset Switching', () => {
    let store: SettingsStore;

    beforeEach(() => {
      store = new SettingsStore();
    });

    it('should start with maximum preset', () => {
      expect(store.activePresetId).toBe('maximum');
      expect(store.globalSettings.motionSensitivity).toBe(80);
    });

    it('should switch to silent preset', () => {
      store.setActivePreset('silent');
      expect(store.activePresetId).toBe('silent');
      expect(store.globalSettings.alertVolume).toBe(0);
      expect(store.activeSleepPreset).toBeNull();
    });

    it('should switch to night preset', () => {
      store.setActivePreset('night');
      expect(store.activePresetId).toBe('night');
      expect(store.globalSettings.alertVolume).toBe(50);
    });

    it('should track sleep preset when switching to sleep mode', () => {
      store.setActivePreset('infant_sleep');
      expect(store.activePresetId).toBe('infant_sleep');
      expect(store.activeSleepPreset).toBe('infant_sleep');
    });

    it('should preserve custom settings when switching to custom', () => {
      store.updateGlobalSettings({ motionSensitivity: 75 });
      store.setActivePreset('custom');
      expect(store.globalSettings.motionSensitivity).toBe(75);
    });
  });

  describe('Sleep Mode', () => {
    let store: SettingsStore;

    beforeEach(() => {
      store = new SettingsStore();
    });

    it('should activate infant sleep mode', () => {
      store.activateSleepMode('infant_sleep');
      expect(store.activePresetId).toBe('infant_sleep');
      expect(store.activeSleepPreset).toBe('infant_sleep');
      expect(store.globalSettings.absolutePixelThreshold).toBe(5);
    });

    it('should activate pet sleep mode', () => {
      store.activateSleepMode('pet_sleep');
      expect(store.activeSleepPreset).toBe('pet_sleep');
      expect(store.globalSettings.audioDetectionEnabled).toBe(false);
    });

    it('should deactivate sleep mode and reset to maximum', () => {
      store.activateSleepMode('infant_sleep');
      store.deactivateSleepMode();
      expect(store.activePresetId).toBe('maximum');
      expect(store.activeSleepPreset).toBeNull();
      expect(store.globalSettings.motionSensitivity).toBe(80);
    });
  });

  describe('Global Settings Updates', () => {
    let store: SettingsStore;

    beforeEach(() => {
      store = new SettingsStore();
    });

    it('should update motion sensitivity and switch to custom', () => {
      store.updateGlobalSettings({ motionSensitivity: 65 });
      expect(store.activePresetId).toBe('custom');
      expect(store.globalSettings.motionSensitivity).toBe(65);
    });

    it('should preserve other settings when updating', () => {
      const originalAudio = store.globalSettings.audioSensitivity;
      store.updateGlobalSettings({ motionSensitivity: 65 });
      expect(store.globalSettings.audioSensitivity).toBe(originalAudio);
    });

    it('should update multiple settings at once', () => {
      store.updateGlobalSettings({
        motionSensitivity: 90,
        audioSensitivity: 85,
        emergencyMode: true,
      });
      expect(store.globalSettings.motionSensitivity).toBe(90);
      expect(store.globalSettings.audioSensitivity).toBe(85);
      expect(store.globalSettings.emergencyMode).toBe(true);
    });
  });

  describe('Scenario Overrides', () => {
    let store: SettingsStore;

    beforeEach(() => {
      store = new SettingsStore();
    });

    it('should set scenario override', () => {
      store.setScenarioOverride('baby', { motionSensitivity: 95 });
      expect(store.scenarioOverrides.baby?.motionSensitivity).toBe(95);
    });

    it('should get effective settings without override', () => {
      const settings = store.getEffectiveSettings();
      expect(settings.motionSensitivity).toBe(80); // maximum preset default
    });

    it('should get effective settings with override', () => {
      store.setScenarioOverride('baby', { motionSensitivity: 95 });
      const settings = store.getEffectiveSettings('baby');
      expect(settings.motionSensitivity).toBe(95);
    });

    it('should merge override with base settings', () => {
      store.setScenarioOverride('pet', { alertVolume: 50 });
      const settings = store.getEffectiveSettings('pet');
      expect(settings.alertVolume).toBe(50);
      expect(settings.motionSensitivity).toBe(80); // from base
    });

    it('should remove scenario override when set to null', () => {
      store.setScenarioOverride('elderly', { alertDelay: 60 });
      store.setScenarioOverride('elderly', null);
      expect(store.scenarioOverrides.elderly).toBeUndefined();
    });
  });

  describe('Detection Zones', () => {
    let store: SettingsStore;

    beforeEach(() => {
      store = new SettingsStore();
    });

    it('should update detection zone', () => {
      store.updateDetectionZone('center', { enabled: true });
      const zone = store.detectionZones.find((z) => z.id === 'center');
      expect(zone?.enabled).toBe(true);
    });

    it('should add new detection zone', () => {
      store.addDetectionZone({
        name: 'Test Zone',
        enabled: true,
        x: 10,
        y: 10,
        width: 30,
        height: 30,
      });
      expect(store.detectionZones).toHaveLength(5);
      const newZone = store.detectionZones.find((z) => z.name === 'Test Zone');
      expect(newZone).toBeDefined();
      expect(newZone?.id).toContain('custom-');
    });

    it('should remove detection zone', () => {
      store.removeDetectionZone('left');
      expect(store.detectionZones).toHaveLength(3);
      expect(store.detectionZones.find((z) => z.id === 'left')).toBeUndefined();
    });

    it('should preserve other zones when removing', () => {
      store.removeDetectionZone('left');
      expect(store.detectionZones.find((z) => z.id === 'full')).toBeDefined();
      expect(store.detectionZones.find((z) => z.id === 'center')).toBeDefined();
    });
  });

  describe('Audio Settings', () => {
    let store: SettingsStore;

    beforeEach(() => {
      store = new SettingsStore();
    });

    it('should have default audio settings', () => {
      expect(store.audioSettings.frequencyRange).toBe('all');
      expect(store.audioSettings.backgroundNoiseFilter).toBe(true);
    });

    it('should update frequency range', () => {
      store.updateAudioSettings({ frequencyRange: 'baby_cry' });
      expect(store.audioSettings.frequencyRange).toBe('baby_cry');
    });

    it('should update custom frequency range', () => {
      store.updateAudioSettings({
        frequencyRange: 'custom',
        customLowFreq: 300,
        customHighFreq: 3000,
      });
      expect(store.audioSettings.frequencyRange).toBe('custom');
      expect(store.audioSettings.customLowFreq).toBe(300);
      expect(store.audioSettings.customHighFreq).toBe(3000);
    });

    it('should toggle background noise filter', () => {
      store.updateAudioSettings({ backgroundNoiseFilter: false });
      expect(store.audioSettings.backgroundNoiseFilter).toBe(false);
    });
  });

  describe('Timing Settings', () => {
    let store: SettingsStore;

    beforeEach(() => {
      store = new SettingsStore();
    });

    it('should have default timing settings', () => {
      expect(store.timingSettings.cooldownPeriod).toBe(30);
      expect(store.timingSettings.minimumMotionDuration).toBe(500);
      expect(store.timingSettings.emergencyEscalationDelay).toBe(300);
    });

    it('should update cooldown period', () => {
      store.updateTimingSettings({ cooldownPeriod: 60 });
      expect(store.timingSettings.cooldownPeriod).toBe(60);
    });

    it('should update minimum motion duration', () => {
      store.updateTimingSettings({ minimumMotionDuration: 1000 });
      expect(store.timingSettings.minimumMotionDuration).toBe(1000);
    });
  });

  describe('Emergency Mode', () => {
    let store: SettingsStore;

    beforeEach(() => {
      store = new SettingsStore();
    });

    it('should start with emergency mode inactive', () => {
      expect(store.emergencyModeActive).toBe(false);
      expect(store.emergencyAlertId).toBeNull();
    });

    it('should activate emergency mode with alert ID', () => {
      store.activateEmergencyMode('alert-123');
      expect(store.emergencyModeActive).toBe(true);
      expect(store.emergencyAlertId).toBe('alert-123');
    });

    it('should deactivate emergency mode', () => {
      store.activateEmergencyMode('alert-123');
      store.deactivateEmergencyMode();
      expect(store.emergencyModeActive).toBe(false);
      expect(store.emergencyAlertId).toBeNull();
    });
  });

  describe('Global Mute', () => {
    let store: SettingsStore;

    beforeEach(() => {
      store = new SettingsStore();
    });

    it('should start unmuted', () => {
      expect(store.globalMute).toBe(false);
    });

    it('should toggle mute on', () => {
      store.toggleGlobalMute();
      expect(store.globalMute).toBe(true);
    });

    it('should toggle mute off', () => {
      store.toggleGlobalMute();
      store.toggleGlobalMute();
      expect(store.globalMute).toBe(false);
    });

    it('should set mute directly', () => {
      store.setGlobalMute(true);
      expect(store.globalMute).toBe(true);
      store.setGlobalMute(false);
      expect(store.globalMute).toBe(false);
    });
  });

  describe('Custom Presets', () => {
    let store: SettingsStore;

    beforeEach(() => {
      store = new SettingsStore();
    });

    it('should start with no custom presets', () => {
      expect(store.customPresets).toHaveLength(0);
    });

    it('should save current settings as custom preset', () => {
      store.updateGlobalSettings({ motionSensitivity: 75 });
      store.saveCustomPreset('My Preset', 'Description');
      expect(store.customPresets).toHaveLength(1);
      expect(store.customPresets[0].name).toBe('My Preset');
      expect(store.customPresets[0].motionSensitivity).toBe(75);
    });

    it('should load custom preset', () => {
      store.updateGlobalSettings({ motionSensitivity: 75 });
      store.saveCustomPreset('My Preset', 'Description');
      const presetId = store.customPresets[0].id;

      store.setActivePreset('silent'); // Change to different preset
      store.loadCustomPreset(presetId);

      expect(store.activePresetId).toBe('custom');
      expect(store.globalSettings.motionSensitivity).toBe(75);
    });

    it('should return false when loading non-existent preset', () => {
      const result = store.loadCustomPreset('non-existent');
      expect(result).toBe(false);
    });

    it('should delete custom preset', () => {
      store.saveCustomPreset('My Preset', 'Description');
      const presetId = store.customPresets[0].id;
      store.deleteCustomPreset(presetId);
      expect(store.customPresets).toHaveLength(0);
    });
  });

  describe('Import/Export', () => {
    let store: SettingsStore;

    beforeEach(() => {
      store = new SettingsStore();
    });

    it('should export settings as JSON', () => {
      const json = store.exportSettings();
      const data = JSON.parse(json);
      expect(data.activePresetId).toBe('maximum');
      expect(data.globalSettings).toBeDefined();
      expect(data.detectionZones).toHaveLength(4);
    });

    it('should import valid settings', () => {
      const settings = {
        activePresetId: 'silent',
        globalSettings: { ...DEFAULT_PRESETS.silent },
        scenarioOverrides: { baby: { alertVolume: 80 } },
        detectionZones: [],
        audioSettings: { frequencyRange: 'baby_cry' },
        timingSettings: { cooldownPeriod: 45 },
        customPresets: [],
      };

      const result = store.importSettings(JSON.stringify(settings));
      expect(result).toBe(true);
      expect(store.activePresetId).toBe('silent');
      expect(store.scenarioOverrides.baby?.alertVolume).toBe(80);
    });

    it('should return false for invalid JSON', () => {
      const result = store.importSettings('invalid json');
      expect(result).toBe(false);
    });

    it('should use defaults for missing fields during import', () => {
      const result = store.importSettings('{}');
      expect(result).toBe(true);
      expect(store.activePresetId).toBe('maximum');
    });
  });

  describe('Reset to Defaults', () => {
    let store: SettingsStore;

    beforeEach(() => {
      store = new SettingsStore();
    });

    it('should reset all settings to defaults', () => {
      // Modify various settings
      store.setActivePreset('silent');
      store.setScenarioOverride('baby', { alertVolume: 90 });
      store.updateAudioSettings({ frequencyRange: 'baby_cry' });
      store.activateEmergencyMode('alert-123');
      store.setGlobalMute(true);
      store.saveCustomPreset('My Preset', 'Description');

      // Reset
      store.resetToDefaults();

      // Verify all reset
      expect(store.activePresetId).toBe('maximum');
      expect(store.activeSleepPreset).toBeNull();
      expect(store.scenarioOverrides).toEqual({});
      expect(store.audioSettings.frequencyRange).toBe('all');
      expect(store.emergencyModeActive).toBe(false);
      expect(store.globalMute).toBe(false);
      expect(store.customPresets).toHaveLength(0);
      expect(store.detectionZones).toHaveLength(4);
    });
  });

  describe('Volume Override Logic', () => {
    it('should calculate volume correctly with mute', () => {
      const getVolume = (
        settings: SecurityPreset,
        emergencyModeActive: boolean,
        globalMute: boolean
      ): number => {
        if (emergencyModeActive) return 100;
        if (globalMute) return 0;
        return settings.alertVolume;
      };

      // Normal operation
      expect(getVolume(DEFAULT_PRESETS.maximum, false, false)).toBe(100);

      // Muted
      expect(getVolume(DEFAULT_PRESETS.maximum, false, true)).toBe(0);

      // Emergency mode overrides mute
      expect(getVolume(DEFAULT_PRESETS.silent, true, true)).toBe(100);

      // Silent preset without mute
      expect(getVolume(DEFAULT_PRESETS.silent, false, false)).toBe(0);
    });
  });

  describe('Preset Validation', () => {
    it('should have valid sensitivity ranges for all presets', () => {
      Object.values(DEFAULT_PRESETS).forEach((preset) => {
        expect(preset.motionSensitivity).toBeGreaterThanOrEqual(0);
        expect(preset.motionSensitivity).toBeLessThanOrEqual(100);
        expect(preset.audioSensitivity).toBeGreaterThanOrEqual(0);
        expect(preset.audioSensitivity).toBeLessThanOrEqual(100);
      });
    });

    it('should have valid volume ranges for all presets', () => {
      Object.values(DEFAULT_PRESETS).forEach((preset) => {
        expect(preset.alertVolume).toBeGreaterThanOrEqual(0);
        expect(preset.alertVolume).toBeLessThanOrEqual(100);
      });
    });

    it('should have valid analysis intervals for all presets', () => {
      Object.values(DEFAULT_PRESETS).forEach((preset) => {
        expect(preset.analysisInterval).toBeGreaterThanOrEqual(1);
        expect(preset.analysisInterval).toBeLessThanOrEqual(60);
      });
    });

    it('should have valid alert delays for all presets', () => {
      Object.values(DEFAULT_PRESETS).forEach((preset) => {
        expect(preset.alertDelay).toBeGreaterThanOrEqual(0);
        expect(preset.alertDelay).toBeLessThanOrEqual(300);
      });
    });
  });
});

describe('the presets the watch offers', () => {
  it('names no interval in a preset description', () => {
    for (const preset of Object.values(STORE_PRESETS)) expect(preset.description).not.toMatch(/interval/i);
  });
});
