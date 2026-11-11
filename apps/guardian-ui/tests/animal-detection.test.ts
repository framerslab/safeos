/**
 * Animal Detection Tests
 * 
 * Unit tests for the animal detection library.
 * 
 * @module tests/animal-detection.test
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock TensorFlow and COCO-SSD before importing
jest.mock('@tensorflow/tfjs', () => ({
  io: { registerLoadRouter: jest.fn() },
  setBackend: jest.fn().mockResolvedValue(undefined as never),
  ready: jest.fn().mockResolvedValue(undefined as never),
}));

jest.mock('@tensorflow-models/coco-ssd', () => ({
  load: jest.fn().mockResolvedValue({
    detect: jest.fn().mockResolvedValue([
      { bbox: [10, 10, 50, 50], class: 'dog', score: 0.85 },
      { bbox: [60, 60, 40, 40], class: 'cat', score: 0.75 },
    ] as never),
  } as never),
}));

import {
  AnimalDetector,
  getAnimalDetector,
  resetAnimalDetector,
  getAnimalInfo,
  getDangerColor,
  getDangerLabel,
  getSizeIcon,
  createAnimalAnnouncement,
  sortByDanger,
  filterBySize,
  hasDangerousDetection,
  loadAnimalDetectionModel,
  isAnimalModelReady,
  unloadAnimalModel,
  DEFAULT_ANIMAL_CONFIG,
  type AnimalDetection,
  type SizeCategory,
  type DangerLevel,
} from '../src/lib/animal-detection';

describe('AnimalDetector', () => {
  beforeEach(() => {
    resetAnimalDetector();
    unloadAnimalModel();
    jest.clearAllMocks();
  });

  afterEach(() => {
    resetAnimalDetector();
    unloadAnimalModel();
  });

  describe('initialization', () => {
    it('should create detector with default config', () => {
      const detector = new AnimalDetector();
      expect(detector).toBeDefined();
    });

    it('should accept custom config', () => {
      const detector = new AnimalDetector({
        confidenceThreshold: 0.7,
        motionThreshold: 20,
      });
      expect(detector).toBeDefined();
    });
  });

  describe('model loading', () => {
    it('should load the COCO-SSD model', async () => {
      const model = await loadAnimalDetectionModel();
      expect(model).toBeDefined();
      expect(isAnimalModelReady()).toBe(true);
    });

    it('should return same model on subsequent loads', async () => {
      const model1 = await loadAnimalDetectionModel();
      const model2 = await loadAnimalDetectionModel();
      expect(model1).toBe(model2);
    });

    it('should unload model correctly', async () => {
      await loadAnimalDetectionModel();
      expect(isAnimalModelReady()).toBe(true);
      unloadAnimalModel();
      expect(isAnimalModelReady()).toBe(false);
    });
  });

  describe('config update', () => {
    it('should update config', () => {
      const detector = new AnimalDetector({ confidenceThreshold: 0.5 });
      detector.updateConfig({ confidenceThreshold: 0.8 });
      // Config update doesn't expose state, but shouldn't throw
      expect(detector).toBeDefined();
    });
  });

  describe('dispose', () => {
    it('should dispose resources', () => {
      const detector = new AnimalDetector();
      detector.dispose();
      // Should not throw
      expect(detector).toBeDefined();
    });
  });
});

describe('Singleton Functions', () => {
  beforeEach(() => {
    resetAnimalDetector();
  });

  afterEach(() => {
    resetAnimalDetector();
  });

  it('should return same instance', () => {
    const detector1 = getAnimalDetector();
    const detector2 = getAnimalDetector();
    expect(detector1).toBe(detector2);
  });

  it('should update config on existing instance', () => {
    getAnimalDetector({ confidenceThreshold: 0.5 });
    const detector = getAnimalDetector({ confidenceThreshold: 0.8 });
    expect(detector).toBeDefined();
  });

  it('should create new instance after reset', () => {
    const detector1 = getAnimalDetector();
    resetAnimalDetector();
    const detector2 = getAnimalDetector();
    expect(detector1).not.toBe(detector2);
  });
});

describe('Animal Classification', () => {
  describe('getAnimalInfo', () => {
    it('should return correct info for known animals', () => {
      const dogInfo = getAnimalInfo('dog');
      expect(dogInfo.displayName).toBe('Dog');
      expect(dogInfo.sizeCategory).toBe('medium');
      expect(dogInfo.dangerLevel).toBe('low');
      expect(dogInfo.isDomestic).toBe(true);
    });

    it('should return correct info for dangerous animals', () => {
      const bearInfo = getAnimalInfo('bear');
      expect(bearInfo.displayName).toBe('Bear');
      expect(bearInfo.sizeCategory).toBe('large');
      expect(bearInfo.dangerLevel).toBe('extreme');
      expect(bearInfo.isDomestic).toBe(false);
    });

    it('should return unknown_animal for unrecognized types', () => {
      const unknownInfo = getAnimalInfo('unknown_animal');
      expect(unknownInfo.displayName).toBe('Unknown Animal');
    });
  });
});

describe('Danger Level Functions', () => {
  describe('getDangerColor', () => {
    it('should return correct colors', () => {
      expect(getDangerColor('extreme')).toBe('#ff0000');
      expect(getDangerColor('high')).toBe('#ff6600');
      expect(getDangerColor('medium')).toBe('#ffcc00');
      expect(getDangerColor('low')).toBe('#00cc00');
      expect(getDangerColor('none')).toBe('#888888');
    });
  });

  describe('getDangerLabel', () => {
    it('should return correct labels', () => {
      expect(getDangerLabel('extreme')).toBe('EXTREME DANGER');
      expect(getDangerLabel('high')).toBe('High Risk');
      expect(getDangerLabel('medium')).toBe('Caution');
      expect(getDangerLabel('low')).toBe('Low Risk');
      expect(getDangerLabel('none')).toBe('Safe');
    });
  });
});

describe('Size Functions', () => {
  describe('getSizeIcon', () => {
    it('should return the size as a word', () => {
      expect(getSizeIcon('large')).toBe('large');
      expect(getSizeIcon('medium')).toBe('medium');
      expect(getSizeIcon('small')).toBe('small');
    });
  });
});

describe('Announcement Functions', () => {
  describe('createAnimalAnnouncement', () => {
    it('should create urgent announcement for dangerous animals', () => {
      const detection: AnimalDetection = {
        id: '1',
        type: 'bear',
        displayName: 'Bear',
        sizeCategory: 'large',
        dangerLevel: 'extreme',
        confidence: 0.9,
        bbox: [0, 0, 100, 100],
        timestamp: Date.now(),
      };

      const announcement = createAnimalAnnouncement(detection);
      expect(announcement).toContain('Warning');
      expect(announcement).toContain('Bear');
      expect(announcement).toContain('90%');
      expect(announcement).toContain('EXTREME DANGER');
    });

    it('should create casual announcement for safe animals', () => {
      const detection: AnimalDetection = {
        id: '2',
        type: 'cat',
        displayName: 'Cat',
        sizeCategory: 'small',
        dangerLevel: 'none',
        confidence: 0.8,
        bbox: [0, 0, 50, 50],
        timestamp: Date.now(),
      };

      const announcement = createAnimalAnnouncement(detection);
      expect(announcement).toContain('Cat');
      expect(announcement).toContain('80%');
      expect(announcement).not.toContain('Warning');
    });
  });
});

describe('Sorting and Filtering', () => {
  const testDetections: AnimalDetection[] = [
    {
      id: '1',
      type: 'cat',
      displayName: 'Cat',
      sizeCategory: 'small',
      dangerLevel: 'none',
      confidence: 0.8,
      bbox: [0, 0, 50, 50],
      timestamp: Date.now(),
    },
    {
      id: '2',
      type: 'bear',
      displayName: 'Bear',
      sizeCategory: 'large',
      dangerLevel: 'extreme',
      confidence: 0.9,
      bbox: [0, 0, 100, 100],
      timestamp: Date.now(),
    },
    {
      id: '3',
      type: 'dog',
      displayName: 'Dog',
      sizeCategory: 'medium',
      dangerLevel: 'low',
      confidence: 0.85,
      bbox: [0, 0, 75, 75],
      timestamp: Date.now(),
    },
  ];

  describe('sortByDanger', () => {
    it('should sort by danger level', () => {
      const sorted = sortByDanger(testDetections);
      
      expect(sorted[0].dangerLevel).toBe('extreme');
      expect(sorted[1].dangerLevel).toBe('low');
      expect(sorted[2].dangerLevel).toBe('none');
    });

    it('should not mutate original array', () => {
      const original = [...testDetections];
      sortByDanger(testDetections);
      expect(testDetections).toEqual(original);
    });
  });

  describe('filterBySize', () => {
    it('should filter by size category', () => {
      const smallAnimals = filterBySize(testDetections, ['small']);
      expect(smallAnimals.length).toBe(1);
      expect(smallAnimals[0].sizeCategory).toBe('small');
    });

    it('should filter multiple size categories', () => {
      const smallAndMedium = filterBySize(testDetections, ['small', 'medium']);
      expect(smallAndMedium.length).toBe(2);
    });

    it('should return empty array for no matches', () => {
      const empty: SizeCategory[] = [];
      const result = filterBySize(testDetections, empty);
      expect(result.length).toBe(0);
    });
  });

  describe('hasDangerousDetection', () => {
    it('should return true if dangerous animal present', () => {
      expect(hasDangerousDetection(testDetections)).toBe(true);
    });

    it('should return false if no dangerous animals', () => {
      const safeDetections = testDetections.filter(
        d => d.dangerLevel !== 'high' && d.dangerLevel !== 'extreme'
      );
      expect(hasDangerousDetection(safeDetections)).toBe(false);
    });

    it('should return false for empty array', () => {
      expect(hasDangerousDetection([])).toBe(false);
    });
  });
});

describe('Default Config', () => {
  it('should have expected default values', () => {
    expect(DEFAULT_ANIMAL_CONFIG.confidenceThreshold).toBe(0.5);
    expect(DEFAULT_ANIMAL_CONFIG.motionThreshold).toBe(15);
    expect(DEFAULT_ANIMAL_CONFIG.enableLargeAnimalAlerts).toBe(true);
    expect(DEFAULT_ANIMAL_CONFIG.enableSmallAnimalAlerts).toBe(true);
    expect(DEFAULT_ANIMAL_CONFIG.captureFrames).toBe(true);
    expect(DEFAULT_ANIMAL_CONFIG.detectionWidth).toBe(320);
    expect(DEFAULT_ANIMAL_CONFIG.detectionHeight).toBe(240);
  });
});

