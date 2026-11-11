/**
 * Audio Analyzer
 *
 * Server-side audio analysis for cry detection, distress sounds, etc.
 *
 * @module lib/audio/analyzer
 */

import type { MonitoringScenario } from '../../types/index.js';

// =============================================================================
// Types
// =============================================================================

export interface AudioAnalysisResult {
  level: number; // 0-100
  classification: AudioClassification;
  confidence: number; // 0-1
  patterns: AudioPattern[];
  requiresAttention: boolean;
  scenario: MonitoringScenario;
}

export type AudioClassification =
  | 'silence'
  | 'ambient'
  | 'speech'
  | 'cry'
  | 'distress'
  | 'bark'
  | 'meow'
  | 'alarm'
  | 'impact'
  | 'unknown';

export interface AudioPattern {
  type: string;
  startMs: number;
  durationMs: number;
  confidence: number;
}

export interface AudioThresholds {
  silenceLevel: number;
  ambientLevel: number;
  alertLevel: number;
  criticalLevel: number;
}

// Frequency band analysis
export interface FrequencyBands {
  bass: number; // 20-250 Hz
  lowMid: number; // 250-500 Hz
  mid: number; // 500-2000 Hz
  highMid: number; // 2000-4000 Hz
  high: number; // 4000-8000 Hz
  presence: number; // 8000-20000 Hz
}

// =============================================================================
// Constants
// =============================================================================

const SCENARIO_THRESHOLDS: Record<MonitoringScenario, AudioThresholds> = {
  baby: {
    silenceLevel: 5,
    ambientLevel: 20,
    alertLevel: 50,
    criticalLevel: 75,
  },
  pet: {
    silenceLevel: 5,
    ambientLevel: 25,
    alertLevel: 55,
    criticalLevel: 80,
  },
  elderly: {
    silenceLevel: 3,
    ambientLevel: 15,
    alertLevel: 45,
    criticalLevel: 70,
  },
  security: {
    silenceLevel: 2,
    ambientLevel: 10,
    alertLevel: 30,
    criticalLevel: 50,
  },
};

// Cry detection patterns based on frequency distribution
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- known gap, tracked in issue 2: the cry detector does not read these patterns yet
const CRY_PATTERNS = {
  baby: {
    // Baby cries typically 250-600 Hz fundamental with harmonics
    frequencyRange: { min: 250, max: 600 },
    durationRange: { min: 300, max: 3000 }, // ms
    rhythmic: true,
    harmonicRatio: 1.5,
  },
  distress: {
    // Distress calls are higher pitched, more irregular
    frequencyRange: { min: 400, max: 2000 },
    durationRange: { min: 100, max: 2000 },
    rhythmic: false,
    harmonicRatio: 2.0,
  },
};

// =============================================================================
// AudioAnalyzer Class
// =============================================================================

export class AudioAnalyzer {
  private scenario: MonitoringScenario;
  private thresholds: AudioThresholds;
  private recentSamples: number[] = [];
  private maxSamples = 100;

  // Pattern detection state
  private potentialCryStart: number | null = null;
  private cryPatternCount = 0;

  // Stats
  private stats = {
    samplesAnalyzed: 0,
    criesDetected: 0,
    distressDetected: 0,
    alertsTriggered: 0,
  };

  constructor(scenario: MonitoringScenario = 'baby') {
    this.scenario = scenario;
    this.thresholds = SCENARIO_THRESHOLDS[scenario];
  }

  // ---------------------------------------------------------------------------
  // Public Methods
  // ---------------------------------------------------------------------------

  /**
   * Analyze an audio level sample
   */
  analyzeLevel(level: number): AudioAnalysisResult {
    this.stats.samplesAnalyzed++;
    this.recentSamples.push(level);
    if (this.recentSamples.length > this.maxSamples) {
      this.recentSamples.shift();
    }

    const classification = this.classifyLevel(level);
    const patterns = this.detectPatterns();
    const requiresAttention = this.requiresAttention(level, classification);

    if (classification === 'cry') {
      this.stats.criesDetected++;
    }
    if (classification === 'distress') {
      this.stats.distressDetected++;
    }
    if (requiresAttention) {
      this.stats.alertsTriggered++;
    }

    return {
      level,
      classification,
      confidence: this.getConfidence(level, classification),
      patterns,
      requiresAttention,
      scenario: this.scenario,
    };
  }

  /**
   * Analyze frequency bands for more accurate classification
   */
  analyzeFrequencies(bands: FrequencyBands): AudioClassification {
    const { bass, lowMid, mid, highMid, high } = bands;

    // Baby cry detection: strong mid frequencies (300-600 Hz)
    if (this.scenario === 'baby') {
      const midRatio = mid / (bass + 1);
      const highMidRatio = highMid / (mid + 1);

      if (midRatio > 1.5 && highMidRatio > 0.5 && mid > 40) {
        return 'cry';
      }
    }

    // Pet sounds
    if (this.scenario === 'pet') {
      // Dog bark: strong in 150-2000 Hz
      if (lowMid > 50 && mid > 40 && bass > 30) {
        return 'bark';
      }
      // Cat meow: 500-6000 Hz
      if (mid > 45 && highMid > 40 && bass < 20) {
        return 'meow';
      }
    }

    // Impact sound (fall): strong bass, quick decay
    if (bass > 60 && mid < 30 && high < 20) {
      return 'impact';
    }

    // Alarm: high frequencies
    if (high > 50 && highMid > 50) {
      return 'alarm';
    }

    // Speech detection
    if (mid > 30 && lowMid > 20 && highMid > 15) {
      return 'speech';
    }

    // Ambient
    const totalEnergy = bass + lowMid + mid + highMid + high;
    if (totalEnergy < 50) {
      return 'silence';
    }
    if (totalEnergy < 150) {
      return 'ambient';
    }

    return 'unknown';
  }

  /**
   * Detect cry pattern (sustained high audio with rhythm)
   */
  detectCryPattern(): { detected: boolean; confidence: number; durationMs: number } {
    const window = this.recentSamples.slice(-50);
    if (window.length < 10) {
      return { detected: false, confidence: 0, durationMs: 0 };
    }

    // Look for rhythmic pattern above threshold
    let highCount = 0;
    let transitions = 0;
    let lastHigh = false;

    for (const level of window) {
      const isHigh = level > this.thresholds.alertLevel;

      if (isHigh) {
        highCount++;
      }

      if (isHigh !== lastHigh) {
        transitions++;
      }
      lastHigh = isHigh;
    }

    // Cry patterns typically have:
    // - High ratio of loud samples
    // - Rhythmic transitions (not constant)
    const highRatio = highCount / window.length;
    const transitionRatio = transitions / window.length;

    const isCry =
      highRatio > 0.4 &&
      highRatio < 0.9 &&
      transitionRatio > 0.05 &&
      transitionRatio < 0.3;

    const confidence = isCry
      ? Math.min(1, highRatio * (1 - Math.abs(transitionRatio - 0.15) * 5))
      : 0;

    return {
      detected: isCry && confidence > 0.5,
      confidence,
      durationMs: window.length * 100, // Assume 100ms per sample
    };
  }

  /**
   * Check for sustained silence (potential issue with elderly/baby)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- known gap, tracked in issue 2: the threshold is not applied yet
  detectSustainedSilence(thresholdMs: number = 60000): boolean {
    // Would need time tracking - for now just check recent samples
    const allSilent = this.recentSamples.every(
      (s) => s < this.thresholds.silenceLevel
    );
    return allSilent && this.recentSamples.length >= 50;
  }

  /**
   * Get analyzer stats
   */
  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  /**
   * Update scenario
   */
  setScenario(scenario: MonitoringScenario): void {
    this.scenario = scenario;
    this.thresholds = SCENARIO_THRESHOLDS[scenario];
    this.reset();
  }

  /**
   * Reset state
   */
  reset(): void {
    this.recentSamples = [];
    this.potentialCryStart = null;
    this.cryPatternCount = 0;
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  private classifyLevel(level: number): AudioClassification {
    if (level < this.thresholds.silenceLevel) return 'silence';
    if (level < this.thresholds.ambientLevel) return 'ambient';

    // Check for cry pattern
    const cryResult = this.detectCryPattern();
    if (cryResult.detected) return 'cry';

    if (level >= this.thresholds.criticalLevel) return 'distress';

    return 'unknown';
  }

  private detectPatterns(): AudioPattern[] {
    const patterns: AudioPattern[] = [];

    // Detect sustained loud audio
    const recentLoud = this.recentSamples
      .slice(-20)
      .filter((s) => s > this.thresholds.alertLevel);

    if (recentLoud.length > 15) {
      patterns.push({
        type: 'sustained_loud',
        startMs: 0,
        durationMs: recentLoud.length * 100,
        confidence: recentLoud.length / 20,
      });
    }

    // Detect sudden spike
    if (this.recentSamples.length >= 2) {
      const current = this.recentSamples[this.recentSamples.length - 1] || 0;
      const previous = this.recentSamples[this.recentSamples.length - 2] || 0;
      const spike = current - previous;

      if (spike > 30) {
        patterns.push({
          type: 'sudden_spike',
          startMs: 0,
          durationMs: 100,
          confidence: Math.min(1, spike / 50),
        });
      }
    }

    return patterns;
  }

  private requiresAttention(level: number, classification: AudioClassification): boolean {
    if (classification === 'cry' || classification === 'distress') {
      return true;
    }

    if (level >= this.thresholds.criticalLevel) {
      return true;
    }

    // Scenario-specific checks
    if (this.scenario === 'elderly') {
      // Impact sounds could indicate a fall
      if (classification === 'impact') {
        return true;
      }
    }

    return false;
  }

  private getConfidence(level: number, classification: AudioClassification): number {
    if (classification === 'silence' || classification === 'ambient') {
      return 0.9; // High confidence for low levels
    }

    // For detected patterns, confidence based on how clearly it matches
    const normalized = level / 100;
    const cryResult = this.detectCryPattern();

    if (classification === 'cry') {
      return cryResult.confidence;
    }

    return Math.min(0.8, normalized);
  }
}

// =============================================================================
// Singleton
// =============================================================================

let defaultAnalyzer: AudioAnalyzer | null = null;

export function getDefaultAudioAnalyzer(): AudioAnalyzer {
  if (!defaultAnalyzer) {
    defaultAnalyzer = new AudioAnalyzer();
  }
  return defaultAnalyzer;
}

export function createAudioAnalyzer(scenario?: MonitoringScenario): AudioAnalyzer {
  return new AudioAnalyzer(scenario);
}
