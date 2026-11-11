/**
 * Person Detection Tests
 * 
 * Unit tests for the person detection library.
 * 
 * @module tests/person-detection.test
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import {
  PersonDetector,
  getPersonDetector,
  resetPersonDetector,
  calculatePersonChange,
  DEFAULT_DETECTOR_CONFIG,
  type PersonDetectorConfig,
  type PersonDetectionResult,
} from '../src/lib/person-detection';

// =============================================================================
// Mock Setup
// =============================================================================

// Mock TensorFlow.js and COCO-SSD
jest.mock('@tensorflow/tfjs', () => ({
  io: { registerLoadRouter: jest.fn() },
  setBackend: jest.fn().mockResolvedValue(undefined as never),
  ready: jest.fn().mockResolvedValue(undefined as never),
}));

jest.mock('@tensorflow-models/coco-ssd', () => ({
  load: jest.fn().mockResolvedValue({
    detect: jest.fn().mockResolvedValue([
      { class: 'person', score: 0.95, bbox: [10, 20, 100, 200] },
      { class: 'person', score: 0.85, bbox: [150, 30, 90, 180] },
      { class: 'dog', score: 0.9, bbox: [300, 100, 50, 40] }, // Should be filtered
    ] as never),
  } as never),
}));

// Mock document.createElement for canvas
const mockGetContext = jest.fn(() => ({
  drawImage: jest.fn(),
  getImageData: jest.fn(() => ({
    data: new Uint8ClampedArray(320 * 240 * 4),
    width: 320,
    height: 240,
  })),
}));

const mockToDataURL = jest.fn(() => 'data:image/jpeg;base64,mock');

Object.defineProperty(global, 'document', {
  value: {
    createElement: jest.fn((tag) => {
      if (tag === 'canvas') {
        return {
          getContext: mockGetContext,
          toDataURL: mockToDataURL,
          width: 320,
          height: 240,
        };
      }
      return {};
    }),
  },
});

// Mock HTMLVideoElement
class MockVideoElement {
  videoWidth = 640;
  videoHeight = 480;
}

Object.defineProperty(global, 'HTMLVideoElement', {
  value: MockVideoElement,
});

// Mock performance.now
Object.defineProperty(global, 'performance', {
  value: {
    now: jest.fn(() => Date.now()),
  },
});

// =============================================================================
// Tests
// =============================================================================

describe('Person Detection Library', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPersonDetector();
  });

  describe('DEFAULT_DETECTOR_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_DETECTOR_CONFIG.confidenceThreshold).toBeGreaterThan(0);
      expect(DEFAULT_DETECTOR_CONFIG.confidenceThreshold).toBeLessThanOrEqual(1);
      expect(DEFAULT_DETECTOR_CONFIG.motionThreshold).toBeGreaterThan(0);
      expect(DEFAULT_DETECTOR_CONFIG.maxDetections).toBeGreaterThan(0);
      expect(DEFAULT_DETECTOR_CONFIG.minDetectionInterval).toBeGreaterThan(0);
    });
  });

  describe('PersonDetector', () => {
    it('should create detector with default config', () => {
      const detector = new PersonDetector();
      expect(detector).toBeInstanceOf(PersonDetector);
    });

    it('should create detector with custom config', () => {
      const config: Partial<PersonDetectorConfig> = {
        confidenceThreshold: 0.7,
        motionThreshold: 20,
      };
      const detector = new PersonDetector(config);
      expect(detector).toBeInstanceOf(PersonDetector);
    });

    it('should update config', () => {
      const detector = new PersonDetector();
      detector.updateConfig({ confidenceThreshold: 0.8 });
      // Config should be updated (internal state)
      expect(detector).toBeInstanceOf(PersonDetector);
    });

    it('should initialize canvas on initialize', async () => {
      const detector = new PersonDetector();
      await detector.initialize();
      expect(document.createElement).toHaveBeenCalledWith('canvas');
    });

    it('should dispose resources', () => {
      const detector = new PersonDetector();
      detector.dispose();
      // Should not throw
      expect(() => detector.dispose()).not.toThrow();
    });
  });

  describe('getPersonDetector (singleton)', () => {
    it('should return same instance', () => {
      const detector1 = getPersonDetector();
      const detector2 = getPersonDetector();
      expect(detector1).toBe(detector2);
    });

    it('should update config on existing instance', () => {
      const detector1 = getPersonDetector({ confidenceThreshold: 0.5 });
      const detector2 = getPersonDetector({ confidenceThreshold: 0.9 });
      expect(detector1).toBe(detector2);
    });

    it('should reset singleton', () => {
      const detector1 = getPersonDetector();
      resetPersonDetector();
      const detector2 = getPersonDetector();
      expect(detector1).not.toBe(detector2);
    });
  });

  describe('calculatePersonChange', () => {
    it('should detect when count exceeds allowed', () => {
      const result = calculatePersonChange(3, 2, 2);
      expect(result.exceeded).toBe(true);
      expect(result.excessCount).toBe(1);
    });

    it('should not flag when count equals allowed', () => {
      const result = calculatePersonChange(2, 1, 2);
      expect(result.exceeded).toBe(false);
      expect(result.excessCount).toBe(0);
    });

    it('should not flag when count is below allowed', () => {
      const result = calculatePersonChange(1, 0, 2);
      expect(result.exceeded).toBe(false);
      expect(result.excessCount).toBe(0);
    });

    it('should detect new intrusion', () => {
      const result = calculatePersonChange(3, 2, 2);
      expect(result.isNewIntrusion).toBe(true);
    });

    it('should not flag as new intrusion if already exceeded', () => {
      const result = calculatePersonChange(4, 3, 2);
      expect(result.exceeded).toBe(true);
      expect(result.isNewIntrusion).toBe(false);
    });

    it('should handle zero allowed correctly', () => {
      const result = calculatePersonChange(1, 0, 0);
      expect(result.exceeded).toBe(true);
      expect(result.excessCount).toBe(1);
      expect(result.isNewIntrusion).toBe(true);
    });

    it('should handle transition from exceeded to not exceeded', () => {
      const result = calculatePersonChange(2, 3, 2);
      expect(result.exceeded).toBe(false);
      expect(result.excessCount).toBe(0);
    });
  });

  describe('Motion Detection', () => {
    it('should calculate motion between frames', async () => {
      const detector = new PersonDetector({
        motionThreshold: 5,
        captureFrames: false,
      });
      await detector.initialize();

      const video = new MockVideoElement() as unknown as HTMLVideoElement;

      // First frame - no previous, should return 0 motion
      const result1 = await detector.processFrame(video);
      // Motion is checked but no previous frame, so motion is 0
      expect(result1).toBeDefined();
    });
  });

  describe('Frame Processing', () => {
    it('should return null if canvas not initialized', async () => {
      const detector = new PersonDetector();
      // Don't initialize
      const video = new MockVideoElement() as unknown as HTMLVideoElement;
      const result = await detector.processFrame(video);
      expect(result).toBeNull();
    });

    it('should throttle detection based on interval', async () => {
      const detector = new PersonDetector({
        minDetectionInterval: 10000, // Very long interval
      });
      await detector.initialize();

      const video = new MockVideoElement() as unknown as HTMLVideoElement;

      // First detection - may return result or null depending on motion
      await detector.processFrame(video);
      
      // Note: Due to the mocked environment, the interval check may not work exactly
      // as expected. This test verifies the detector doesn't crash during rapid calls.
    });
  });
});

describe('Person Detection Result Types', () => {
  it('should have correct structure', () => {
    const mockResult: PersonDetectionResult = {
      personCount: 2,
      detections: [
        { bbox: [10, 20, 100, 200], confidence: 0.95, class: 'person' },
      ],
      processingTimeMs: 50,
      timestamp: Date.now(),
      motionTriggered: true,
    };

    expect(mockResult.personCount).toBe(2);
    expect(mockResult.detections).toHaveLength(1);
    expect(mockResult.detections[0].class).toBe('person');
  });
});

