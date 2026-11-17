/**
 * Subject Matcher Library
 * 
 * Real-time frame matching engine for lost pet/person detection.
 * Compares camera frames against visual fingerprints.
 * 
 * @module lib/subject-matcher
 */

import {
  VisualFingerprint,
  quickCompare,
  compareFingerprints,
  calculateAverageColor,
  extractDominantColors,
  extractColorHistogram,
  extractEdgeSignature,
  estimateSizeRatio,
  edgeGridSide,
  DEFAULT_EDGE_GRID_SIZE,
  colorDistance,
} from './visual-fingerprint';

// =============================================================================
// Types
// =============================================================================

export interface MatchResult {
  id: string;
  timestamp: number;
  confidence: number;
  details: {
    colorMatch: number;
    dominantMatch: number;
    edgeMatch: number;
    sizeMatch: number;
  };
  frameData?: string;
  region?: MatchRegion;
  processingTimeMs: number;
}

export interface MatchRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface MatcherSettings {
  minConfidenceForAlert: number;      // 0-100, trigger sound/notification
  minConfidenceForRecord: number;     // 0-100, save frame to gallery
  colorSensitivity: number;           // 0-100: 50 leaves scores as they are, lower raises them, higher lowers near matches (an exact match stays 100)
  sizeTolerance: number;              // 0-100, the size difference (points of the picture) at which the size term reaches 0
  scanGridSize: number;               // Grid size for region scanning (4-16)
  processingMode: 'local' | 'hybrid'; // Local only or AI-enhanced
  adaptiveLighting: boolean;          // Move a brighter or darker frame back to the scene's settled brightness before it is scored
  motionPriority: boolean;            // Score only regions that cover a moving cell
}

export interface MatcherState {
  isActive: boolean;
  lastMatch: MatchResult | null;
  matchHistory: MatchResult[];
  consecutiveMatches: number;
  averageConfidence: number;
}

const DEFAULT_SETTINGS: MatcherSettings = {
  minConfidenceForAlert: 70,
  minConfidenceForRecord: 50,
  colorSensitivity: 50,
  sizeTolerance: 50,
  scanGridSize: 8,
  processingMode: 'local',
  adaptiveLighting: true,
  motionPriority: true,
};

/**
 * The least edge strength a region's strongest cell is scaled against. A
 * subject's photos are scaled to their own strongest cell; a region of the
 * camera's frame is scaled to at least this, so a wall, a floor or the sky,
 * whose only edges are the camera's noise, reads weak edges instead of edges
 * as strong as the subject's. 32 is the strength of a cell in which every
 * sample steps about 11 levels in red, green and blue to its neighbour; a step
 * from black to white is 765.
 */
const REGION_EDGE_FLOOR = 32;

/**
 * Adaptive lighting holds each frame at the brightness the scene has settled
 * at, so a light switched on or off changes the scores less. The brightness
 * is kept for each cell of an 8 by 8 grid. A change of light moves every cell
 * the same way; a subject coming into view moves only the cells it covers. So
 * a frame is moved back only when nearly every cell is brighter, or nearly
 * every cell is darker, than where it settled, and then by the median of the
 * cells' differences. The settled brightness follows the scene slowly: a
 * scene whose light holds is scored as the camera gives it, and a lasting
 * change becomes the new settled brightness.
 */

/** The most a frame is brightened or darkened, in levels of 0 to 255. */
const MAX_LIGHTING_CORRECTION = 64;

/**
 * The share of each frame's brightness taken into the settled brightness. At
 * the one or two frames a second the monitor scores, half of a lasting change
 * is taken in after about 35 frames.
 */
const SCENE_ADAPTATION = 0.02;

/** The scene's brightness is read on a grid of this many cells a side. */
const LIGHTING_GRID = 8;

/**
 * The cells, of the grid's 64, that must have moved the same way for a frame
 * to be read as a change of light: seven in eight. A subject over fewer cells
 * leaves the frame as the camera gives it.
 */
const LIGHT_CHANGE_CELLS = 56;

/** A cell has moved when its brightness is more than this many levels from where it settled. */
const CELL_MOVED_LEVELS = 2;

/**
 * The mean brightness, 0 to 255, of each cell of an 8 by 8 grid over the
 * frame, row by row.
 */
function cellBrightnessOf(frameData: ImageData): number[] {
  const { data, width, height } = frameData;
  const cells: number[] = [];

  for (let gy = 0; gy < LIGHTING_GRID; gy++) {
    const y0 = Math.floor((gy * height) / LIGHTING_GRID);
    const y1 = Math.floor(((gy + 1) * height) / LIGHTING_GRID);
    for (let gx = 0; gx < LIGHTING_GRID; gx++) {
      const x0 = Math.floor((gx * width) / LIGHTING_GRID);
      const x1 = Math.floor(((gx + 1) * width) / LIGHTING_GRID);
      let sum = 0;
      let pixels = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          sum += data[i] + data[i + 1] + data[i + 2];
          pixels++;
        }
      }
      // A frame smaller than the grid has empty cells; they read as black in
      // every frame, so they never move.
      cells.push(pixels > 0 ? sum / (pixels * 3) : 0);
    }
  }

  return cells;
}

/**
 * The levels to add to a frame whose cells read `cells` to bring it back to
 * the scene's settled cells: the median of the cells' differences when at
 * least LIGHT_CHANGE_CELLS of them moved the same way, and 0 otherwise.
 */
function lightingCorrectionOf(settled: number[], cells: number[]): number {
  const differences = settled.map((level, i) => level - cells[i]);
  const darker = differences.filter((d) => d > CELL_MOVED_LEVELS).length;
  const brighter = differences.filter((d) => d < -CELL_MOVED_LEVELS).length;
  if (darker < LIGHT_CHANGE_CELLS && brighter < LIGHT_CHANGE_CELLS) {
    return 0;
  }

  differences.sort((a, b) => a - b);
  const middle = Math.floor(differences.length / 2);
  const median =
    differences.length % 2 === 1
      ? differences[middle]
      : (differences[middle - 1] + differences[middle]) / 2;
  return Math.max(-MAX_LIGHTING_CORRECTION, Math.min(MAX_LIGHTING_CORRECTION, median));
}

// =============================================================================
// Subject Matcher Engine
// =============================================================================

export class SubjectMatcher {
  private fingerprint: VisualFingerprint | null = null;
  private settings: MatcherSettings;
  private state: MatcherState;
  private previousFrame: ImageData | null = null;
  private motionMask: boolean[] = [];
  private frameCount: number = 0;
  /** The scene's settled brightness of each lighting cell, 0 to 255; null until a frame is watched. */
  private sceneBrightness: number[] | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  constructor(settings?: Partial<MatcherSettings>) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.state = {
      isActive: false,
      lastMatch: null,
      matchHistory: [],
      consecutiveMatches: 0,
      averageConfidence: 0,
    };

    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }
  }

  private ensureCanvasSize(width: number, height: number): boolean {
    if (!this.canvas || !this.ctx) return false;

    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));

    if (this.canvas.width !== safeWidth || this.canvas.height !== safeHeight) {
      this.canvas.width = safeWidth;
      this.canvas.height = safeHeight;
      this.previousFrame = null;
      this.motionMask = [];
    }

    return true;
  }

  /**
   * Set the subject fingerprint to match against
   */
  setFingerprint(fingerprint: VisualFingerprint | null): void {
    this.fingerprint = fingerprint;
    this.reset();
  }

  /**
   * Get current fingerprint
   */
  getFingerprint(): VisualFingerprint | null {
    return this.fingerprint;
  }

  /**
   * Update matcher settings
   */
  setSettings(settings: Partial<MatcherSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  /**
   * Get current settings
   */
  getSettings(): MatcherSettings {
    return { ...this.settings };
  }

  /**
   * Get current state
   */
  getState(): MatcherState {
    return { ...this.state };
  }

  /**
   * Activate/deactivate matching
   */
  setActive(active: boolean): void {
    this.state.isActive = active;
    if (!active) {
      this.reset();
    }
  }

  /**
   * Reset matcher state
   */
  reset(): void {
    this.state = {
      isActive: this.state.isActive,
      lastMatch: null,
      matchHistory: [],
      consecutiveMatches: 0,
      averageConfidence: 0,
    };
    this.previousFrame = null;
    this.motionMask = [];
    this.frameCount = 0;
    this.sceneBrightness = null;
  }

  /**
   * Process a video frame and check for matches
   */
  processFrame(video: HTMLVideoElement): MatchResult | null {
    if (!this.state.isActive || !this.fingerprint) {
      return null;
    }

    const startTime = performance.now();

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    if (!this.ensureCanvasSize(width, height) || !this.canvas || !this.ctx) {
      return null;
    }

    this.ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
    const frameData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

    // Update motion mask if enabled
    if (this.settings.motionPriority && this.previousFrame) {
      this.updateMotionMask(frameData, this.previousFrame);
    }

    this.previousFrame = this.cloneImageData(frameData);
    this.frameCount++;

    // The gate and the region scores read one frame: the corrected one. The
    // frame's brightness is then taken into the scene's settled brightness.
    const litFrame = this.correctLighting(frameData, true);

    // Quick full-frame check first
    const quickScore = this.quickFrameCheck(litFrame);
    
    if (quickScore < this.settings.minConfidenceForRecord / 2) {
      // No potential match, skip detailed analysis
      return null;
    }

    // Detailed region scanning
    const result = this.scanRegions(litFrame, this.canvas.width, this.canvas.height, startTime);

    if (result) {
      // Update state
      this.state.lastMatch = result;
      this.state.consecutiveMatches++;
      
      // Update average
      const historyLimit = 20;
      this.state.matchHistory = [result, ...this.state.matchHistory].slice(0, historyLimit);
      this.state.averageConfidence = 
        this.state.matchHistory.reduce((s, m) => s + m.confidence, 0) / this.state.matchHistory.length;

      // Include frame data if above record threshold
      if (result.confidence >= this.settings.minConfidenceForRecord) {
        result.frameData = this.canvas.toDataURL('image/jpeg', 0.8);
      }

      return result;
    } else {
      this.state.consecutiveMatches = 0;
    }

    return null;
  }

  /**
   * Process a canvas element directly. A single picture says nothing about
   * how the light is changing, so it is held at the brightness the watched
   * frames settled at, and the settled brightness is left as it is.
   */
  processCanvas(canvas: HTMLCanvasElement): MatchResult | null {
    if (!this.state.isActive || !this.fingerprint) {
      return null;
    }

    const startTime = performance.now();
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }

    const frameData = this.correctLighting(ctx.getImageData(0, 0, canvas.width, canvas.height), false);

    // Quick check
    const quickScore = this.quickFrameCheck(frameData);
    if (quickScore < this.settings.minConfidenceForRecord / 2) {
      return null;
    }

    return this.scanRegions(frameData, canvas.width, canvas.height, startTime);
  }

  /**
   * Quick full-frame color match
   */
  private quickFrameCheck(frameData: ImageData): number {
    if (!this.fingerprint) return 0;

    return quickCompare(this.fingerprint, frameData);
  }

  /**
   * The frame the gate and the region scores read: the camera's frame moved
   * back to the scene's settled brightness, by up to MAX_LIGHTING_CORRECTION
   * levels, when nearly every cell moved the same way (a change of light).
   * The camera's frame itself when adaptive lighting is off, when fewer cells
   * moved (a subject coming into view), and on the first frame watched, which
   * sets the settled brightness. With `learn`, each cell's brightness is then
   * taken into its settled brightness.
   */
  private correctLighting(frameData: ImageData, learn: boolean): ImageData {
    if (!this.settings.adaptiveLighting) {
      return frameData;
    }

    const cells = cellBrightnessOf(frameData);
    const settled = this.sceneBrightness;
    if (learn) {
      this.sceneBrightness =
        settled === null
          ? cells
          : settled.map((level, i) => level + (cells[i] - level) * SCENE_ADAPTATION);
    }
    if (settled === null) {
      return frameData;
    }

    return this.adjustLighting(frameData, Math.round(lightingCorrectionOf(settled, cells)));
  }

  /**
   * Scan regions of the frame for potential matches
   */
  private scanRegions(
    frameData: ImageData,
    width: number,
    height: number,
    startTime: number
  ): MatchResult | null {
    if (!this.fingerprint) return null;

    const gridSize = this.settings.scanGridSize;
    const cellWidth = Math.floor(width / gridSize);
    const cellHeight = Math.floor(height / gridSize);

    let bestMatch: MatchResult | null = null;
    let bestConfidence = 0;

    // Scan grid cells
    for (let gy = 0; gy < gridSize - 1; gy++) {
      for (let gx = 0; gx < gridSize - 1; gx++) {
        // Skip if no motion in this region (when motion priority enabled).
        // A region covers four cells of the motion mask; it is scanned when
        // any of them moved, so motion in the last column or row of cells is
        // covered by the regions that end there.
        if (this.settings.motionPriority && this.motionMask.length > 0) {
          const maskIdx = gy * gridSize + gx;
          const moved =
            this.motionMask[maskIdx] ||
            this.motionMask[maskIdx + 1] ||
            this.motionMask[maskIdx + gridSize] ||
            this.motionMask[maskIdx + gridSize + 1];
          if (!moved) {
            continue;
          }
        }

        // Extract region (2x2 cells for overlap)
        const regionX = gx * cellWidth;
        const regionY = gy * cellHeight;
        const regionW = cellWidth * 2;
        const regionH = cellHeight * 2;

        const regionData = this.extractRegion(
          frameData,
          width,
          height,
          regionX,
          regionY,
          regionW,
          regionH
        );

        if (!regionData) continue;

        // Compare region to fingerprint
        const regionFingerprint = this.createQuickFingerprint(regionData);
        const comparison = compareFingerprints(
          this.fingerprint,
          regionFingerprint,
          undefined,
          this.settings.sizeTolerance
        );

        // Apply sensitivity adjustment
        const adjustedConfidence = this.applySensitivity(comparison.overall);

        if (adjustedConfidence > bestConfidence && adjustedConfidence >= this.settings.minConfidenceForRecord) {
          bestConfidence = adjustedConfidence;
          bestMatch = {
            id: `match-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            timestamp: Date.now(),
            confidence: adjustedConfidence,
            details: {
              colorMatch: comparison.colorMatch,
              dominantMatch: comparison.dominantMatch,
              edgeMatch: comparison.edgeMatch,
              sizeMatch: comparison.sizeMatch,
            },
            region: {
              x: regionX,
              y: regionY,
              width: regionW,
              height: regionH,
              centerX: regionX + regionW / 2,
              centerY: regionY + regionH / 2,
            },
            processingTimeMs: performance.now() - startTime,
          };
        }
      }
    }

    return bestMatch;
  }

  /**
   * Extract a region from image data
   */
  private extractRegion(
    source: ImageData,
    sourceWidth: number,
    sourceHeight: number,
    x: number,
    y: number,
    w: number,
    h: number
  ): ImageData | null {
    // Clamp bounds
    const sx = Math.max(0, Math.min(x, sourceWidth - 1));
    const sy = Math.max(0, Math.min(y, sourceHeight - 1));
    const sw = Math.min(w, sourceWidth - sx);
    const sh = Math.min(h, sourceHeight - sy);

    if (sw <= 0 || sh <= 0) return null;

    const regionData = new Uint8ClampedArray(sw * sh * 4);

    for (let ry = 0; ry < sh; ry++) {
      for (let rx = 0; rx < sw; rx++) {
        const srcIdx = ((sy + ry) * sourceWidth + (sx + rx)) * 4;
        const dstIdx = (ry * sw + rx) * 4;

        regionData[dstIdx] = source.data[srcIdx];
        regionData[dstIdx + 1] = source.data[srcIdx + 1];
        regionData[dstIdx + 2] = source.data[srcIdx + 2];
        regionData[dstIdx + 3] = source.data[srcIdx + 3];
      }
    }

    return new ImageData(regionData, sw, sh);
  }

  /**
   * Create a quick fingerprint from image data (for comparison)
   */
  private createQuickFingerprint(imageData: ImageData): VisualFingerprint {
    const colorHistogram = extractColorHistogram(imageData, 16);
    const dominantColors = extractDominantColors(imageData, 3);
    const averageColor = calculateAverageColor(imageData);
    // Edge signatures are compared cell by cell, so the region is read on the
    // grid the subject was enrolled on. A subject whose signature is not a
    // square grid has no cells to line up with; its region is read on the
    // default grid and its edge term is 0.
    const edgeGrid = edgeGridSide(this.fingerprint?.edgeSignature ?? []) || DEFAULT_EDGE_GRID_SIZE;
    const edgeSignature = extractEdgeSignature(imageData, edgeGrid, REGION_EDGE_FLOOR);
    const sizeRatio = estimateSizeRatio(imageData);

    return {
      id: 'temp',
      name: 'temp',
      colorHistogram,
      dominantColors,
      averageColor,
      colorVariance: 0,
      estimatedSizeRatio: sizeRatio,
      edgeSignature,
      referenceImages: [],
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Update motion mask from frame comparison
   */
  private updateMotionMask(current: ImageData, previous: ImageData): void {
    const gridSize = this.settings.scanGridSize;
    const cellWidth = Math.floor(current.width / gridSize);
    const cellHeight = Math.floor(current.height / gridSize);

    this.motionMask = [];

    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        let diff = 0;
        let samples = 0;

        const startX = gx * cellWidth;
        const startY = gy * cellHeight;

        // Sample pixels in cell
        for (let y = startY; y < startY + cellHeight; y += 4) {
          for (let x = startX; x < startX + cellWidth; x += 4) {
            const idx = (y * current.width + x) * 4;
            if (idx + 2 < current.data.length && idx + 2 < previous.data.length) {
              diff += Math.abs(current.data[idx] - previous.data[idx]);
              diff += Math.abs(current.data[idx + 1] - previous.data[idx + 1]);
              diff += Math.abs(current.data[idx + 2] - previous.data[idx + 2]);
              samples++;
            }
          }
        }

        // Mark cell as having motion if average diff > threshold
        const avgDiff = samples > 0 ? diff / (samples * 3) : 0;
        this.motionMask.push(avgDiff > 10);
      }
    }
  }

  /**
   * Apply lighting adjustment to frame: the same number of levels on red,
   * green and blue, so the frame gets brighter or darker and keeps its
   * colours.
   */
  private adjustLighting(frameData: ImageData, offset: number): ImageData {
    if (offset === 0) {
      return frameData;
    }

    const adjusted = new Uint8ClampedArray(frameData.data.length);
    
    for (let i = 0; i < frameData.data.length; i += 4) {
      adjusted[i] = Math.max(0, Math.min(255, frameData.data[i] + offset));
      adjusted[i + 1] = Math.max(0, Math.min(255, frameData.data[i + 1] + offset));
      adjusted[i + 2] = Math.max(0, Math.min(255, frameData.data[i + 2] + offset));
      adjusted[i + 3] = frameData.data[i + 3];
    }

    return new ImageData(adjusted, frameData.width, frameData.height);
  }

  /**
   * Apply sensitivity settings to confidence score
   */
  private applySensitivity(rawConfidence: number): number {
    // colorSensitivity: 0 = very lenient, 100 = very strict
    // At 50, no adjustment
    const sensitivity = Math.max(0, Math.min(100, this.settings.colorSensitivity));

    if (sensitivity < 50) {
      // Lenient - boost scores, up to double at 0
      return Math.round(Math.min(100, rawConfidence * ((100 - sensitivity) / 50)));
    }

    // Strict - a score loses more of its distance from a perfect match, up
    // to twice that distance at 100. A perfect match reads 100 at every
    // setting, so the strict end lowers near matches and never turns
    // matching off.
    return Math.round(Math.max(0, 100 - (100 - rawConfidence) * (sensitivity / 50)));
  }

  /**
   * Clone ImageData
   */
  private cloneImageData(imageData: ImageData): ImageData {
    return new ImageData(
      new Uint8ClampedArray(imageData.data),
      imageData.width,
      imageData.height
    );
  }

  /**
   * Check if current match exceeds alert threshold
   */
  shouldAlert(): boolean {
    return (
      this.state.lastMatch !== null &&
      this.state.lastMatch.confidence >= this.settings.minConfidenceForAlert
    );
  }

  /**
   * Check if current match should be recorded
   */
  shouldRecord(): boolean {
    return (
      this.state.lastMatch !== null &&
      this.state.lastMatch.confidence >= this.settings.minConfidenceForRecord
    );
  }

  /**
   * Get match history
   */
  getMatchHistory(): MatchResult[] {
    return [...this.state.matchHistory];
  }

  /**
   * Clear match history
   */
  clearHistory(): void {
    this.state.matchHistory = [];
    this.state.averageConfidence = 0;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let matcherInstance: SubjectMatcher | null = null;

export function getSubjectMatcher(settings?: Partial<MatcherSettings>): SubjectMatcher {
  if (!matcherInstance) {
    matcherInstance = new SubjectMatcher(settings);
  } else if (settings) {
    matcherInstance.setSettings(settings);
  }
  return matcherInstance;
}

export function resetSubjectMatcher(): void {
  if (matcherInstance) {
    matcherInstance.reset();
  }
  matcherInstance = null;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Calculate match quality label
 */
export function getMatchQuality(confidence: number): {
  label: string;
  color: string;
  description: string;
} {
  if (confidence >= 85) {
    return {
      label: 'Excellent',
      color: 'green',
      description: 'Very high likelihood of match',
    };
  } else if (confidence >= 70) {
    return {
      label: 'Good',
      color: 'emerald',
      description: 'Strong potential match',
    };
  } else if (confidence >= 55) {
    return {
      label: 'Possible',
      color: 'yellow',
      description: 'Worth checking',
    };
  } else if (confidence >= 40) {
    return {
      label: 'Weak',
      color: 'orange',
      description: 'Low confidence, may be false positive',
    };
  } else {
    return {
      label: 'Unlikely',
      color: 'red',
      description: 'Probably not a match',
    };
  }
}

/**
 * Format match result for display
 */
export function formatMatchResult(result: MatchResult): {
  time: string;
  confidence: string;
  quality: ReturnType<typeof getMatchQuality>;
} {
  const date = new Date(result.timestamp);
  const time = date.toLocaleTimeString();
  const confidence = `${result.confidence}%`;
  const quality = getMatchQuality(result.confidence);

  return { time, confidence, quality };
}

/**
 * Estimate processing mode speed
 */
export function getProcessingInfo(mode: 'local' | 'hybrid'): {
  label: string;
  description: string;
  estimatedLatency: string;
  color: string;
} {
  if (mode === 'local') {
    return {
      label: 'Local Instant',
      description: 'All processing on-device, no internet required',
      estimatedLatency: '< 50ms',
      color: 'green',
    };
  } else {
    return {
      label: 'AI Enhanced',
      description: 'Local + cloud AI for higher accuracy',
      estimatedLatency: '1-5s',
      color: 'blue',
    };
  }
}
