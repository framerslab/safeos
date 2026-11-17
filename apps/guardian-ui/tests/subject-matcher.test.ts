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
import type { VisualFingerprint } from '../src/lib/visual-fingerprint';
import {
  BLACK,
  WHITE,
  canvasOf,
  centredBlock,
  enrol,
  flat,
  installCanvasDocument,
  picture,
  stripes,
  videoOf,
  type Colour,
} from './helpers/pictures';

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

  it('reads a near-blank wall as near-blank, not as strongly as the subject\'s stripes', () => {
    const subject = enrol(stripes(128, 128));
    // A flat grey wall with one level of dither, as a camera's noise gives it.
    const wall = picture(128, 128, (x, y) => ((x + y) % 2 === 1 ? [129, 129, 129] : [128, 128, 128]));
    const matcher = new SubjectMatcher({ minConfidenceForRecord: 0, adaptiveLighting: false, motionPriority: false });
    matcher.setFingerprint(subject);
    matcher.setActive(true);

    const result = matcher.processCanvas(canvasOf(wall));

    // Every sample of the wall steps one level right and down, an edge
    // strength of 4, where a step from black to white is 765. On the scale
    // where a strength of 255 reads 100, the wall's cells read 2 where the
    // stripes' read 100.
    expect(result).not.toBeNull();
    expect(result?.details.edgeMatch).toBe(2);
  });
});

describe('Edges on one scale for the subject and the camera', () => {
  // A flat grey wall with one level of dither, as a camera's noise gives it.
  const ditheredWall = picture(128, 128, (x, y) => ((x + y) % 2 === 1 ? [129, 129, 129] : [128, 128, 128]));
  const edgeTerm = (subject: VisualFingerprint, pixels: ImageData): number | undefined => {
    const matcher = new SubjectMatcher({ minConfidenceForRecord: 0, adaptiveLighting: false, motionPriority: false });
    matcher.setFingerprint(subject);
    matcher.setActive(true);
    return matcher.processCanvas(canvasOf(pixels))?.details.edgeMatch;
  };

  it('scores the enrolled pixels 100 on edges', () => {
    expect(edgeTerm(enrol(ditheredWall), ditheredWall)).toBe(100);
  });

  it('scores the same pixels 100 on edges for a subject saved by the version before', () => {
    // That version scaled a photo's edges to its own strongest cell, so every
    // cell of the wall was saved as 100.
    const savedBefore: VisualFingerprint = {
      ...enrol(ditheredWall),
      edgeSignature: new Array(64).fill(100),
      version: undefined,
    };

    expect(edgeTerm(savedBefore, ditheredWall)).toBe(100);
  });

  it('reads camera noise on a blank wall as weak edges, not as strong as black and white stripes', () => {
    // A blank wall whose noise alternates 8 levels, pixel by pixel.
    const noisyWall = picture(128, 128, (x, y) => ((x + y) % 2 === 1 ? [136, 136, 136] : [128, 128, 128]));

    // Each sample of the wall steps 8 levels right and down in red, green and
    // blue, an edge strength of 34 where a step from black to white is 765.
    // On a scale where a strength of 255 reads 100, the wall reads 13 against
    // the stripes' 100.
    expect(edgeTerm(enrol(stripes(128, 128)), noisyWall)).toBe(13);
  });
});

describe('Colour sensitivity', () => {
  it('still matches the enrolled picture at 100', () => {
    const pixels = stripes(128, 128);
    const matcher = new SubjectMatcher({ colorSensitivity: 100, adaptiveLighting: false, motionPriority: false });
    matcher.setFingerprint(enrol(pixels));
    matcher.setActive(true);

    const result = matcher.processCanvas(canvasOf(pixels));

    expect(result).not.toBeNull();
    expect(result?.confidence).toBe(100);
  });

  it('lowers a near match as it rises, without ever dropping it to 0', () => {
    const subject = enrol(stripes(128, 128));
    // The subject's stripes with light grey where the subject is white.
    const near = stripes(128, 128, [0, 0, 0], [200, 200, 200]);
    const confidenceAt = (colorSensitivity: number): number => {
      const matcher = new SubjectMatcher({
        colorSensitivity,
        minConfidenceForRecord: 0,
        adaptiveLighting: false,
        motionPriority: false,
      });
      matcher.setFingerprint(subject);
      matcher.setActive(true);
      return matcher.processCanvas(canvasOf(near))?.confidence ?? 0;
    };

    const lenient = confidenceAt(0);
    const neutral = confidenceAt(50);
    const strict = confidenceAt(100);

    expect(lenient).toBeGreaterThanOrEqual(neutral);
    expect(strict).toBeLessThan(neutral);
    expect(strict).toBeGreaterThan(0);
  });
});

describe('Adaptive lighting', () => {
  let removeDocument: () => void;

  beforeEach(() => {
    removeDocument = installCanvasDocument();
  });

  afterEach(() => {
    removeDocument();
  });

  it('never lets a scene unlike the subject through the gate, however long it is watched', () => {
    const subject = enrol(flat(128, 128, [200, 30, 30]));
    const scene = flat(128, 128, [30, 30, 200]);

    // The scene's regions score above the record line of 40, so a frame that
    // passes the gate comes back as a match. A record line of 0 leaves the
    // gate open.
    const ungated = new SubjectMatcher({ minConfidenceForRecord: 0, adaptiveLighting: false, motionPriority: false });
    ungated.setFingerprint(subject);
    ungated.setActive(true);
    expect(ungated.processCanvas(canvasOf(scene))?.confidence).toBeGreaterThanOrEqual(40);

    const matcher = new SubjectMatcher({ minConfidenceForRecord: 40, adaptiveLighting: true, motionPriority: false });
    matcher.setFingerprint(subject);
    matcher.setActive(true);

    const matchedFrames: number[] = [];
    for (let frame = 0; frame < 40; frame++) {
      if (matcher.processFrame(videoOf(scene))) {
        matchedFrames.push(frame);
      }
    }

    expect(matchedFrames).toEqual([]);
  });

  // A watch of `frames`: the matcher's result on each frame, in order.
  const watch = (
    subject: VisualFingerprint,
    frames: ImageData[],
    adaptiveLighting: boolean
  ): (MatchResult | null)[] => {
    const matcher = new SubjectMatcher({ minConfidenceForRecord: 0, adaptiveLighting, motionPriority: false });
    matcher.setFingerprint(subject);
    matcher.setActive(true);
    return frames.map((frame) => matcher.processFrame(videoOf(frame)));
  };
  const times = (frame: ImageData, count: number): ImageData[] => new Array(count).fill(frame);

  it('scores the frame it corrected, not the one the camera gave', () => {
    // The subject in the scene's light, and the same picture once the light
    // drops by 60 levels.
    const lit = stripes(128, 128, [68, 68, 68], [188, 188, 188]);
    const dim = stripes(128, 128, [8, 8, 8], [128, 128, 128]);
    const subject = enrol(lit);
    const frames = [...times(lit, 5), dim];

    // Uncorrected, the dim picture is short of a full match.
    expect(watch(subject, frames, false)[5]?.confidence).toBeLessThan(100);
    // Corrected, the first dim frame is moved back to the light the scene had.
    expect(watch(subject, frames, true)[5]?.confidence).toBe(100);
  });

  it.each([
    ['a dark', flat(128, 128, [32, 32, 32])],
    ['a bright', stripes(128, 128, [150, 150, 150], [210, 210, 210])],
  ])('leaves %s scene whose light holds as the camera gives it', (_name, scene) => {
    // The subject photographed in the scene's own light.
    const subject = enrol(scene);
    const frames = times(scene, 48);

    const corrected = watch(subject, frames, true)[47];
    const uncorrected = watch(subject, frames, false)[47];
    expect(uncorrected?.confidence).toBe(100);
    expect(corrected?.confidence).toBe(uncorrected?.confidence);
  });

  it('does not brighten or darken a subject that comes into the scene', () => {
    // A grey room, then a light subject over a quarter of it.
    const room = flat(128, 128, [60, 60, 60]);
    const arrived = centredBlock(128, 128, [60, 60, 60], [200, 200, 200]);
    const subject = enrol(flat(64, 64, [200, 200, 200]));
    const frames = [...times(room, 10), arrived];

    const corrected = watch(subject, frames, true)[10];
    const uncorrected = watch(subject, frames, false)[10];
    expect(uncorrected).not.toBeNull();
    expect(corrected?.confidence).toBe(uncorrected?.confidence);
    expect(corrected?.details).toEqual(uncorrected?.details);
  });

  it('starts the scene afresh when the frames come from another camera', () => {
    // One camera watches a lit room; another, darker everywhere, then shows
    // the subject as it was photographed.
    const lit = stripes(128, 128, [68, 68, 68], [188, 188, 188]);
    const dim = stripes(128, 128, [8, 8, 8], [128, 128, 128]);
    const subject = enrol(dim);
    const firstCamera = {};
    const secondCamera = {};
    const watchFrom = (frames: [ImageData, object][]): (MatchResult | null)[] => {
      const matcher = new SubjectMatcher({ minConfidenceForRecord: 0, adaptiveLighting: true, motionPriority: false });
      matcher.setFingerprint(subject);
      matcher.setActive(true);
      return frames.map(([frame, stream]) => matcher.processFrame(videoOf(frame, stream)));
    };
    const litFrames: [ImageData, object][] = new Array(5).fill([lit, firstCamera]);

    // From one camera, the dim frame is a drop in light and is moved back.
    expect(watchFrom([...litFrames, [dim, firstCamera]])[5]?.confidence).toBeLessThan(100);
    // From another camera, it is the first frame of a new scene.
    expect(watchFrom([...litFrames, [dim, secondCamera]])[5]?.confidence).toBe(100);
  });

  it('does not brighten or darken a subject that covers most of the scene', () => {
    // A grey room, then a light subject over its left three quarters: 48 of
    // the 64 cells the light is read on.
    const room = flat(128, 128, [60, 60, 60]);
    const arrived = picture(128, 128, (x) => (x < 96 ? [200, 200, 200] : [60, 60, 60]));
    const subject = enrol(flat(64, 64, [200, 200, 200]));
    const frames = [...times(room, 10), arrived];

    const corrected = watch(subject, frames, true)[10];
    const uncorrected = watch(subject, frames, false)[10];
    expect(uncorrected?.confidence).toBe(100);
    expect(corrected?.confidence).toBe(100);
    expect(corrected?.details).toEqual(uncorrected?.details);
  });

  it('corrects a change of light that leaves some cells as they were', () => {
    // A striped room whose right quarter is a window of sky: 16 of the 64
    // cells the light is read on. A lamp then brightens the room's 48 cells
    // by 60 levels, and the window stays as it was.
    const SKY: Colour = [170, 200, 240];
    const room = (dark: Colour, light: Colour): ImageData =>
      picture(128, 128, (x) => (x >= 96 ? SKY : x % 2 === 0 ? dark : light));
    const before = room([68, 68, 68], [188, 188, 188]);
    const lampOn = room([128, 128, 128], [248, 248, 248]);
    const subject = enrol(stripes(128, 128, [68, 68, 68], [188, 188, 188]));
    const frames = [...times(before, 5), lampOn];

    // Uncorrected, the lit room is short of a full match.
    expect(watch(subject, frames, false)[5]?.confidence).toBeLessThan(100);
    // Corrected by the lamp's 60 levels, the room reads as the subject does.
    expect(watch(subject, frames, true)[5]?.confidence).toBe(100);
  });

  it('keeps a subject that stays in view out of the scene\'s settled brightness', () => {
    // A grey room; a light subject over 48 of its 64 cells for 100 frames;
    // then the subject leaves as the light drops by 20 levels.
    const room = flat(128, 128, [60, 60, 60]);
    const visitor = picture(128, 128, (x) => (x < 96 ? [200, 200, 200] : [60, 60, 60]));
    const dimmed = flat(128, 128, [40, 40, 40]);
    const subject = enrol(room);
    const frames = [...times(room, 10), ...times(visitor, 100), dimmed];

    expect(watch(subject, frames, false)[110]?.confidence).toBeLessThan(100);
    // Moved back by the 20 levels the light dropped, the room reads as it was.
    expect(watch(subject, frames, true)[110]?.confidence).toBe(100);
  });

  it('reads the light into the same buffers on every frame', () => {
    // A scene unlike the subject: the gate turns every frame away.
    const matcher = new SubjectMatcher({ adaptiveLighting: true, motionPriority: false });
    matcher.setFingerprint(enrol(flat(128, 128, [200, 30, 30])));
    matcher.setActive(true);
    const scene = flat(128, 128, [30, 30, 200]);
    type LightingBuffers = { sceneBrightness?: unknown; cellBrightness?: unknown; lightingDifferences?: unknown };
    const buffers = (): unknown[] => {
      const state = matcher as unknown as LightingBuffers;
      return [state.sceneBrightness, state.cellBrightness, state.lightingDifferences];
    };

    matcher.processFrame(videoOf(scene));
    matcher.processFrame(videoOf(scene));
    const first = buffers();
    for (let frame = 0; frame < 5; frame++) {
      expect(matcher.processFrame(videoOf(scene))).toBeNull();
    }
    const later = buffers();

    first.forEach((buffer, i) => {
      expect(buffer).toBeDefined();
      expect(later[i]).toBe(buffer);
    });
  });
});

describe('Motion priority', () => {
  let removeDocument: () => void;

  beforeEach(() => {
    removeDocument = installCanvasDocument();
  });

  afterEach(() => {
    removeDocument();
  });

  const GREY: Colour = [128, 128, 128];
  const striped = (x: number): Colour => (x % 2 === 0 ? BLACK : WHITE);

  // A 128 pixel frame on the default grid of 8 has cells 16 pixels wide: the
  // last column and the last row of cells start at pixel 112. Regions are two
  // cells wide and tall, so the last one starts at pixel 96.
  const watch = (arrived: ImageData) => {
    const matcher = new SubjectMatcher({ minConfidenceForRecord: 0, adaptiveLighting: false, motionPriority: true });
    matcher.setFingerprint(enrol(stripes(128, 128)));
    matcher.setActive(true);
    matcher.processFrame(videoOf(flat(128, 128, GREY)));
    return matcher.processFrame(videoOf(arrived));
  };

  it('scans the region that covers motion in the last column of cells', () => {
    const result = watch(picture(128, 128, (x) => (x < 112 ? GREY : striped(x))));

    expect(result).not.toBeNull();
    expect(result?.region?.x).toBe(96);
  });

  it('scans the region that covers motion in the last row of cells', () => {
    const result = watch(picture(128, 128, (x, y) => (y < 112 ? GREY : striped(x))));

    expect(result).not.toBeNull();
    expect(result?.region?.y).toBe(96);
  });

  it('scans nothing when nothing moved', () => {
    expect(watch(flat(128, 128, GREY))).toBeNull();
  });
});

describe('Size tolerance', () => {
  // The subject fills a quarter of its photo: a white block on black. A flat
  // black frame has no foreground in any region, so the two sizes are 25
  // points of the picture apart.
  const sizeTermAt = (sizeTolerance: number): number | undefined => {
    const matcher = new SubjectMatcher({
      sizeTolerance,
      minConfidenceForRecord: 0,
      adaptiveLighting: false,
      motionPriority: false,
    });
    matcher.setFingerprint(enrol(centredBlock(128, 128, BLACK, WHITE)));
    matcher.setActive(true);
    return matcher.processCanvas(canvasOf(flat(128, 128, BLACK)))?.details.sizeMatch;
  };

  it('is the size difference at which the size term reaches 0', () => {
    // 25 points apart is half of a tolerance of 50, a quarter of 100, and all
    // of 25.
    expect(sizeTermAt(50)).toBe(50);
    expect(sizeTermAt(100)).toBe(75);
    expect(sizeTermAt(25)).toBe(0);
  });

  it('at 0 gives the size term only to a region of the subject\'s size', () => {
    expect(sizeTermAt(0)).toBe(0);

    const matcher = new SubjectMatcher({
      sizeTolerance: 0,
      minConfidenceForRecord: 0,
      adaptiveLighting: false,
      motionPriority: false,
    });
    matcher.setFingerprint(enrol(stripes(128, 128)));
    matcher.setActive(true);
    expect(matcher.processCanvas(canvasOf(stripes(128, 128)))?.details.sizeMatch).toBe(100);
  });
});
