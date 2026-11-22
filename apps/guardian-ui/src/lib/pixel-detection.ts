/**
 * Pixel Detection Engine
 * 
 * Compares video frames pixel-by-pixel to detect changes.
 * Works alongside existing motion detection for more precise alerts.
 */

// =============================================================================
// Types
// =============================================================================

export interface PixelDetectionResult {
  changed: boolean;
  difference: number;        // 0-100 percentage of changed pixels
  changedPixelCount: number; // Absolute count of changed pixels
  totalPixels: number;       // Total pixels analyzed
  hotspots: Hotspot[];       // Areas with significant changes
  zoneStats?: ZonePixelStats[]; // Optional per-zone stats (when zones are provided)
  timestamp: number;
  processingTimeMs: number;  // Time taken for detection (for benchmarking)
  triggeredBy: 'percentage' | 'absolute' | 'none'; // What triggered the alert
}

export interface ZonePixelStats {
  id?: string;
  changedPixelCount: number;
  totalPixels: number;
  difference: number; // 0-100 percentage of changed pixels
  /** The parts of the picture that changed inside this zone, the strongest first, ten at most. */
  hotspots?: Hotspot[];
}

export interface Hotspot {
  x: number;      // Center X (0-100%)
  y: number;      // Center Y (0-100%)
  intensity: number; // Change intensity (0-100)
  width: number;  // Approximate width %
  height: number; // Approximate height %
}

export interface DetectionZone {
  id?: string;
  x: number;      // 0-100 percentage
  y: number;      // 0-100 percentage
  width: number;  // 0-100 percentage
  height: number; // 0-100 percentage
}

export interface PixelDetectionOptions {
  threshold: number;           // 0-100, sensitivity (lower = more sensitive)
  gridSize: number;            // Grid cells for hotspot detection (default: 8)
  minChangePercent: number;    // Minimum % change to trigger (default: 1)
  zones?: DetectionZone[];     // Optional zones to limit detection
  ignoreZones?: DetectionZone[]; // Zones to ignore (e.g., timestamp overlays)
  colorWeight: {               // Weight for each color channel
    r: number;
    g: number;
    b: number;
  };
  // === NEW: Absolute pixel threshold options ===
  absolutePixelThreshold: number;  // Absolute number of pixels (1-1000) to trigger alert
  useAbsoluteThreshold: boolean;   // If true, use absolute count instead of percentage
  instantLocalMode: boolean;       // Skip expensive operations for zero-latency
  downsampleFactor: number;        // Downsample for performance (1 = full, 2 = half, etc.)
}

const DEFAULT_OPTIONS: PixelDetectionOptions = {
  threshold: 30,
  gridSize: 8,
  minChangePercent: 1,
  colorWeight: { r: 0.299, g: 0.587, b: 0.114 }, // Luminance weights
  absolutePixelThreshold: 100,  // Default: 100 pixels must change
  useAbsoluteThreshold: false,  // Default: use percentage
  instantLocalMode: false,      // Default: normal processing
  downsampleFactor: 1,          // Default: no downsampling
};

// =============================================================================
// Sleep Mode Presets (for ultra-sensitive detection)
// =============================================================================

export const SLEEP_DETECTION_PRESETS = {
  /** 
   * Infant Sleep: 5 pixels of movement = alert
   * Ultra-sensitive for co-sleeping or nearby infant monitoring
   */
  infant: {
    threshold: 2,
    absolutePixelThreshold: 5,
    useAbsoluteThreshold: true,
    instantLocalMode: true,
    downsampleFactor: 2,  // Slight downsample for speed
    gridSize: 4,          // Smaller grid for speed
    minChangePercent: 0.01,
  } as Partial<PixelDetectionOptions>,
  
  /**
   * Pet Sleep: 10 pixels of movement = alert
   * For monitoring sleeping pets
   */
  pet: {
    threshold: 5,
    absolutePixelThreshold: 10,
    useAbsoluteThreshold: true,
    instantLocalMode: true,
    downsampleFactor: 2,
    gridSize: 4,
    minChangePercent: 0.05,
  } as Partial<PixelDetectionOptions>,
  
  /**
   * Deep Sleep Ultra: 3 pixels of movement = alert
   * Maximum sensitivity for critical monitoring
   */
  deepSleep: {
    threshold: 1,
    absolutePixelThreshold: 3,
    useAbsoluteThreshold: true,
    instantLocalMode: true,
    downsampleFactor: 1,  // No downsampling, full resolution
    gridSize: 4,
    minChangePercent: 0.001,
  } as Partial<PixelDetectionOptions>,
};

// =============================================================================
// Frame Buffer for Comparison
// =============================================================================

class FrameBuffer {
  private frames: ImageData[] = [];
  private maxFrames: number;

  constructor(maxFrames: number = 3) {
    this.maxFrames = maxFrames;
  }

  push(frame: ImageData): void {
    this.frames.push(frame);
    if (this.frames.length > this.maxFrames) {
      this.frames.shift();
    }
  }

  getPrevious(index: number = 1): ImageData | null {
    const idx = this.frames.length - 1 - index;
    return idx >= 0 ? this.frames[idx] : null;
  }

  clear(): void {
    this.frames = [];
  }

  get length(): number {
    return this.frames.length;
  }
}

// =============================================================================
// Pixel Detection Engine
// =============================================================================

export class PixelDetectionEngine {
  private frameBuffer: FrameBuffer;
  private options: PixelDetectionOptions;
  private lastResult: PixelDetectionResult | null = null;
  private isEnabled: boolean = true;

  constructor(options?: Partial<PixelDetectionOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.frameBuffer = new FrameBuffer(3);
  }

  /**
   * Update detection options
   */
  setOptions(options: Partial<PixelDetectionOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Enable/disable detection
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * Get current enabled state
   */
  getEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Clear frame buffer (call when camera changes)
   */
  reset(): void {
    this.frameBuffer.clear();
    this.lastResult = null;
  }

  /**
   * Get last detection result
   */
  getLastResult(): PixelDetectionResult | null {
    return this.lastResult;
  }

  /**
   * Analyze a video element or canvas
   */
  analyzeVideo(video: HTMLVideoElement): PixelDetectionResult {
    if (!this.isEnabled) {
      return this.createEmptyResult();
    }

    // Create canvas from video
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return this.createEmptyResult();
    }

    // Draw current frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    return this.analyzeCanvas(canvas);
  }

  /**
   * Analyze a canvas element
   */
  analyzeCanvas(canvas: HTMLCanvasElement): PixelDetectionResult {
    if (!this.isEnabled) {
      return this.createEmptyResult();
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return this.createEmptyResult();
    }

    // Get current frame data
    const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const previousFrame = this.frameBuffer.getPrevious();

    // Store current frame
    this.frameBuffer.push(this.cloneImageData(currentFrame));

    // If no previous frame, return no change
    if (!previousFrame) {
      return this.createEmptyResult();
    }

    // Perform detection
    const result = this.detectChanges(currentFrame, previousFrame, canvas.width, canvas.height);
    this.lastResult = result;

    return result;
  }

  /**
   * Analyze ImageData directly (avoids an extra getImageData call).
   */
  analyzeImageData(currentFrame: ImageData): PixelDetectionResult {
    if (!this.isEnabled) {
      return this.createEmptyResult();
    }

    const previousFrame = this.frameBuffer.getPrevious();
    this.frameBuffer.push(this.cloneImageData(currentFrame));

    if (!previousFrame) {
      return this.createEmptyResult();
    }

    const result = this.detectChanges(
      currentFrame,
      previousFrame,
      currentFrame.width,
      currentFrame.height
    );
    this.lastResult = result;
    return result;
  }

  /**
   * Core detection algorithm - enhanced with absolute threshold support
   */
  private detectChanges(
    current: ImageData,
    previous: ImageData,
    width: number,
    height: number
  ): PixelDetectionResult {
    const startTime = performance.now();
    
    const { 
      threshold, 
      gridSize, 
      minChangePercent, 
      colorWeight, 
      zones, 
      ignoreZones,
      absolutePixelThreshold,
      useAbsoluteThreshold,
      instantLocalMode,
      downsampleFactor,
    } = this.options;
    
    // Convert threshold from 0-100 to pixel difference value (0-255)
    const pixelThreshold = Math.round((100 - threshold) * 2.55);
    
    let changedPixels = 0;
    let totalAnalyzedPixels = 0;
    
    // Grid for hotspot detection (skip in instant mode for speed)
    const skipHotspots = instantLocalMode;
    const gridCols = skipHotspots ? 1 : gridSize;
    const gridRows = skipHotspots ? 1 : gridSize;
    const cellWidth = width / gridCols;
    const cellHeight = height / gridRows;
    const gridChanges: number[][] = skipHotspots ? [[0]] : Array(gridRows).fill(null).map(() => Array(gridCols).fill(0));
    const gridTotals: number[][] = skipHotspots ? [[0]] : Array(gridRows).fill(null).map(() => Array(gridCols).fill(0));

    // Step size for downsampling
    const step = Math.max(1, downsampleFactor) * 4; // * 4 for RGBA
    const pixelWeight = Math.max(1, Math.round(downsampleFactor));

    // Precompute zone bounds in pixel space (faster than % conversion per pixel)
    const zoneBounds =
      zones && zones.length > 0
        ? zones.map((z, index) => ({
            id: z.id ?? String(index),
            x1: Math.max(0, Math.floor((z.x / 100) * width)),
            y1: Math.max(0, Math.floor((z.y / 100) * height)),
            x2: Math.min(width, Math.ceil(((z.x + z.width) / 100) * width)),
            y2: Math.min(height, Math.ceil(((z.y + z.height) / 100) * height)),
          }))
        : null;

    const ignoreBounds =
      ignoreZones && ignoreZones.length > 0
        ? ignoreZones.map((z) => ({
            x1: Math.max(0, Math.floor((z.x / 100) * width)),
            y1: Math.max(0, Math.floor((z.y / 100) * height)),
            x2: Math.min(width, Math.ceil(((z.x + z.width) / 100) * width)),
            y2: Math.min(height, Math.ceil(((z.y + z.height) / 100) * height)),
          }))
        : null;

    const isInBounds = (
      x: number,
      y: number,
      bounds: Array<{ x1: number; y1: number; x2: number; y2: number }>
    ) => {
      for (const b of bounds) {
        if (x >= b.x1 && x < b.x2 && y >= b.y1 && y < b.y2) return true;
      }
      return false;
    };

    const zoneTotals = zoneBounds ? Array(zoneBounds.length).fill(0) : null;
    const zoneChanges = zoneBounds ? Array(zoneBounds.length).fill(0) : null;
    // Each zone's own grid: a zone's changed parts are its own, whatever changes in another zone.
    const cells = gridRows * gridCols;
    const zoneGridTotals = zoneBounds && !skipHotspots ? zoneBounds.map(() => new Array<number>(cells).fill(0)) : null;
    const zoneGridChanges = zoneBounds && !skipHotspots ? zoneBounds.map(() => new Array<number>(cells).fill(0)) : null;
    const countInZones = (zones: number[] | null, x: number, y: number, changed: boolean) => {
      if (!zones || !zoneGridTotals || !zoneGridChanges) return;
      const cell = Math.min(Math.floor(y / cellHeight), gridRows - 1) * gridCols + Math.min(Math.floor(x / cellWidth), gridCols - 1);
      for (const zi of zones) {
        zoneGridTotals[zi][cell]++;
        if (changed) zoneGridChanges[zi][cell]++;
      }
    };

    // Iterate through pixels (with optional downsampling)
    for (let i = 0; i < current.data.length; i += step) {
      const pixelIndex = i / 4;
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      
      // If zones are defined, compute which zones this pixel belongs to (union behavior).
      // Note: a pixel may belong to multiple overlapping zones.
      let matchedZones: number[] | null = null;
      if (zoneBounds && zoneBounds.length > 0) {
        matchedZones = [];
        for (let zi = 0; zi < zoneBounds.length; zi++) {
          const b = zoneBounds[zi];
          if (x >= b.x1 && x < b.x2 && y >= b.y1 && y < b.y2) {
            matchedZones.push(zi);
          }
        }
        if (matchedZones.length === 0) continue;
      }
      
      // Check if pixel is in ignore zone (skip in instant mode for speed)
      if (ignoreBounds && ignoreBounds.length > 0 && isInBounds(x, y, ignoreBounds)) {
        continue;
      }
      
      totalAnalyzedPixels += pixelWeight;
      if (matchedZones && zoneTotals) {
        for (const zi of matchedZones) zoneTotals[zi] += pixelWeight;
      }
      
      // Calculate weighted difference
      const rDiff = Math.abs(current.data[i] - previous.data[i]);
      const gDiff = Math.abs(current.data[i + 1] - previous.data[i + 1]);
      const bDiff = Math.abs(current.data[i + 2] - previous.data[i + 2]);
      
      const weightedDiff = (
        rDiff * colorWeight.r +
        gDiff * colorWeight.g +
        bDiff * colorWeight.b
      );
      
      if (weightedDiff > pixelThreshold) {
        changedPixels += pixelWeight;
        if (matchedZones && zoneChanges) {
          for (const zi of matchedZones) zoneChanges[zi] += pixelWeight;
        }
        
        // Early exit for absolute threshold in instant mode
        if (
          useAbsoluteThreshold &&
          instantLocalMode &&
          changedPixels >= absolutePixelThreshold &&
          !(zoneBounds && zoneBounds.length > 0)
        ) {
          const processingTimeMs = performance.now() - startTime;
          return {
            changed: true,
            difference: 0, // Not calculated in early exit
            changedPixelCount: changedPixels,
            totalPixels: totalAnalyzedPixels,
            hotspots: [],
            timestamp: Date.now(),
            processingTimeMs,
            triggeredBy: 'absolute',
          };
        }
        
        // Grid tracking (skip in instant mode)
        if (!skipHotspots) {
          const cellX = Math.min(Math.floor(x / cellWidth), gridCols - 1);
          const cellY = Math.min(Math.floor(y / cellHeight), gridRows - 1);
          gridTotals[cellY][cellX]++;
          gridChanges[cellY][cellX]++;
          countInZones(matchedZones, x, y, true);
        }
      } else if (!skipHotspots) {
        const cellX = Math.min(Math.floor(x / cellWidth), gridCols - 1);
        const cellY = Math.min(Math.floor(y / cellHeight), gridRows - 1);
        gridTotals[cellY][cellX]++;
        countInZones(matchedZones, x, y, false);
      }
    }
    
    // Calculate overall difference percentage
    const difference = totalAnalyzedPixels > 0 
      ? (changedPixels / totalAnalyzedPixels) * 100 
      : 0;
    
    // Determine if change detected (based on mode)
    let triggered = false;
    let triggeredBy: 'percentage' | 'absolute' | 'none' = 'none';
    
    if (useAbsoluteThreshold) {
      triggered = changedPixels >= absolutePixelThreshold;
      if (triggered) triggeredBy = 'absolute';
    } else {
      triggered = difference >= minChangePercent;
      if (triggered) triggeredBy = 'percentage';
    }
    
    // Find hotspots (skip in instant mode): the cells where more than 5% of the samples changed,
    // the strongest first.
    const hotspotsOf = (total: (cell: number) => number, changes: (cell: number) => number): Hotspot[] => {
      const found: Hotspot[] = [];
      const hotspotThreshold = 0.05; // 5% of cell must have changes
      for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
          const cellTotal = total(row * gridCols + col);
          if (cellTotal <= 0) continue;
          const cellChangePercent = changes(row * gridCols + col) / cellTotal;
          if (cellChangePercent > hotspotThreshold) {
            found.push({
              x: ((col + 0.5) / gridCols) * 100,
              y: ((row + 0.5) / gridRows) * 100,
              width: (1 / gridCols) * 100,
              height: (1 / gridRows) * 100,
              intensity: Math.min(cellChangePercent * 100, 100),
            });
          }
        }
      }
      return found.sort((a, b) => b.intensity - a.intensity);
    };
    const hotspots: Hotspot[] = skipHotspots
      ? []
      : hotspotsOf((cell) => gridTotals[Math.floor(cell / gridCols)][cell % gridCols], (cell) => gridChanges[Math.floor(cell / gridCols)][cell % gridCols]);
    
    const processingTimeMs = performance.now() - startTime;

    const zoneStats: ZonePixelStats[] | undefined = zoneBounds && zoneTotals && zoneChanges
      ? zoneBounds.map((b, idx) => {
          const total = zoneTotals[idx] ?? 0;
          const changed = zoneChanges[idx] ?? 0;
          const diff = total > 0 ? (changed / total) * 100 : 0;
          return {
            id: b.id,
            changedPixelCount: changed,
            totalPixels: total,
            difference: Math.round(diff * 100) / 100,
            ...(zoneGridTotals && zoneGridChanges
              ? { hotspots: hotspotsOf((cell) => zoneGridTotals[idx][cell], (cell) => zoneGridChanges[idx][cell]).slice(0, 10) }
              : {}),
          };
        })
      : undefined;
    
    return {
      changed: triggered,
      difference: Math.round(difference * 100) / 100,
      changedPixelCount: changedPixels,
      totalPixels: totalAnalyzedPixels,
      hotspots: hotspots.slice(0, 10), // Limit to top 10 hotspots
      zoneStats,
      timestamp: Date.now(),
      processingTimeMs,
      triggeredBy,
    };
  }

  /**
   * Check if a point is within detection zones
   */
  private isInZone(
    x: number,
    y: number,
    width: number,
    height: number,
    zones?: DetectionZone[]
  ): boolean {
    if (!zones || zones.length === 0) {
      return true; // No zones means entire frame
    }
    
    const xPercent = (x / width) * 100;
    const yPercent = (y / height) * 100;
    
    return zones.some(zone => 
      xPercent >= zone.x &&
      xPercent <= zone.x + zone.width &&
      yPercent >= zone.y &&
      yPercent <= zone.y + zone.height
    );
  }

  /**
   * Clone ImageData (necessary since ImageData is mutable)
   */
  private cloneImageData(imageData: ImageData): ImageData {
    return new ImageData(
      new Uint8ClampedArray(imageData.data),
      imageData.width,
      imageData.height
    );
  }

  /**
   * Create empty result
   */
  private createEmptyResult(): PixelDetectionResult {
    return {
      changed: false,
      difference: 0,
      changedPixelCount: 0,
      totalPixels: 0,
      hotspots: [],
      timestamp: Date.now(),
      processingTimeMs: 0,
      triggeredBy: 'none',
    };
  }
  
  /**
   * Quick check if absolute threshold is exceeded
   * Optimized for sleep monitoring - minimal processing
   */
  quickAbsoluteCheck(video: HTMLVideoElement): { exceeded: boolean; pixelCount: number; timeMs: number } {
    const startTime = performance.now();
    
    if (!this.isEnabled) {
      return { exceeded: false, pixelCount: 0, timeMs: 0 };
    }
    
    const canvas = document.createElement('canvas');
    const scale = 0.25; // 1/4 resolution for speed
    canvas.width = Math.round((video.videoWidth || 320) * scale);
    canvas.height = Math.round((video.videoHeight || 240) * scale);
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { exceeded: false, pixelCount: 0, timeMs: 0 };
    }
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const previousFrame = this.frameBuffer.getPrevious();
    
    this.frameBuffer.push(this.cloneImageData(currentFrame));
    
    if (!previousFrame) {
      return { exceeded: false, pixelCount: 0, timeMs: performance.now() - startTime };
    }
    
    // Very fast comparison - just count significantly changed pixels
    const threshold = Math.round((100 - this.options.threshold) * 2.55);
    let changed = 0;
    const absoluteThreshold = this.options.absolutePixelThreshold;
    
    // Sample every 4th pixel for speed
    for (let i = 0; i < currentFrame.data.length; i += 16) {
      const diff = Math.abs(currentFrame.data[i] - previousFrame.data[i]) +
                   Math.abs(currentFrame.data[i+1] - previousFrame.data[i+1]) +
                   Math.abs(currentFrame.data[i+2] - previousFrame.data[i+2]);
      
      if (diff / 3 > threshold) {
        changed++;
        // Scale up for downsampled image
        if (changed * 16 >= absoluteThreshold) {
          return { 
            exceeded: true, 
            pixelCount: changed * 16, 
            timeMs: performance.now() - startTime 
          };
        }
      }
    }
    
    return { 
      exceeded: false, 
      pixelCount: changed * 16, 
      timeMs: performance.now() - startTime 
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let instance: PixelDetectionEngine | null = null;

export function getPixelDetectionEngine(options?: Partial<PixelDetectionOptions>): PixelDetectionEngine {
  if (!instance) {
    instance = new PixelDetectionEngine(options);
  } else if (options) {
    instance.setOptions(options);
  }
  return instance;
}

export function resetPixelDetectionEngine(): void {
  if (instance) {
    instance.reset();
  }
  instance = null;
}

/**
 * Create a sleep mode optimized detector
 * Returns a detector configured for ultra-sensitive, instant local detection
 */
export function createSleepModeDetector(
  mode: 'infant' | 'pet' | 'deepSleep' = 'infant'
): PixelDetectionEngine {
  const preset = SLEEP_DETECTION_PRESETS[mode];
  return new PixelDetectionEngine({
    ...DEFAULT_OPTIONS,
    ...preset,
  });
}

/**
 * Get estimated processing time category
 */
export function getProcessingTimeCategory(timeMs: number): {
  category: 'instant' | 'fast' | 'normal' | 'slow';
  label: string;
  color: string;
} {
  if (timeMs < 5) {
    return { category: 'instant', label: '< 5ms (Instant)', color: 'green' };
  } else if (timeMs < 16) {
    return { category: 'fast', label: '< 16ms (60fps)', color: 'emerald' };
  } else if (timeMs < 33) {
    return { category: 'normal', label: '< 33ms (30fps)', color: 'yellow' };
  } else {
    return { category: 'slow', label: `${Math.round(timeMs)}ms`, color: 'orange' };
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Quick one-shot detection between two frames
 */
export function detectPixelChanges(
  canvas: HTMLCanvasElement,
  previousFrame: ImageData | null,
  threshold: number
): { changed: boolean; difference: number } {
  const ctx = canvas.getContext('2d');
  if (!ctx || !previousFrame) {
    return { changed: false, difference: 0 };
  }

  const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
  // Convert threshold from 0-100 to pixel difference value
  const pixelThreshold = Math.round((100 - threshold) * 2.55);
  
  let differences = 0;
  const pixels = currentFrame.data.length / 4;
  
  for (let i = 0; i < currentFrame.data.length; i += 4) {
    const rDiff = Math.abs(currentFrame.data[i] - previousFrame.data[i]);
    const gDiff = Math.abs(currentFrame.data[i + 1] - previousFrame.data[i + 1]);
    const bDiff = Math.abs(currentFrame.data[i + 2] - previousFrame.data[i + 2]);
    
    if ((rDiff + gDiff + bDiff) / 3 > pixelThreshold) {
      differences++;
    }
  }
  
  const changePercent = (differences / pixels) * 100;
  return { 
    changed: changePercent > threshold, 
    difference: Math.round(changePercent * 100) / 100 
  };
}

/**
 * Create a difference visualization image
 */
export function createDifferenceVisualization(
  canvas: HTMLCanvasElement,
  previousFrame: ImageData | null,
  threshold: number = 30
): ImageData | null {
  const ctx = canvas.getContext('2d');
  if (!ctx || !previousFrame) {
    return null;
  }

  const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const diffImage = ctx.createImageData(canvas.width, canvas.height);
  
  const pixelThreshold = Math.round((100 - threshold) * 2.55);
  
  for (let i = 0; i < currentFrame.data.length; i += 4) {
    const rDiff = Math.abs(currentFrame.data[i] - previousFrame.data[i]);
    const gDiff = Math.abs(currentFrame.data[i + 1] - previousFrame.data[i + 1]);
    const bDiff = Math.abs(currentFrame.data[i + 2] - previousFrame.data[i + 2]);
    const avgDiff = (rDiff + gDiff + bDiff) / 3;
    
    if (avgDiff > pixelThreshold) {
      // Show changed pixels in red with intensity based on difference
      const intensity = Math.min(255, avgDiff * 2);
      diffImage.data[i] = intensity;      // R
      diffImage.data[i + 1] = 0;          // G
      diffImage.data[i + 2] = 0;          // B
      diffImage.data[i + 3] = 255;        // A
    } else {
      // Show unchanged pixels in dark gray
      diffImage.data[i] = 30;
      diffImage.data[i + 1] = 30;
      diffImage.data[i + 2] = 30;
      diffImage.data[i + 3] = 255;
    }
  }
  
  return diffImage;
}
