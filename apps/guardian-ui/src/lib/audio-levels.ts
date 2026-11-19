/**
 * Audio Level Analysis
 *
 * Client-side audio level detection and cry pattern recognition.
 *
 * @module lib/audio-levels
 */

// =============================================================================
// Types
// =============================================================================

export interface FrequencyBands {
  bass: number; // 0-300Hz
  mid: number; // 300-2000Hz
  high: number; // 2000-8000Hz
  veryHigh: number; // 8000Hz+
}

export interface CryAnalysis {
  isCrying: boolean;
  confidence: number;
  pattern: 'none' | 'whimper' | 'cry' | 'scream';
  duration: number;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Audio thresholds per scenario (percentage of max level)
 */
export const AUDIO_THRESHOLDS = {
  pet: {
    ambient: 15, // Normal background noise
    bark: 45, // Dog barking
    distress: 65, // Distress sounds
  },
  baby: {
    ambient: 10, // Very quiet room
    fuss: 25, // Fussing sounds
    cry: 40, // Crying
    scream: 70, // Screaming
  },
  elderly: {
    ambient: 12, // Normal room noise
    speech: 25, // Speaking
    call: 45, // Calling for help
    distress: 60, // Distress sounds
  },
  security: {
    ambient: 5, // Very sensitive - detect any sound
    activity: 20, // General activity
    speech: 30, // Human speech
    alert: 50, // Loud noises that may indicate break-in
  },
};

// Cry detection frequencies (Hz)
const CRY_FREQUENCY_RANGE = {
  min: 300,
  max: 600,
  fundamental: 450, // Typical baby cry fundamental frequency
};

// Pattern detection state
let cryPatternBuffer: number[] = [];
let cryStartTime: number | null = null;
const CRY_BUFFER_SIZE = 20; // ~2 seconds at 100ms intervals

// =============================================================================
// Core Functions
// =============================================================================

/** The pitches the sound check reads, in Hz, from `low` to `high`. */
export interface PitchRange {
  low: number;
  high: number;
}

/** The audio settings that choose the pitches the sound check reads. */
export interface PitchSettings {
  frequencyRange: string;
  customLowFreq: number;
  customHighFreq: number;
}

/**
 * The pitch range the sound check reads: the two pitches set under Custom
 * Range, 300 to 600 Hz under Baby Cry Detection (the range its line names),
 * and every pitch (null) otherwise.
 */
export function pitchRangeOf(settings: PitchSettings): PitchRange | null {
  if (settings.frequencyRange === 'custom') {
    const { customLowFreq: a, customHighFreq: b } = settings;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return { low: Math.min(a, b), high: Math.max(a, b) };
  }
  if (settings.frequencyRange === 'baby_cry') return { low: 300, high: 600 };
  return null;
}

/** The analyser's size for every pitch. */
export const ANALYSER_SIZE = 256;
/**
 * The analyser's size for a pitch range: about 23 Hz a bin at 48 kHz, fine
 * enough that a sound below or above the range stays out of the bins inside it.
 */
export const PITCH_RANGE_ANALYSER_SIZE = 2048;

/** The analyser's size the sound check uses for `range`. */
export function analyserSizeFor(range: PitchRange | null): number {
  return range ? PITCH_RANGE_ANALYSER_SIZE : ANALYSER_SIZE;
}

/**
 * The analyser's bins whose pitch lies inside `range`, as [first, last]. A
 * range narrower than a bin reads the one bin nearest its middle.
 */
export function binsInRange(
  range: PitchRange,
  binCount: number,
  sampleRate: number,
  fftSize: number,
): [number, number] {
  const binWidth = sampleRate / fftSize;
  const last = binCount - 1;
  const clamp = (bin: number) => Math.max(0, Math.min(last, bin));
  const first = Math.ceil(range.low / binWidth);
  const end = Math.floor(range.high / binWidth);
  if (first > end) {
    const middle = clamp(Math.round((range.low + range.high) / 2 / binWidth));
    return [middle, middle];
  }
  return [clamp(first), clamp(end)];
}

/**
 * Get overall audio level from analyser
 *
 * @param analyser - Web Audio AnalyserNode
 * @param range - The pitches to read; every pitch when none is given
 * @returns Normalized audio level (0-1), from the bins inside the range
 */
export function getAudioLevel(analyser: AnalyserNode, range: PitchRange | null = null): number {
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  const [first, last] = range
    ? binsInRange(range, bufferLength, analyser.context.sampleRate, analyser.fftSize)
    : [0, bufferLength - 1];

  // Calculate RMS (Root Mean Square)
  let sum = 0;
  for (let i = first; i <= last; i++) {
    sum += dataArray[i] * dataArray[i];
  }
  const rms = Math.sqrt(sum / (last - first + 1));

  // Normalize to 0-1 (max byte value is 255)
  return rms / 255;
}

/**
 * Get frequency levels for different bands
 *
 * @param analyser - Web Audio AnalyserNode
 * @returns Frequency band levels
 */
export function getFrequencyLevels(analyser: AnalyserNode): FrequencyBands {
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  // Calculate frequency per bin
  const sampleRate = analyser.context.sampleRate;
  const binWidth = sampleRate / analyser.fftSize;

  // Define band boundaries in bin indices
  const bassEnd = Math.floor(300 / binWidth);
  const midEnd = Math.floor(2000 / binWidth);
  const highEnd = Math.floor(8000 / binWidth);

  // Calculate average for each band
  const bands: FrequencyBands = {
    bass: averageRange(dataArray, 0, bassEnd),
    mid: averageRange(dataArray, bassEnd, midEnd),
    high: averageRange(dataArray, midEnd, highEnd),
    veryHigh: averageRange(dataArray, highEnd, bufferLength),
  };

  // Normalize to 0-1
  return {
    bass: bands.bass / 255,
    mid: bands.mid / 255,
    high: bands.high / 255,
    veryHigh: bands.veryHigh / 255,
  };
}

/**
 * Detect crying pattern (for baby monitoring)
 *
 * @param analyser - Web Audio AnalyserNode
 * @returns Whether crying is detected
 */
export function detectCryingPattern(analyser: AnalyserNode): boolean {
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  const sampleRate = analyser.context.sampleRate;
  const binWidth = sampleRate / analyser.fftSize;

  // Get cry frequency range bins
  const minBin = Math.floor(CRY_FREQUENCY_RANGE.min / binWidth);
  const maxBin = Math.floor(CRY_FREQUENCY_RANGE.max / binWidth);

  // Calculate energy in cry frequency range
  const cryEnergy = averageRange(dataArray, minBin, maxBin);

  // Calculate energy outside cry range for comparison
  const lowEnergy = averageRange(dataArray, 0, minBin);
  const highEnergy = averageRange(dataArray, maxBin, bufferLength);
  const otherEnergy = (lowEnergy + highEnergy) / 2;

  // Crying has concentrated energy in 300-600Hz range
  const isCryFrequency = cryEnergy > otherEnergy * 1.5 && cryEnergy > 50;

  // Add to pattern buffer
  cryPatternBuffer.push(isCryFrequency ? 1 : 0);
  if (cryPatternBuffer.length > CRY_BUFFER_SIZE) {
    cryPatternBuffer.shift();
  }

  // Check for sustained crying pattern (at least 60% of recent samples)
  const cryRatio = cryPatternBuffer.reduce((a, b) => a + b, 0) / cryPatternBuffer.length;
  const isCrying = cryRatio >= 0.6 && cryPatternBuffer.length >= 5;

  // Track cry duration
  if (isCrying && !cryStartTime) {
    cryStartTime = Date.now();
  } else if (!isCrying) {
    cryStartTime = null;
  }

  return isCrying;
}

/**
 * Analyze crying pattern in detail
 *
 * @param analyser - Web Audio AnalyserNode
 * @returns Detailed cry analysis
 */
export function analyzeCrying(analyser: AnalyserNode): CryAnalysis {
  const isCrying = detectCryingPattern(analyser);
  const level = getAudioLevel(analyser);
  const bands = getFrequencyLevels(analyser);

  // Determine pattern type based on intensity
  let pattern: CryAnalysis['pattern'] = 'none';
  if (isCrying) {
    if (level > 0.7) {
      pattern = 'scream';
    } else if (level > 0.4) {
      pattern = 'cry';
    } else {
      pattern = 'whimper';
    }
  }

  // Calculate confidence based on frequency distribution
  let confidence = 0;
  if (isCrying) {
    // Higher confidence when mid-range dominates
    const midRatio = bands.mid / (bands.bass + bands.high + 0.01);
    confidence = Math.min(midRatio / 2, 1);
  }

  // Calculate duration
  const duration = cryStartTime ? Date.now() - cryStartTime : 0;

  return {
    isCrying,
    confidence,
    pattern,
    duration,
  };
}

// =============================================================================
// Scenario-Specific Detection
// =============================================================================

/**
 * Detect pet sounds
 */
export function detectPetSounds(
  analyser: AnalyserNode
): { type: 'none' | 'bark' | 'whine' | 'distress'; confidence: number } {
  const level = getAudioLevel(analyser);
  const bands = getFrequencyLevels(analyser);

  // Barking: loud bursts in mid-range
  if (level > 0.5 && bands.mid > bands.bass * 1.2) {
    return { type: 'bark', confidence: Math.min(level, 0.9) };
  }

  // Whining: high-pitched sustained
  if (bands.high > bands.mid * 1.3 && level > 0.2) {
    return { type: 'whine', confidence: Math.min(bands.high, 0.8) };
  }

  // Distress: very loud with high frequencies
  if (level > 0.7 && bands.veryHigh > 0.3) {
    return { type: 'distress', confidence: 0.9 };
  }

  return { type: 'none', confidence: 0 };
}

/**
 * Detect elderly distress sounds
 */
export function detectElderlyDistress(
  analyser: AnalyserNode
): { type: 'none' | 'speech' | 'call' | 'distress'; confidence: number } {
  const level = getAudioLevel(analyser);
  const bands = getFrequencyLevels(analyser);

  // Distress call: sudden loud vocalization
  if (level > 0.6 && bands.mid > 0.5) {
    return { type: 'distress', confidence: 0.8 };
  }

  // Calling for help: sustained mid-range
  if (level > 0.35 && bands.mid > bands.bass) {
    return { type: 'call', confidence: 0.6 };
  }

  // Normal speech
  if (level > 0.15 && bands.mid > 0.2) {
    return { type: 'speech', confidence: 0.5 };
  }

  return { type: 'none', confidence: 0 };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Calculate average of array range
 */
function averageRange(
  array: Uint8Array,
  start: number,
  end: number
): number {
  if (end <= start) return 0;

  let sum = 0;
  const actualEnd = Math.min(end, array.length);
  for (let i = start; i < actualEnd; i++) {
    sum += array[i];
  }
  return sum / (actualEnd - start);
}

/**
 * Reset cry pattern buffer (call when scenario changes)
 */
export function resetCryDetection(): void {
  cryPatternBuffer = [];
  cryStartTime = null;
}

/**
 * Get audio threshold for scenario
 */
export function getThresholdForScenario(
  scenario: 'pet' | 'baby' | 'elderly' | 'security',
  level: 'ambient' | 'medium' | 'high' = 'medium'
): number {
  switch (level) {
    case 'ambient':
      return AUDIO_THRESHOLDS[scenario].ambient;
    case 'medium':
      if (scenario === 'baby') {
        return AUDIO_THRESHOLDS.baby.fuss ?? 25;
      } else if (scenario === 'pet') {
        return AUDIO_THRESHOLDS.pet.bark ?? 45;
      } else if (scenario === 'security') {
        return AUDIO_THRESHOLDS.security.activity ?? 20;
      } else {
        return AUDIO_THRESHOLDS.elderly.speech ?? 25;
      }
    case 'high':
      if (scenario === 'baby') {
        return AUDIO_THRESHOLDS.baby.cry ?? 40;
      } else if (scenario === 'pet') {
        return AUDIO_THRESHOLDS.pet.distress ?? 65;
      } else if (scenario === 'security') {
        return AUDIO_THRESHOLDS.security.alert ?? 50;
      } else {
        return AUDIO_THRESHOLDS.elderly.distress ?? 60;
      }
    default:
      return 20;
  }
}

export default {
  getAudioLevel,
  getFrequencyLevels,
  detectCryingPattern,
  analyzeCrying,
  detectPetSounds,
  detectElderlyDistress,
  resetCryDetection,
  getThresholdForScenario,
  AUDIO_THRESHOLDS,
};
