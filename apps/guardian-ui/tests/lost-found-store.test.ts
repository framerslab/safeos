/**
 * Lost & Found Store Tests
 * 
 * Tests for the Zustand store managing lost pet/person
 * watch mode state.
 * 
 * @module tests/lost-found-store.test
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { VisualFingerprint } from '../src/lib/visual-fingerprint';
import type { MatchResult } from '../src/lib/subject-matcher';

// =============================================================================
// Mock localStorage before any imports that use Zustand persist
// =============================================================================

const mockStorage: Record<string, string> = {};
const localStorageMock = {
  getItem: jest.fn((key: string) => mockStorage[key] || null),
  setItem: jest.fn((key: string, value: string) => {
    mockStorage[key] = value;
  }),
  removeItem: jest.fn((key: string) => {
    delete mockStorage[key];
  }),
  clear: jest.fn(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  }),
  length: 0,
  key: jest.fn(() => null),
};

// Ensure localStorage is available globally
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// =============================================================================
// Mock Fingerprint Helper
// =============================================================================

function createMockFingerprint(name: string = 'Test Subject'): VisualFingerprint {
  return {
    id: `fp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name,
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
  };
}

function createMockMatchResult(confidence: number = 75): MatchResult {
  return {
    id: `match-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: Date.now(),
    confidence,
    details: {
      colorMatch: 80,
      dominantMatch: 70,
      edgeMatch: 65,
      sizeMatch: 85,
    },
    frameData: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...',
    processingTimeMs: 25,
  };
}

// =============================================================================
// Helper Function Tests
// =============================================================================

describe('Lost & Found Store Helpers', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  describe('createSubjectProfile', () => {
    it('should create a profile with all required fields', async () => {
      const { createSubjectProfile } = await import('../src/stores/lost-found-store');
      
      const mockFingerprint = createMockFingerprint('Max');
      const profile = createSubjectProfile(
        'Max',
        'pet',
        'Golden retriever',
        mockFingerprint,
        ['data:image/png;base64,...']
      );
      
      expect(profile.id).toBeTruthy();
      expect(profile.name).toBe('Max');
      expect(profile.type).toBe('pet');
      expect(profile.description).toBe('Golden retriever');
      expect(profile.fingerprint).toEqual(mockFingerprint);
      expect(profile.referenceImages).toHaveLength(1);
      expect(profile.matchCount).toBe(0);
      expect(profile.lastActiveAt).toBeNull();
    });

    it('should generate unique IDs for different profiles', async () => {
      const { createSubjectProfile } = await import('../src/stores/lost-found-store');
      
      const mockFingerprint = createMockFingerprint();
      const profile1 = createSubjectProfile('A', 'pet', '', mockFingerprint, []);
      const profile2 = createSubjectProfile('B', 'person', '', mockFingerprint, []);
      
      expect(profile1.id).not.toBe(profile2.id);
    });

    it('should handle different subject types', async () => {
      const { createSubjectProfile } = await import('../src/stores/lost-found-store');
      
      const mockFingerprint = createMockFingerprint();
      
      const petProfile = createSubjectProfile('Pet', 'pet', '', mockFingerprint, []);
      expect(petProfile.type).toBe('pet');
      
      const personProfile = createSubjectProfile('Person', 'person', '', mockFingerprint, []);
      expect(personProfile.type).toBe('person');
      
      const otherProfile = createSubjectProfile('Other', 'other', '', mockFingerprint, []);
      expect(otherProfile.type).toBe('other');
    });
  });

  describe('createMatchFrame', () => {
    it('should create a match frame from match result', async () => {
      const { createMatchFrame } = await import('../src/stores/lost-found-store');
      
      const mockResult = createMockMatchResult(75);
      const frame = createMatchFrame('subject-id', mockResult, false);
      
      expect(frame.id).toBe(mockResult.id);
      expect(frame.subjectId).toBe('subject-id');
      expect(frame.confidence).toBe(75);
      expect(frame.acknowledged).toBe(false);
      expect(frame.details).toEqual(mockResult.details);
      expect(frame.alerted).toBe(false);
    });

    it('should include frame data if available', async () => {
      const { createMatchFrame } = await import('../src/stores/lost-found-store');
      
      const mockResult = createMockMatchResult();
      const frame = createMatchFrame('subject-id', mockResult, false);
      
      expect(frame.frameData).toBe(mockResult.frameData);
    });
  });

  describe('getSubjectTypeLabel', () => {
    it('should return correct label for pet', async () => {
      const { getSubjectTypeLabel } = await import('../src/stores/lost-found-store');
      expect(getSubjectTypeLabel('pet')).toBe('Pet');
    });

    it('should return correct label for person', async () => {
      const { getSubjectTypeLabel } = await import('../src/stores/lost-found-store');
      expect(getSubjectTypeLabel('person')).toBe('Person');
    });

    it('should return correct label for other', async () => {
      const { getSubjectTypeLabel } = await import('../src/stores/lost-found-store');
      expect(getSubjectTypeLabel('other')).toBe('Other');
    });
  });

  describe('getMatcherSettings', () => {
    it('should convert store settings to matcher settings', async () => {
      const { getMatcherSettings, DEFAULT_SETTINGS } = await import('../src/stores/lost-found-store');
      
      const matcherSettings = getMatcherSettings(DEFAULT_SETTINGS);
      
      expect(matcherSettings.colorSensitivity).toBe(DEFAULT_SETTINGS.colorSensitivity);
      expect(matcherSettings.minConfidenceForRecord).toBe(DEFAULT_SETTINGS.minConfidenceForRecord);
      expect(matcherSettings.minConfidenceForAlert).toBe(DEFAULT_SETTINGS.minConfidenceForAlert);
    });

    it('should include processing mode', async () => {
      const { getMatcherSettings, DEFAULT_SETTINGS } = await import('../src/stores/lost-found-store');
      
      const matcherSettings = getMatcherSettings(DEFAULT_SETTINGS);
      expect(matcherSettings.processingMode).toBe(DEFAULT_SETTINGS.processingMode);
    });
  });
});

// =============================================================================
// Default Settings Tests
// =============================================================================

describe('Default Settings', () => {
  it('should have reasonable default values', async () => {
    const { DEFAULT_SETTINGS } = await import('../src/stores/lost-found-store');
    
    expect(DEFAULT_SETTINGS.colorSensitivity).toBeGreaterThan(0);
    expect(DEFAULT_SETTINGS.colorSensitivity).toBeLessThanOrEqual(100);
    
    expect(DEFAULT_SETTINGS.minConfidenceForRecord).toBeGreaterThan(0);
    expect(DEFAULT_SETTINGS.minConfidenceForRecord).toBeLessThan(DEFAULT_SETTINGS.minConfidenceForAlert);
    
    expect(DEFAULT_SETTINGS.processingMode).toBe('local');
    expect(DEFAULT_SETTINGS.maxStoredFrames).toBeGreaterThan(0);
  });

  it('should have audio alert settings', async () => {
    const { DEFAULT_SETTINGS } = await import('../src/stores/lost-found-store');
    
    expect(typeof DEFAULT_SETTINGS.alertSound).toBe('boolean');
    expect(typeof DEFAULT_SETTINGS.alertVolume).toBe('number');
    expect(DEFAULT_SETTINGS.alertVolume).toBeGreaterThan(0);
    expect(DEFAULT_SETTINGS.alertVolume).toBeLessThanOrEqual(100);
  });

  it('should have notification settings', async () => {
    const { DEFAULT_SETTINGS } = await import('../src/stores/lost-found-store');
    
    expect(typeof DEFAULT_SETTINGS.alertNotification).toBe('boolean');
    expect(typeof DEFAULT_SETTINGS.alertRepeat).toBe('boolean');
  });
});

// =============================================================================
// Store State Tests (Direct Store Access)
// =============================================================================

describe('Store State', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('should have initial state defined', async () => {
    const { useLostFoundStore } = await import('../src/stores/lost-found-store');
    const state = useLostFoundStore.getState();
    
    expect(state.subjects).toBeDefined();
    expect(Array.isArray(state.subjects)).toBe(true);
    expect(state.activeSubject).toBeNull();
    expect(state.isWatching).toBe(false);
  });

  it('should have settings in initial state', async () => {
    const { useLostFoundStore, DEFAULT_SETTINGS } = await import('../src/stores/lost-found-store');
    const state = useLostFoundStore.getState();
    
    expect(state.settings).toBeDefined();
    expect(state.settings.colorSensitivity).toBe(DEFAULT_SETTINGS.colorSensitivity);
  });

  it('should have match tracking in initial state', async () => {
    const { useLostFoundStore } = await import('../src/stores/lost-found-store');
    const state = useLostFoundStore.getState();
    
    expect(state.currentConfidence).toBe(0);
    expect(state.consecutiveMatches).toBe(0);
    expect(state.recentMatches).toEqual([]);
    expect(state.matchFrames).toEqual([]);
  });
});

// =============================================================================
// Store Actions Tests (Direct Store Access)
// =============================================================================

describe('Store Actions', () => {
  beforeEach(() => {
    // Clear localStorage mock
    localStorageMock.clear();
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe('Subject Management', () => {
    it('should add subjects via action', async () => {
      const { useLostFoundStore, createSubjectProfile } = await import('../src/stores/lost-found-store');
      
      const mockFingerprint = createMockFingerprint('Buddy');
      const profile = createSubjectProfile('Buddy', 'pet', 'A friendly dog', mockFingerprint, []);
      
      useLostFoundStore.getState().addSubject(profile);
      
      const state = useLostFoundStore.getState();
      expect(state.subjects).toContainEqual(profile);
    });

    it('should remove subjects via action', async () => {
      const { useLostFoundStore, createSubjectProfile } = await import('../src/stores/lost-found-store');
      
      const mockFingerprint = createMockFingerprint('ToRemove');
      const profile = createSubjectProfile('ToRemove', 'pet', '', mockFingerprint, []);
      
      useLostFoundStore.getState().addSubject(profile);
      expect(useLostFoundStore.getState().subjects).toHaveLength(1);
      
      useLostFoundStore.getState().removeSubject(profile.id);
      expect(useLostFoundStore.getState().subjects).toHaveLength(0);
    });

    it('should set active subject', async () => {
      const { useLostFoundStore, createSubjectProfile } = await import('../src/stores/lost-found-store');
      
      const mockFingerprint = createMockFingerprint('Active');
      const profile = createSubjectProfile('Active', 'pet', '', mockFingerprint, []);
      
      useLostFoundStore.getState().addSubject(profile);
      useLostFoundStore.getState().setActiveSubject(profile);
      
      const state = useLostFoundStore.getState();
      expect(state.activeSubject).not.toBeNull();
      expect(state.activeSubject?.name).toBe('Active');
    });
  });

  describe('Watching State', () => {
    it('should start and stop watching', async () => {
      const { useLostFoundStore, createSubjectProfile } = await import('../src/stores/lost-found-store');
      
      const mockFingerprint = createMockFingerprint('Watch');
      const profile = createSubjectProfile('Watch', 'pet', '', mockFingerprint, []);
      
      useLostFoundStore.getState().addSubject(profile);
      useLostFoundStore.getState().setActiveSubject(profile);
      useLostFoundStore.getState().startWatching();
      
      expect(useLostFoundStore.getState().isWatching).toBe(true);
      
      useLostFoundStore.getState().stopWatching();
      expect(useLostFoundStore.getState().isWatching).toBe(false);
    });
  });

  describe('Settings Management', () => {
    it('should update settings', async () => {
      const { useLostFoundStore } = await import('../src/stores/lost-found-store');
      
      useLostFoundStore.getState().updateSettings({ colorSensitivity: 90 });
      
      expect(useLostFoundStore.getState().settings.colorSensitivity).toBe(90);
    });
  });

  describe('Confidence Tracking', () => {
    it('should update current confidence', async () => {
      const { useLostFoundStore } = await import('../src/stores/lost-found-store');
      
      useLostFoundStore.getState().updateCurrentConfidence(75);
      expect(useLostFoundStore.getState().currentConfidence).toBe(75);
    });

    it('should update consecutive matches', async () => {
      const { useLostFoundStore } = await import('../src/stores/lost-found-store');
      
      useLostFoundStore.getState().updateConsecutiveMatches(5);
      expect(useLostFoundStore.getState().consecutiveMatches).toBe(5);
    });
  });

  describe('Recent Matches', () => {
    it('should add recent matches', async () => {
      const { useLostFoundStore } = await import('../src/stores/lost-found-store');
      
      const matchResult = createMockMatchResult(80);
      useLostFoundStore.getState().addRecentMatch(matchResult);
      
      expect(useLostFoundStore.getState().recentMatches).toHaveLength(1);
      expect(useLostFoundStore.getState().recentMatches[0].confidence).toBe(80);
    });

    it('should limit recent matches to 20', async () => {
      const { useLostFoundStore } = await import('../src/stores/lost-found-store');
      
      // Add more than 20 matches
      for (let i = 0; i < 25; i++) {
        useLostFoundStore.getState().addRecentMatch(createMockMatchResult(50 + i));
      }
      
      expect(useLostFoundStore.getState().recentMatches.length).toBeLessThanOrEqual(20);
    });
  });
});

// =============================================================================
// The spoken line a device saved
// =============================================================================

describe('The saved spoken line', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('a device that saved the earlier spoken line speaks the new one, and a line the person wrote stays', async () => {
    const { migrateLostFound, DEFAULT_SETTINGS } = await import('../src/stores/lost-found-store');
    const { EARLIER_SPOKEN_DEFAULT, SPOKEN_DEFAULT } = await import('../src/lib/lost-found-words');

    const saved = { settings: { ...DEFAULT_SETTINGS, customMediaTTSMessages: [EARLIER_SPOKEN_DEFAULT, 'Come and look'] } };
    const migrated = migrateLostFound(saved, 0) as typeof saved;
    expect(migrated.settings.customMediaTTSMessages).toEqual([SPOKEN_DEFAULT, 'Come and look']);

    const noSettings = { subjects: [], chosenPetId: null };
    expect(migrateLostFound(noSettings, 0)).toEqual(noSettings);
  });

  it('a device that saved the earlier spoken line reads the new one when the store loads', async () => {
    const { EARLIER_SPOKEN_DEFAULT, SPOKEN_DEFAULT } = await import('../src/lib/lost-found-words');
    localStorageMock.setItem('safeos-lost-found', JSON.stringify({
      state: { subjects: [], chosenPetId: null, settings: { customMediaTTSEnabled: true, customMediaTTSMessages: [EARLIER_SPOKEN_DEFAULT, 'Come and look'] } },
      version: 0,
    }));

    const { useLostFoundStore } = await import('../src/stores/lost-found-store');

    expect(useLostFoundStore.getState().settings.customMediaTTSMessages).toEqual([SPOKEN_DEFAULT, 'Come and look']);
  });
});
