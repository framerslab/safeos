/**
 * Subject Matcher Tests
 * 
 * Tests for the real-time frame matching engine
 * used in Lost & Found detection.
 * 
 * @module tests/subject-matcher.test
 */

// Using Jest testing framework
import {
  SubjectMatcher,
  getSubjectMatcher,
  resetSubjectMatcher,
  getMatchQuality,
  formatMatchResult,
  getProcessingInfo,
  type MatchResult,
  type MatcherSettings,
  type MatcherState,
  type MatchRegion,
} from '../src/lib/subject-matcher';
import {
  calculateAverageColor,
  calculateColorVariance,
  estimateSizeRatio,
  extractColorHistogram,
  extractDominantColors,
  extractEdgeSignature,
  type VisualFingerprint,
} from '../src/lib/visual-fingerprint';

// =============================================================================
// Mock Data
// =============================================================================

const createMockFingerprint = (overrides: Partial<VisualFingerprint> = {}): VisualFingerprint => ({
  id: 'test-fingerprint',
  name: 'Test Subject',
  colorHistogram: [
    { color: { r: 100, g: 50, b: 25 }, count: 1000, percentage: 60 },
    { color: { r: 200, g: 150, b: 100 }, count: 500, percentage: 30 },
  ],
  dominantColors: [
    { r: 100, g: 50, b: 25 },
    { r: 200, g: 150, b: 100 },
  ],
  averageColor: { r: 133, g: 83, b: 50 },
  colorVariance: 25,
  estimatedSizeRatio: 0.3,
  edgeSignature: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
  referenceImages: [],
  createdAt: new Date().toISOString(),
  ...overrides,
});

const createMockSettings = (overrides: Partial<MatcherSettings> = {}): MatcherSettings => ({
  colorSensitivity: 70,
  minConfidenceForRecord: 40,
  minConfidenceForAlert: 60,
  sizeTolerance: 50,
  scanGridSize: 8,
  processingMode: 'local',
  adaptiveLighting: true,
  motionPriority: true,
  ...overrides,
});

// =============================================================================
// SubjectMatcher Class Tests
// =============================================================================

describe('SubjectMatcher', () => {
  let matcher: SubjectMatcher;
  let mockFingerprint: VisualFingerprint;
  let mockSettings: MatcherSettings;

  beforeEach(() => {
    mockFingerprint = createMockFingerprint();
    mockSettings = createMockSettings();
    matcher = new SubjectMatcher();
    resetSubjectMatcher();
  });

  describe('Initialization', () => {
    it('should create a new matcher instance', () => {
      expect(matcher).toBeInstanceOf(SubjectMatcher);
    });

    it('should start inactive', () => {
      const state = matcher.getState();
      expect(state.isActive).toBe(false);
    });

    it('should have no fingerprint initially', () => {
      const fingerprint = matcher.getFingerprint();
      expect(fingerprint).toBeNull();
    });

    it('should have no last match initially', () => {
      const state = matcher.getState();
      expect(state.lastMatch).toBeNull();
    });
  });

  describe('Configuration', () => {
    it('should set fingerprint', () => {
      matcher.setFingerprint(mockFingerprint);
      const fingerprint = matcher.getFingerprint();
      expect(fingerprint).toEqual(mockFingerprint);
    });

    it('should set settings', () => {
      matcher.setSettings(mockSettings);
      const settings = matcher.getSettings();
      expect(settings.colorSensitivity).toBe(mockSettings.colorSensitivity);
    });

    it('should activate/deactivate', () => {
      matcher.setActive(true);
      expect(matcher.getState().isActive).toBe(true);
      
      matcher.setActive(false);
      expect(matcher.getState().isActive).toBe(false);
    });

    it('should reset state on fingerprint change', () => {
      matcher.setFingerprint(mockFingerprint);
      matcher.setActive(true);
      
      // Change fingerprint
      const newFingerprint = createMockFingerprint({ id: 'new-fp' });
      matcher.setFingerprint(newFingerprint);
      
      const state = matcher.getState();
      expect(state.consecutiveMatches).toBe(0);
      expect(state.averageConfidence).toBe(0);
    });
  });

  describe('State Management', () => {
    it('should track consecutive matches', () => {
      matcher.setFingerprint(mockFingerprint);
      matcher.setSettings(mockSettings);
      matcher.setActive(true);
      
      // The state starts at 0 consecutive matches
      expect(matcher.getState().consecutiveMatches).toBe(0);
    });

    it('should reset state', () => {
      matcher.setFingerprint(mockFingerprint);
      matcher.setActive(true);
      
      matcher.reset();
      
      const state = matcher.getState();
      expect(state.isActive).toBe(true); // reset maintains active state
      expect(state.consecutiveMatches).toBe(0);
      expect(state.averageConfidence).toBe(0);
    });

    it('should deactivate when setActive(false) is called', () => {
      matcher.setActive(true);
      expect(matcher.getState().isActive).toBe(true);
      
      matcher.setActive(false);
      expect(matcher.getState().isActive).toBe(false);
    });
  });

  describe('Match Recording', () => {
    it('should have shouldRecord method', () => {
      matcher.setSettings(createMockSettings({ minConfidenceForRecord: 40 }));
      expect(typeof matcher.shouldRecord).toBe('function');
    });

    it('should return false when no matches', () => {
      expect(matcher.shouldRecord()).toBe(false);
    });
  });

  describe('Alert Triggering', () => {
    it('should have shouldAlert method', () => {
      matcher.setSettings(createMockSettings({ minConfidenceForAlert: 60 }));
      expect(typeof matcher.shouldAlert).toBe('function');
    });

    it('should return false when no matches', () => {
      expect(matcher.shouldAlert()).toBe(false);
    });
  });

  describe('Match History', () => {
    it('should have empty history initially', () => {
      expect(matcher.getMatchHistory()).toHaveLength(0);
    });

    it('should clear history', () => {
      matcher.clearHistory();
      expect(matcher.getMatchHistory()).toHaveLength(0);
    });
  });
});

// =============================================================================
// Singleton Tests
// =============================================================================

describe('Matcher Singleton', () => {
  beforeEach(() => {
    resetSubjectMatcher();
  });

  it('should return same instance', () => {
    const instance1 = getSubjectMatcher();
    const instance2 = getSubjectMatcher();
    expect(instance1).toBe(instance2);
  });

  it('should apply settings when getting instance', () => {
    const instance = getSubjectMatcher({ colorSensitivity: 90 });
    expect(instance.getSettings().colorSensitivity).toBe(90);
  });
});

// =============================================================================
// Match Quality Tests
// =============================================================================

describe('Match Quality', () => {
  describe('getMatchQuality', () => {
    it('should return excellent for 85+', () => {
      const quality = getMatchQuality(90);
      expect(quality.label).toBe('Excellent');
      expect(quality.color).toBe('green');
    });

    it('should return good for 70-84', () => {
      const quality = getMatchQuality(75);
      expect(quality.label).toBe('Good');
      expect(quality.color).toBe('emerald');
    });

    it('should return possible for 55-69', () => {
      const quality = getMatchQuality(60);
      expect(quality.label).toBe('Possible');
      expect(quality.color).toBe('yellow');
    });

    it('should return weak for 40-54', () => {
      const quality = getMatchQuality(45);
      expect(quality.label).toBe('Weak');
      expect(quality.color).toBe('orange');
    });

    it('should return unlikely for <40', () => {
      const quality = getMatchQuality(30);
      expect(quality.label).toBe('Unlikely');
      expect(quality.color).toBe('red');
    });

    it('should include description', () => {
      const quality = getMatchQuality(90);
      expect(quality.description).toBeTruthy();
      expect(typeof quality.description).toBe('string');
    });
  });
});

// =============================================================================
// Format Match Result Tests
// =============================================================================

describe('Format Match Result', () => {
  const mockResult: MatchResult = {
    id: 'match-123',
    timestamp: Date.now(),
    confidence: 75,
    details: {
      colorMatch: 80,
      dominantMatch: 70,
      edgeMatch: 65,
      sizeMatch: 85,
    },
    frameData: 'data:image/jpeg;base64,...',
    region: {
      x: 100,
      y: 100,
      width: 200,
      height: 200,
      centerX: 200,
      centerY: 200,
    },
    processingTimeMs: 25,
  };

  it('should format result with time field', () => {
    const formatted = formatMatchResult(mockResult);
    expect(formatted).toHaveProperty('time');
    expect(typeof formatted.time).toBe('string');
  });

  it('should format result with confidence field', () => {
    const formatted = formatMatchResult(mockResult);
    expect(formatted).toHaveProperty('confidence');
    expect(formatted.confidence).toBe('75%');
  });

  it('should include quality assessment', () => {
    const formatted = formatMatchResult(mockResult);
    expect(formatted.quality).toHaveProperty('label');
    expect(formatted.quality).toHaveProperty('color');
    expect(formatted.quality).toHaveProperty('description');
  });
});

// =============================================================================
// Processing Info Tests
// =============================================================================

describe('Processing Info', () => {
  it('should return local processing info', () => {
    const info = getProcessingInfo('local');
    expect(info.label).toBe('Local Instant');
    expect(info.color).toBe('green');
  });

  it('should return hybrid processing info', () => {
    const info = getProcessingInfo('hybrid');
    expect(info.label).toBe('AI Enhanced');
    expect(info.color).toBe('blue');
  });

  it('should include description', () => {
    const info = getProcessingInfo('local');
    expect(info.description).toBeTruthy();
    expect(typeof info.description).toBe('string');
  });

  it('should include estimated latency', () => {
    const info = getProcessingInfo('local');
    expect(info.estimatedLatency).toBeTruthy();
    expect(typeof info.estimatedLatency).toBe('string');
  });
});

// =============================================================================
// Settings Validation Tests
// =============================================================================

describe('Settings Validation', () => {
  let matcher: SubjectMatcher;

  beforeEach(() => {
    matcher = new SubjectMatcher();
  });

  it('should handle sensitivity range 0-100', () => {
    // Low sensitivity
    matcher.setSettings(createMockSettings({ colorSensitivity: 10 }));
    expect(matcher.getSettings().colorSensitivity).toBe(10);
    
    // High sensitivity
    matcher.setSettings(createMockSettings({ colorSensitivity: 100 }));
    expect(matcher.getSettings().colorSensitivity).toBe(100);
  });

  it('should accept local processing mode', () => {
    matcher.setSettings(createMockSettings({ processingMode: 'local' }));
    expect(matcher.getSettings().processingMode).toBe('local');
  });

  it('should accept hybrid processing mode', () => {
    matcher.setSettings(createMockSettings({ processingMode: 'hybrid' }));
    expect(matcher.getSettings().processingMode).toBe('hybrid');
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  it('should handle null fingerprint gracefully', () => {
    const matcher = new SubjectMatcher();
    matcher.setActive(true);
    
    // Should not throw when processing without fingerprint
    expect(() => matcher.setFingerprint(null)).not.toThrow();
  });

  it('should handle very low confidence thresholds', () => {
    const matcher = new SubjectMatcher();
    matcher.setSettings(createMockSettings({
      minConfidenceForRecord: 1,
      minConfidenceForAlert: 1,
    }));
    
    const settings = matcher.getSettings();
    expect(settings.minConfidenceForRecord).toBe(1);
    expect(settings.minConfidenceForAlert).toBe(1);
  });

  it('should handle small grid sizes', () => {
    const matcher = new SubjectMatcher();
    matcher.setSettings(createMockSettings({ scanGridSize: 4 }));
    
    const settings = matcher.getSettings();
    expect(settings.scanGridSize).toBe(4);
  });

  it('should handle large grid sizes', () => {
    const matcher = new SubjectMatcher();
    matcher.setSettings(createMockSettings({ scanGridSize: 16 }));
    
    const settings = matcher.getSettings();
    expect(settings.scanGridSize).toBe(16);
  });
});

// =============================================================================
// Scoring real pixels
// =============================================================================

type Colour = [number, number, number];

/** A picture whose pixel at (x, y) has the colour `colourAt` returns. */
function picture(width: number, height: number, colourAt: (x: number, y: number) => Colour): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colourAt(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

/** Vertical stripes one pixel wide: even columns black, odd columns white. */
const stripes = (width: number, height: number): ImageData =>
  picture(width, height, (x) => (x % 2 === 0 ? [0, 0, 0] : [255, 255, 255]));

/**
 * The fingerprint generateFingerprint stores for a picture: the same
 * extractors with the same defaults (32 buckets, 5 colours, an 8 by 8 edge
 * grid), without the image loading a browser does first.
 */
function enrol(pixels: ImageData): VisualFingerprint {
  const averageColor = calculateAverageColor(pixels);
  return {
    id: 'subject',
    name: 'subject',
    referenceImages: [],
    createdAt: '',
    colorHistogram: extractColorHistogram(pixels, 32),
    dominantColors: extractDominantColors(pixels, 5),
    averageColor,
    colorVariance: calculateColorVariance(pixels, averageColor),
    estimatedSizeRatio: estimateSizeRatio(pixels),
    edgeSignature: extractEdgeSignature(pixels, 8),
  };
}

/** A canvas that hands processCanvas the given pixels. */
const canvasOf = (pixels: ImageData): HTMLCanvasElement =>
  ({
    width: pixels.width,
    height: pixels.height,
    getContext: () => ({ getImageData: () => pixels }),
  }) as unknown as HTMLCanvasElement;

describe('Edge term on the enrolled grid', () => {
  it('scores the enrolled picture 100 on edges and 100 overall', () => {
    const pixels = stripes(128, 128);
    const enrolled = enrol(pixels);
    const matcher = new SubjectMatcher({ minConfidenceForRecord: 0, adaptiveLighting: false, motionPriority: false });
    matcher.setFingerprint(enrolled);
    matcher.setActive(true);

    const result = matcher.processCanvas(canvasOf(pixels));

    // Enrolment keeps one edge value per cell of an 8 by 8 grid.
    expect(enrolled.edgeSignature).toHaveLength(64);
    // Every sampled pixel of the stripes has the same horizontal step, so
    // every cell of the subject and of each scanned region reads 100.
    expect(result?.details.edgeMatch).toBe(100);
    expect(result?.confidence).toBe(100);
  });
});
