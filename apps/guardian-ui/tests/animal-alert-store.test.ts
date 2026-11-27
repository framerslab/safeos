/**
 * Animal Alert Store Tests
 *
 * Unit tests for animal/wildlife detection settings and history management.
 *
 * @module tests/animal-alert-store.test
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// =============================================================================
// Types (extracted from store and animal-detection)
// =============================================================================

type SizeCategory = 'small' | 'medium' | 'large';
type DangerLevel = 'none' | 'low' | 'medium' | 'high' | 'extreme';
type AlertMode = 'voice' | 'sound' | 'both' | 'silent';

interface AnimalDetection {
  id: string;
  timestamp: number;
  animalType: string;
  confidence: number;
  sizeCategory: SizeCategory;
  dangerLevel: DangerLevel;
  boundingBox: { x: number; y: number; width: number; height: number };
  frame?: string;
}

interface DetectionHistoryEntry extends AnimalDetection {
  acknowledged: boolean;
  notes: string;
  exported: boolean;
}

interface AnimalAlertSettings {
  largeAnimalAlertEnabled: boolean;
  smallAnimalAlertEnabled: boolean;
  mediumAnimalAlertEnabled: boolean;
  dangerAlertEnabled: boolean;
  cautionAlertEnabled: boolean;
  alertMode: AlertMode;
  alertVolume: number;
  voiceRate: number;
  confidenceThreshold: number;
  motionThreshold: number;
  browserNotifications: boolean;
  flashScreen: boolean;
  captureFrames: boolean;
  maxStoredFrames: number;
}

// =============================================================================
// Constants (extracted from store)
// =============================================================================

const DEFAULT_ANIMAL_SETTINGS: AnimalAlertSettings = {
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
};

// =============================================================================
// Helper Functions (extracted from store)
// =============================================================================

function shouldAlert(
  detection: AnimalDetection,
  settings: AnimalAlertSettings
): boolean {
  if (detection.sizeCategory === 'large' && !settings.largeAnimalAlertEnabled) {
    return false;
  }
  if (detection.sizeCategory === 'small' && !settings.smallAnimalAlertEnabled) {
    return false;
  }
  if (detection.sizeCategory === 'medium' && !settings.mediumAnimalAlertEnabled) {
    return false;
  }

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

function getAlertPriority(detection: AnimalDetection): number {
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

function sortByPriority(detections: AnimalDetection[]): AnimalDetection[] {
  return [...detections].sort((a, b) => getAlertPriority(b) - getAlertPriority(a));
}

// =============================================================================
// Mock Store Class
// =============================================================================

class AnimalAlertStore {
  settings: AnimalAlertSettings = { ...DEFAULT_ANIMAL_SETTINGS };
  isMonitoring: boolean = false;
  lastDetectionTime: number | null = null;
  currentDetections: AnimalDetection[] = [];
  detectionHistory: DetectionHistoryEntry[] = [];
  totalDetections: number = 0;
  sizeFilter: SizeCategory[] = ['small', 'medium', 'large'];
  dangerFilter: DangerLevel[] = ['none', 'low', 'medium', 'high', 'extreme'];

  updateSettings(update: Partial<AnimalAlertSettings>): void {
    this.settings = { ...this.settings, ...update };
  }

  setMonitoring(monitoring: boolean): void {
    this.isMonitoring = monitoring;
  }

  addDetection(detection: AnimalDetection): void {
    const entry: DetectionHistoryEntry = {
      ...detection,
      acknowledged: false,
      notes: '',
      exported: false,
    };

    this.detectionHistory = [entry, ...this.detectionHistory].slice(
      0,
      this.settings.maxStoredFrames
    );
    this.currentDetections = [...this.currentDetections, detection];
    this.lastDetectionTime = Date.now();
    this.totalDetections += 1;
  }

  addDetections(detections: AnimalDetection[]): void {
    const entries: DetectionHistoryEntry[] = detections.map((d) => ({
      ...d,
      acknowledged: false,
      notes: '',
      exported: false,
    }));

    this.detectionHistory = [...entries, ...this.detectionHistory].slice(
      0,
      this.settings.maxStoredFrames
    );
    this.currentDetections = [...this.currentDetections, ...detections];
    this.lastDetectionTime = Date.now();
    this.totalDetections += detections.length;
  }

  clearCurrentDetections(): void {
    this.currentDetections = [];
  }

  acknowledgeDetection(id: string): void {
    this.detectionHistory = this.detectionHistory.map((d) =>
      d.id === id ? { ...d, acknowledged: true } : d
    );
  }

  updateDetectionNotes(id: string, notes: string): void {
    this.detectionHistory = this.detectionHistory.map((d) =>
      d.id === id ? { ...d, notes } : d
    );
  }

  deleteDetection(id: string): void {
    this.detectionHistory = this.detectionHistory.filter((d) => d.id !== id);
  }

  clearHistory(): void {
    this.detectionHistory = [];
    this.totalDetections = 0;
  }

  setSizeFilter(sizes: SizeCategory[]): void {
    this.sizeFilter = sizes;
  }

  setDangerFilter(levels: DangerLevel[]): void {
    this.dangerFilter = levels;
  }

  getFilteredHistory(): DetectionHistoryEntry[] {
    return this.detectionHistory.filter(
      (d) => this.sizeFilter.includes(d.sizeCategory) && this.dangerFilter.includes(d.dangerLevel)
    );
  }

  getLargeAnimalCount(): number {
    return this.detectionHistory.filter((d) => d.sizeCategory === 'large').length;
  }

  getSmallAnimalCount(): number {
    return this.detectionHistory.filter((d) => d.sizeCategory === 'small').length;
  }

  getDangerousCount(): number {
    return this.detectionHistory.filter(
      (d) => d.dangerLevel === 'high' || d.dangerLevel === 'extreme'
    ).length;
  }

  reset(): void {
    this.isMonitoring = false;
    this.lastDetectionTime = null;
    this.currentDetections = [];
  }
}

// =============================================================================
// Selectors (extracted from store)
// =============================================================================

const selectSettings = (state: AnimalAlertStore) => state.settings;
const selectIsMonitoring = (state: AnimalAlertStore) => state.isMonitoring;
const selectCurrentDetections = (state: AnimalAlertStore) => state.currentDetections;
const selectDetectionHistory = (state: AnimalAlertStore) => state.detectionHistory;

const selectUnacknowledgedCount = (state: AnimalAlertStore) =>
  state.detectionHistory.filter((d) => !d.acknowledged).length;

const selectRecentDetections = (state: AnimalAlertStore, limit = 10) =>
  state.detectionHistory.slice(0, limit);

const selectDangerousDetections = (state: AnimalAlertStore) =>
  state.detectionHistory.filter(
    (d) => d.dangerLevel === 'high' || d.dangerLevel === 'extreme'
  );

const selectLargeAnimals = (state: AnimalAlertStore) =>
  state.detectionHistory.filter((d) => d.sizeCategory === 'large');

const selectSmallAnimals = (state: AnimalAlertStore) =>
  state.detectionHistory.filter((d) => d.sizeCategory === 'small');

// =============================================================================
// Test Fixtures
// =============================================================================

function createDetection(overrides: Partial<AnimalDetection> = {}): AnimalDetection {
  return {
    id: `det-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    animalType: 'dog',
    confidence: 0.85,
    sizeCategory: 'medium',
    dangerLevel: 'low',
    boundingBox: { x: 100, y: 100, width: 200, height: 150 },
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('Animal Alert Store', () => {
  let store: AnimalAlertStore;

  beforeEach(() => {
    store = new AnimalAlertStore();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  describe('DEFAULT_ANIMAL_SETTINGS', () => {
    it('should enable all size alerts by default', () => {
      expect(DEFAULT_ANIMAL_SETTINGS.largeAnimalAlertEnabled).toBe(true);
      expect(DEFAULT_ANIMAL_SETTINGS.smallAnimalAlertEnabled).toBe(true);
      expect(DEFAULT_ANIMAL_SETTINGS.mediumAnimalAlertEnabled).toBe(true);
    });

    it('should enable danger and caution alerts by default', () => {
      expect(DEFAULT_ANIMAL_SETTINGS.dangerAlertEnabled).toBe(true);
      expect(DEFAULT_ANIMAL_SETTINGS.cautionAlertEnabled).toBe(true);
    });

    it('should use voice as default alert mode', () => {
      expect(DEFAULT_ANIMAL_SETTINGS.alertMode).toBe('voice');
    });

    it('should have sensible volume defaults', () => {
      expect(DEFAULT_ANIMAL_SETTINGS.alertVolume).toBe(80);
      expect(DEFAULT_ANIMAL_SETTINGS.voiceRate).toBe(1.0);
    });

    it('should have default confidence threshold of 0.5', () => {
      expect(DEFAULT_ANIMAL_SETTINGS.confidenceThreshold).toBe(0.5);
    });

    it('should have default motion threshold of 15', () => {
      expect(DEFAULT_ANIMAL_SETTINGS.motionThreshold).toBe(15);
    });

    it('should enable browser notifications by default', () => {
      expect(DEFAULT_ANIMAL_SETTINGS.browserNotifications).toBe(true);
    });

    it('should enable flash screen by default', () => {
      expect(DEFAULT_ANIMAL_SETTINGS.flashScreen).toBe(true);
    });

    it('should enable frame capture by default', () => {
      expect(DEFAULT_ANIMAL_SETTINGS.captureFrames).toBe(true);
    });

    it('should have max stored frames of 100', () => {
      expect(DEFAULT_ANIMAL_SETTINGS.maxStoredFrames).toBe(100);
    });

  });

  describe('shouldAlert', () => {
    describe('size-based filtering', () => {
      it('should not alert for large animals when disabled', () => {
        const detection = createDetection({ sizeCategory: 'large' });
        const settings = { ...DEFAULT_ANIMAL_SETTINGS, largeAnimalAlertEnabled: false };
        expect(shouldAlert(detection, settings)).toBe(false);
      });

      it('should not alert for small animals when disabled', () => {
        const detection = createDetection({ sizeCategory: 'small' });
        const settings = { ...DEFAULT_ANIMAL_SETTINGS, smallAnimalAlertEnabled: false };
        expect(shouldAlert(detection, settings)).toBe(false);
      });

      it('should not alert for medium animals when disabled', () => {
        const detection = createDetection({ sizeCategory: 'medium' });
        const settings = { ...DEFAULT_ANIMAL_SETTINGS, mediumAnimalAlertEnabled: false };
        expect(shouldAlert(detection, settings)).toBe(false);
      });

      it('should alert for all sizes when enabled', () => {
        const sizes: SizeCategory[] = ['small', 'medium', 'large'];
        sizes.forEach((size) => {
          const detection = createDetection({ sizeCategory: size });
          expect(shouldAlert(detection, DEFAULT_ANIMAL_SETTINGS)).toBe(true);
        });
      });
    });

    describe('danger-based filtering', () => {
      it('should not alert for dangerous animals when danger disabled', () => {
        const detection = createDetection({ dangerLevel: 'high' });
        const settings = { ...DEFAULT_ANIMAL_SETTINGS, dangerAlertEnabled: false };
        expect(shouldAlert(detection, settings)).toBe(false);
      });

      it('should not alert for extreme danger when danger disabled', () => {
        const detection = createDetection({ dangerLevel: 'extreme' });
        const settings = { ...DEFAULT_ANIMAL_SETTINGS, dangerAlertEnabled: false };
        expect(shouldAlert(detection, settings)).toBe(false);
      });

      it('should not alert for medium danger when caution disabled', () => {
        const detection = createDetection({ dangerLevel: 'medium' });
        const settings = { ...DEFAULT_ANIMAL_SETTINGS, cautionAlertEnabled: false };
        expect(shouldAlert(detection, settings)).toBe(false);
      });

      it('should alert for low danger regardless of caution setting', () => {
        const detection = createDetection({ dangerLevel: 'low' });
        const settings = { ...DEFAULT_ANIMAL_SETTINGS, cautionAlertEnabled: false };
        expect(shouldAlert(detection, settings)).toBe(true);
      });

      it('should alert for no danger regardless of settings', () => {
        const detection = createDetection({ dangerLevel: 'none' });
        const settings = {
          ...DEFAULT_ANIMAL_SETTINGS,
          dangerAlertEnabled: false,
          cautionAlertEnabled: false,
        };
        expect(shouldAlert(detection, settings)).toBe(true);
      });
    });

    it('should alert when all settings enabled', () => {
      const detection = createDetection();
      expect(shouldAlert(detection, DEFAULT_ANIMAL_SETTINGS)).toBe(true);
    });
  });

  describe('getAlertPriority', () => {
    it('should give highest priority to extreme danger', () => {
      const extreme = createDetection({ dangerLevel: 'extreme', sizeCategory: 'large' });
      expect(getAlertPriority(extreme)).toBe(130); // 100 + 30
    });

    it('should give high priority to high danger', () => {
      const high = createDetection({ dangerLevel: 'high', sizeCategory: 'large' });
      expect(getAlertPriority(high)).toBe(110); // 80 + 30
    });

    it('should give medium priority to medium danger', () => {
      const medium = createDetection({ dangerLevel: 'medium', sizeCategory: 'medium' });
      expect(getAlertPriority(medium)).toBe(70); // 50 + 20
    });

    it('should give low priority to low danger', () => {
      const low = createDetection({ dangerLevel: 'low', sizeCategory: 'small' });
      expect(getAlertPriority(low)).toBe(30); // 20 + 10
    });

    it('should give lowest priority to no danger small animal', () => {
      const none = createDetection({ dangerLevel: 'none', sizeCategory: 'small' });
      expect(getAlertPriority(none)).toBe(10); // 0 + 10
    });

    it('should add size weight correctly', () => {
      const large = createDetection({ dangerLevel: 'none', sizeCategory: 'large' });
      const medium = createDetection({ dangerLevel: 'none', sizeCategory: 'medium' });
      const small = createDetection({ dangerLevel: 'none', sizeCategory: 'small' });

      expect(getAlertPriority(large)).toBe(30);
      expect(getAlertPriority(medium)).toBe(20);
      expect(getAlertPriority(small)).toBe(10);
    });
  });

  describe('sortByPriority', () => {
    it('should sort detections by priority descending', () => {
      const low = createDetection({ id: 'low', dangerLevel: 'low', sizeCategory: 'small' });
      const high = createDetection({ id: 'high', dangerLevel: 'high', sizeCategory: 'large' });
      const medium = createDetection({ id: 'medium', dangerLevel: 'medium', sizeCategory: 'medium' });

      const sorted = sortByPriority([low, high, medium]);

      expect(sorted[0].id).toBe('high');
      expect(sorted[1].id).toBe('medium');
      expect(sorted[2].id).toBe('low');
    });

    it('should not mutate original array', () => {
      const original = [
        createDetection({ id: '1', dangerLevel: 'low' }),
        createDetection({ id: '2', dangerLevel: 'high' }),
      ];
      const originalOrder = [...original];

      sortByPriority(original);

      expect(original[0].id).toBe(originalOrder[0].id);
      expect(original[1].id).toBe(originalOrder[1].id);
    });

    it('should handle empty array', () => {
      expect(sortByPriority([])).toEqual([]);
    });

    it('should handle single element', () => {
      const detection = createDetection();
      expect(sortByPriority([detection])).toEqual([detection]);
    });
  });

  describe('Initial State', () => {
    it('should have default settings', () => {
      expect(store.settings).toEqual(DEFAULT_ANIMAL_SETTINGS);
    });

    it('should not be monitoring initially', () => {
      expect(store.isMonitoring).toBe(false);
    });

    it('should have null last detection time', () => {
      expect(store.lastDetectionTime).toBeNull();
    });

    it('should have empty current detections', () => {
      expect(store.currentDetections).toEqual([]);
    });

    it('should have empty detection history', () => {
      expect(store.detectionHistory).toEqual([]);
    });

    it('should have zero total detections', () => {
      expect(store.totalDetections).toBe(0);
    });

    it('should have all sizes in filter', () => {
      expect(store.sizeFilter).toEqual(['small', 'medium', 'large']);
    });

    it('should have all danger levels in filter', () => {
      expect(store.dangerFilter).toEqual(['none', 'low', 'medium', 'high', 'extreme']);
    });
  });

  describe('updateSettings', () => {
    it('should update single setting', () => {
      store.updateSettings({ alertVolume: 50 });
      expect(store.settings.alertVolume).toBe(50);
    });

    it('should update multiple settings', () => {
      store.updateSettings({
        alertVolume: 60,
        voiceRate: 1.5,
        alertMode: 'sound',
      });
      expect(store.settings.alertVolume).toBe(60);
      expect(store.settings.voiceRate).toBe(1.5);
      expect(store.settings.alertMode).toBe('sound');
    });

    it('should preserve other settings', () => {
      store.updateSettings({ alertVolume: 50 });
      expect(store.settings.largeAnimalAlertEnabled).toBe(true);
      expect(store.settings.browserNotifications).toBe(true);
    });

    it('should disable size-based alerts', () => {
      store.updateSettings({
        largeAnimalAlertEnabled: false,
        smallAnimalAlertEnabled: false,
      });
      expect(store.settings.largeAnimalAlertEnabled).toBe(false);
      expect(store.settings.smallAnimalAlertEnabled).toBe(false);
    });
  });

  describe('setMonitoring', () => {
    it('should enable monitoring', () => {
      store.setMonitoring(true);
      expect(store.isMonitoring).toBe(true);
    });

    it('should disable monitoring', () => {
      store.setMonitoring(true);
      store.setMonitoring(false);
      expect(store.isMonitoring).toBe(false);
    });
  });

  describe('addDetection', () => {
    it('should add detection to current detections', () => {
      const detection = createDetection();
      store.addDetection(detection);
      expect(store.currentDetections).toContainEqual(detection);
    });

    it('should add detection to history', () => {
      const detection = createDetection();
      store.addDetection(detection);
      expect(store.detectionHistory[0].id).toBe(detection.id);
    });

    it('should set acknowledged to false', () => {
      const detection = createDetection();
      store.addDetection(detection);
      expect(store.detectionHistory[0].acknowledged).toBe(false);
    });

    it('should set empty notes', () => {
      const detection = createDetection();
      store.addDetection(detection);
      expect(store.detectionHistory[0].notes).toBe('');
    });

    it('should set exported to false', () => {
      const detection = createDetection();
      store.addDetection(detection);
      expect(store.detectionHistory[0].exported).toBe(false);
    });

    it('should update last detection time', () => {
      store.addDetection(createDetection());
      expect(store.lastDetectionTime).toBe(Date.now());
    });

    it('should increment total detections', () => {
      store.addDetection(createDetection());
      store.addDetection(createDetection());
      expect(store.totalDetections).toBe(2);
    });

    it('should limit history to maxStoredFrames', () => {
      store.updateSettings({ maxStoredFrames: 5 });

      for (let i = 0; i < 10; i++) {
        store.addDetection(createDetection({ id: `det-${i}` }));
      }

      expect(store.detectionHistory).toHaveLength(5);
    });

    it('should keep most recent detections when limiting', () => {
      store.updateSettings({ maxStoredFrames: 3 });

      store.addDetection(createDetection({ id: 'first' }));
      store.addDetection(createDetection({ id: 'second' }));
      store.addDetection(createDetection({ id: 'third' }));
      store.addDetection(createDetection({ id: 'fourth' }));

      expect(store.detectionHistory[0].id).toBe('fourth');
      expect(store.detectionHistory.find((d) => d.id === 'first')).toBeUndefined();
    });
  });

  describe('addDetections', () => {
    it('should add multiple detections', () => {
      const detections = [createDetection({ id: '1' }), createDetection({ id: '2' })];
      store.addDetections(detections);
      expect(store.currentDetections).toHaveLength(2);
      expect(store.detectionHistory).toHaveLength(2);
    });

    it('should increment total by batch size', () => {
      const detections = [
        createDetection({ id: '1' }),
        createDetection({ id: '2' }),
        createDetection({ id: '3' }),
      ];
      store.addDetections(detections);
      expect(store.totalDetections).toBe(3);
    });
  });

  describe('clearCurrentDetections', () => {
    it('should clear current detections', () => {
      store.addDetection(createDetection());
      store.addDetection(createDetection());
      store.clearCurrentDetections();
      expect(store.currentDetections).toEqual([]);
    });

    it('should not affect history', () => {
      store.addDetection(createDetection());
      store.clearCurrentDetections();
      expect(store.detectionHistory).toHaveLength(1);
    });
  });

  describe('acknowledgeDetection', () => {
    it('should mark detection as acknowledged', () => {
      const detection = createDetection({ id: 'test-1' });
      store.addDetection(detection);
      store.acknowledgeDetection('test-1');
      expect(store.detectionHistory[0].acknowledged).toBe(true);
    });

    it('should not affect other detections', () => {
      store.addDetection(createDetection({ id: '1' }));
      store.addDetection(createDetection({ id: '2' }));
      store.acknowledgeDetection('1');

      const det1 = store.detectionHistory.find((d) => d.id === '1');
      const det2 = store.detectionHistory.find((d) => d.id === '2');

      expect(det1?.acknowledged).toBe(true);
      expect(det2?.acknowledged).toBe(false);
    });
  });

  describe('updateDetectionNotes', () => {
    it('should update detection notes', () => {
      store.addDetection(createDetection({ id: 'test' }));
      store.updateDetectionNotes('test', 'Bear spotted near fence');
      expect(store.detectionHistory[0].notes).toBe('Bear spotted near fence');
    });
  });

  describe('deleteDetection', () => {
    it('should remove detection from history', () => {
      store.addDetection(createDetection({ id: 'to-delete' }));
      store.addDetection(createDetection({ id: 'keep' }));
      store.deleteDetection('to-delete');

      expect(store.detectionHistory).toHaveLength(1);
      expect(store.detectionHistory[0].id).toBe('keep');
    });
  });

  describe('clearHistory', () => {
    it('should clear all detection history', () => {
      store.addDetection(createDetection());
      store.addDetection(createDetection());
      store.clearHistory();
      expect(store.detectionHistory).toEqual([]);
    });

    it('should reset total detections', () => {
      store.addDetection(createDetection());
      store.addDetection(createDetection());
      store.clearHistory();
      expect(store.totalDetections).toBe(0);
    });
  });

  describe('Filters', () => {
    describe('setSizeFilter', () => {
      it('should set size filter', () => {
        store.setSizeFilter(['large']);
        expect(store.sizeFilter).toEqual(['large']);
      });

      it('should allow empty filter', () => {
        store.setSizeFilter([]);
        expect(store.sizeFilter).toEqual([]);
      });
    });

    describe('setDangerFilter', () => {
      it('should set danger filter', () => {
        store.setDangerFilter(['high', 'extreme']);
        expect(store.dangerFilter).toEqual(['high', 'extreme']);
      });
    });

    describe('getFilteredHistory', () => {
      beforeEach(() => {
        store.addDetection(createDetection({ id: 'small-low', sizeCategory: 'small', dangerLevel: 'low' }));
        store.addDetection(createDetection({ id: 'large-high', sizeCategory: 'large', dangerLevel: 'high' }));
        store.addDetection(createDetection({ id: 'medium-none', sizeCategory: 'medium', dangerLevel: 'none' }));
      });

      it('should return all with default filters', () => {
        expect(store.getFilteredHistory()).toHaveLength(3);
      });

      it('should filter by size', () => {
        store.setSizeFilter(['large']);
        const filtered = store.getFilteredHistory();
        expect(filtered).toHaveLength(1);
        expect(filtered[0].id).toBe('large-high');
      });

      it('should filter by danger level', () => {
        store.setDangerFilter(['high', 'extreme']);
        const filtered = store.getFilteredHistory();
        expect(filtered).toHaveLength(1);
        expect(filtered[0].id).toBe('large-high');
      });

      it('should apply both filters', () => {
        store.setSizeFilter(['small', 'medium']);
        store.setDangerFilter(['none', 'low']);
        const filtered = store.getFilteredHistory();
        expect(filtered).toHaveLength(2);
      });

      it('should return empty when no match', () => {
        store.setSizeFilter(['small']);
        store.setDangerFilter(['extreme']);
        expect(store.getFilteredHistory()).toHaveLength(0);
      });
    });
  });

  describe('Count Methods', () => {
    beforeEach(() => {
      store.addDetection(createDetection({ sizeCategory: 'large', dangerLevel: 'high' }));
      store.addDetection(createDetection({ sizeCategory: 'large', dangerLevel: 'extreme' }));
      store.addDetection(createDetection({ sizeCategory: 'small', dangerLevel: 'low' }));
      store.addDetection(createDetection({ sizeCategory: 'small', dangerLevel: 'none' }));
      store.addDetection(createDetection({ sizeCategory: 'medium', dangerLevel: 'medium' }));
    });

    describe('getLargeAnimalCount', () => {
      it('should count large animals', () => {
        expect(store.getLargeAnimalCount()).toBe(2);
      });
    });

    describe('getSmallAnimalCount', () => {
      it('should count small animals', () => {
        expect(store.getSmallAnimalCount()).toBe(2);
      });
    });

    describe('getDangerousCount', () => {
      it('should count high and extreme danger', () => {
        expect(store.getDangerousCount()).toBe(2);
      });
    });
  });

  describe('Selectors', () => {
    it('selectSettings should return settings', () => {
      expect(selectSettings(store)).toEqual(DEFAULT_ANIMAL_SETTINGS);
    });

    it('selectIsMonitoring should return monitoring state', () => {
      expect(selectIsMonitoring(store)).toBe(false);
      store.setMonitoring(true);
      expect(selectIsMonitoring(store)).toBe(true);
    });

    it('selectCurrentDetections should return current detections', () => {
      const detection = createDetection();
      store.addDetection(detection);
      expect(selectCurrentDetections(store)).toContainEqual(detection);
    });

    it('selectDetectionHistory should return history', () => {
      store.addDetection(createDetection());
      expect(selectDetectionHistory(store)).toHaveLength(1);
    });

    it('selectUnacknowledgedCount should count unacknowledged', () => {
      store.addDetection(createDetection({ id: '1' }));
      store.addDetection(createDetection({ id: '2' }));
      store.acknowledgeDetection('1');
      expect(selectUnacknowledgedCount(store)).toBe(1);
    });

    it('selectRecentDetections should return limited results', () => {
      for (let i = 0; i < 20; i++) {
        store.addDetection(createDetection());
      }
      expect(selectRecentDetections(store, 5)).toHaveLength(5);
    });

    it('selectDangerousDetections should filter dangerous', () => {
      store.addDetection(createDetection({ dangerLevel: 'high' }));
      store.addDetection(createDetection({ dangerLevel: 'extreme' }));
      store.addDetection(createDetection({ dangerLevel: 'low' }));
      expect(selectDangerousDetections(store)).toHaveLength(2);
    });

    it('selectLargeAnimals should filter large', () => {
      store.addDetection(createDetection({ sizeCategory: 'large' }));
      store.addDetection(createDetection({ sizeCategory: 'small' }));
      expect(selectLargeAnimals(store)).toHaveLength(1);
    });

    it('selectSmallAnimals should filter small', () => {
      store.addDetection(createDetection({ sizeCategory: 'small' }));
      store.addDetection(createDetection({ sizeCategory: 'large' }));
      expect(selectSmallAnimals(store)).toHaveLength(1);
    });
  });

  describe('reset', () => {
    it('should reset runtime state', () => {
      store.setMonitoring(true);
      store.addDetection(createDetection());

      store.reset();

      expect(store.isMonitoring).toBe(false);
      expect(store.lastDetectionTime).toBeNull();
      expect(store.currentDetections).toEqual([]);
    });

    it('should preserve history and settings', () => {
      store.addDetection(createDetection());
      store.updateSettings({ alertVolume: 50 });

      store.reset();

      expect(store.detectionHistory).toHaveLength(1);
      expect(store.settings.alertVolume).toBe(50);
    });
  });
});
