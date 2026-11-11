/**
 * Person Detection Library
 * 
 * Hybrid person detection using motion detection as a trigger
 * and TensorFlow.js COCO-SSD for AI-based person identification.
 * 
 * @module lib/person-detection
 */

// =============================================================================
// Types
// =============================================================================

export interface PersonDetection {
  bbox: [number, number, number, number]; // [x, y, width, height]
  confidence: number;
  class: 'person';
}

export interface PersonDetectionResult {
  personCount: number;
  detections: PersonDetection[];
  processingTimeMs: number;
  frameData?: string;
  timestamp: number;
  motionTriggered: boolean;
}

export interface PersonDetectorConfig {
  /** Minimum confidence threshold for person detection (0-1) */
  confidenceThreshold: number;
  /** Motion threshold to trigger AI detection (0-100) */
  motionThreshold: number;
  /** Maximum number of persons to detect */
  maxDetections: number;
  /** Minimum detection interval in ms */
  minDetectionInterval: number;
  /** Whether to include frame data in results */
  captureFrames: boolean;
  /** Target resolution for detection (smaller = faster) */
  detectionWidth: number;
  detectionHeight: number;
}

export const DEFAULT_DETECTOR_CONFIG: PersonDetectorConfig = {
  confidenceThreshold: 0.5,
  motionThreshold: 15,
  maxDetections: 10,
  minDetectionInterval: 500,
  captureFrames: true,
  detectionWidth: 320,
  detectionHeight: 240,
};

// =============================================================================
// Model Loading State
// =============================================================================

type CocoSsdModel = {
  detect: (
    input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
    maxNumBoxes?: number,
    minScore?: number
  ) => Promise<Array<{
    bbox: [number, number, number, number];
    class: string;
    score: number;
  }>>;
};

let model: CocoSsdModel | null = null;
let modelLoading: Promise<CocoSsdModel> | null = null;
let modelLoadError: Error | null = null;

/**
 * Load the COCO-SSD model for person detection
 */
export async function loadPersonDetectionModel(): Promise<CocoSsdModel> {
  if (model) return model;
  
  if (modelLoading) {
    return modelLoading;
  }

  modelLoadError = null;
  modelLoading = (async () => {
    try {
      // Dynamic import to avoid loading TensorFlow.js until needed
      const tf = await import('@tensorflow/tfjs');
      const cocoSsd = await import('@tensorflow-models/coco-ssd');
      
      // Set backend to webgl for best performance
      await tf.setBackend('webgl');
      await tf.ready();
      
      console.log('[PersonDetection] Loading COCO-SSD model...');
      const loadedModel = await cocoSsd.load({
        base: 'lite_mobilenet_v2', // Lighter model for faster inference
      });
      
      console.log('[PersonDetection] Model loaded successfully');
      model = loadedModel;
      return loadedModel;
    } catch (error) {
      console.error('[PersonDetection] Failed to load model:', error);
      modelLoadError = error instanceof Error ? error : new Error(String(error));
      throw modelLoadError;
    } finally {
      modelLoading = null;
    }
  })();

  return modelLoading;
}

/**
 * Check if the model is loaded and ready
 */
export function isModelReady(): boolean {
  return model !== null;
}

/**
 * Get model loading status
 */
export function getModelStatus(): 'not_loaded' | 'loading' | 'ready' | 'error' {
  if (modelLoadError) return 'error';
  if (model) return 'ready';
  if (modelLoading) return 'loading';
  return 'not_loaded';
}

/**
 * Unload the model to free memory
 */
export function unloadModel(): void {
  model = null;
  modelLoading = null;
  modelLoadError = null;
}

// =============================================================================
// Person Detector Class
// =============================================================================

export class PersonDetector {
  private config: PersonDetectorConfig;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private previousFrame: ImageData | null = null;
  private lastDetectionTime: number = 0;
  private isProcessing: boolean = false;

  constructor(config: Partial<PersonDetectorConfig> = {}) {
    this.config = { ...DEFAULT_DETECTOR_CONFIG, ...config };
  }

  /**
   * Initialize the detector and load the model
   */
  async initialize(): Promise<void> {
    // Create canvas for frame processing
    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.config.detectionWidth;
      this.canvas.height = this.config.detectionHeight;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }

    // Start loading the model
    await loadPersonDetectionModel();
  }

  /**
   * Update detector configuration
   */
  updateConfig(config: Partial<PersonDetectorConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Resize canvas if dimensions changed
    if (this.canvas && (
      this.canvas.width !== this.config.detectionWidth ||
      this.canvas.height !== this.config.detectionHeight
    )) {
      this.canvas.width = this.config.detectionWidth;
      this.canvas.height = this.config.detectionHeight;
      this.previousFrame = null;
    }
  }

  /**
   * Check for motion between frames
   */
  private detectMotion(currentFrame: ImageData): number {
    if (!this.previousFrame) {
      this.previousFrame = currentFrame;
      return 0;
    }

    const prev = this.previousFrame.data;
    const curr = currentFrame.data;
    let diff = 0;
    let count = 0;

    // Sample every 4th pixel for speed
    for (let i = 0; i < curr.length; i += 16) {
      const rDiff = Math.abs(curr[i] - prev[i]);
      const gDiff = Math.abs(curr[i + 1] - prev[i + 1]);
      const bDiff = Math.abs(curr[i + 2] - prev[i + 2]);
      diff += (rDiff + gDiff + bDiff) / 3;
      count++;
    }

    this.previousFrame = currentFrame;
    return (diff / count / 255) * 100; // Return as percentage
  }

  /**
   * Capture current frame as base64
   */
  private captureFrame(): string | undefined {
    if (!this.canvas || !this.config.captureFrames) return undefined;
    return this.canvas.toDataURL('image/jpeg', 0.8);
  }

  /**
   * Process a video frame for person detection
   * Uses hybrid approach: motion triggers AI detection
   */
  async processFrame(video: HTMLVideoElement): Promise<PersonDetectionResult | null> {
    const now = Date.now();
    
    // Throttle detection
    if (now - this.lastDetectionTime < this.config.minDetectionInterval) {
      return null;
    }

    // Prevent concurrent processing
    if (this.isProcessing) {
      return null;
    }

    if (!this.canvas || !this.ctx) {
      console.warn('[PersonDetection] Canvas not initialized');
      return null;
    }

    this.isProcessing = true;
    const startTime = performance.now();

    try {
      // Draw video frame to canvas
      this.ctx.drawImage(
        video,
        0, 0,
        this.config.detectionWidth,
        this.config.detectionHeight
      );

      // Get frame data for motion detection
      const frameData = this.ctx.getImageData(
        0, 0,
        this.config.detectionWidth,
        this.config.detectionHeight
      );

      // Check for motion
      const motionLevel = this.detectMotion(frameData);
      const motionTriggered = motionLevel >= this.config.motionThreshold;

      // Only run AI detection if motion detected
      if (!motionTriggered) {
        // No motion means we have insufficient evidence to declare "no people";
        // callers should treat this as "no update" and keep the last known state.
        return null;
      }

      // Ensure model is loaded
      if (!model) {
        await loadPersonDetectionModel();
      }

      if (!model) {
        throw new Error('Model not available');
      }

      // Run person detection
      const predictions = await model.detect(
        this.canvas,
        this.config.maxDetections,
        this.config.confidenceThreshold
      );

      // Filter only person detections
      const personDetections: PersonDetection[] = predictions
        .filter(p => p.class === 'person' && p.score >= this.config.confidenceThreshold)
        .map(p => ({
          bbox: p.bbox,
          confidence: p.score,
          class: 'person' as const,
        }));

      this.lastDetectionTime = now;

      return {
        personCount: personDetections.length,
        detections: personDetections,
        processingTimeMs: performance.now() - startTime,
        frameData: this.captureFrame(),
        timestamp: now,
        motionTriggered: true,
      };
    } catch (error) {
      console.error('[PersonDetection] Detection error:', error);
      return null;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Force a detection without motion threshold
   */
  async forceDetection(video: HTMLVideoElement): Promise<PersonDetectionResult | null> {
    if (!this.canvas || !this.ctx) {
      return null;
    }

    this.isProcessing = true;
    const startTime = performance.now();
    const now = Date.now();

    try {
      // Draw video frame
      this.ctx.drawImage(
        video,
        0, 0,
        this.config.detectionWidth,
        this.config.detectionHeight
      );

      // Ensure model is loaded
      if (!model) {
        await loadPersonDetectionModel();
      }

      if (!model) {
        throw new Error('Model not available');
      }

      // Run detection
      const predictions = await model.detect(
        this.canvas,
        this.config.maxDetections,
        this.config.confidenceThreshold
      );

      const personDetections: PersonDetection[] = predictions
        .filter(p => p.class === 'person')
        .map(p => ({
          bbox: p.bbox,
          confidence: p.score,
          class: 'person' as const,
        }));

      return {
        personCount: personDetections.length,
        detections: personDetections,
        processingTimeMs: performance.now() - startTime,
        frameData: this.captureFrame(),
        timestamp: now,
        motionTriggered: false,
      };
    } catch (error) {
      console.error('[PersonDetection] Force detection error:', error);
      return null;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.previousFrame = null;
    this.canvas = null;
    this.ctx = null;
    this.isProcessing = false;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let detectorInstance: PersonDetector | null = null;

/**
 * Get or create the singleton person detector
 */
export function getPersonDetector(config?: Partial<PersonDetectorConfig>): PersonDetector {
  if (!detectorInstance) {
    detectorInstance = new PersonDetector(config);
  } else if (config) {
    detectorInstance.updateConfig(config);
  }
  return detectorInstance;
}

/**
 * Reset the singleton detector
 */
export function resetPersonDetector(): void {
  if (detectorInstance) {
    detectorInstance.dispose();
    detectorInstance = null;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Draw detection bounding boxes on a canvas
 */
export function drawDetections(
  ctx: CanvasRenderingContext2D,
  detections: PersonDetection[],
  scaleX: number = 1,
  scaleY: number = 1,
  color: string = '#ff0000'
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.font = '16px monospace';
  ctx.fillStyle = color;

  for (const detection of detections) {
    const [x, y, width, height] = detection.bbox;
    const scaledX = x * scaleX;
    const scaledY = y * scaleY;
    const scaledWidth = width * scaleX;
    const scaledHeight = height * scaleY;

    // Draw bounding box
    ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);

    // Draw label background
    const label = `Person ${Math.round(detection.confidence * 100)}%`;
    const textMetrics = ctx.measureText(label);
    ctx.fillRect(scaledX, scaledY - 20, textMetrics.width + 8, 20);

    // Draw label text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, scaledX + 4, scaledY - 5);
    ctx.fillStyle = color;
  }
}

/**
 * Calculate person count change for alert logic
 */
export function calculatePersonChange(
  currentCount: number,
  previousCount: number,
  allowedCount: number
): {
  exceeded: boolean;
  excessCount: number;
  isNewIntrusion: boolean;
} {
  const exceeded = currentCount > allowedCount;
  const excessCount = Math.max(0, currentCount - allowedCount);
  const wasExceeded = previousCount > allowedCount;
  const isNewIntrusion = exceeded && !wasExceeded;

  return {
    exceeded,
    excessCount,
    isNewIntrusion,
  };
}
