/**
 * Animal Detection Library
 * 
 * Extends COCO-SSD for animal detection with size categorization
 * and danger level assessment. Supports both domestic and wildlife animals.
 * 
 * @module lib/animal-detection
 */

import { loadDetectionModel } from './detection-model';

// =============================================================================
// Types
// =============================================================================

export type AnimalType = 
  | 'dog' | 'cat' | 'bird' | 'horse' | 'sheep' | 'cow' 
  | 'elephant' | 'bear' | 'zebra' | 'giraffe'
  | 'mouse' | 'rabbit' | 'squirrel' | 'raccoon' 
  | 'deer' | 'fox' | 'coyote' | 'wolf' | 'boar'
  | 'unknown_animal';

export type SizeCategory = 'small' | 'medium' | 'large';

export type DangerLevel = 'none' | 'low' | 'medium' | 'high' | 'extreme';

export interface AnimalDetection {
  id: string;
  type: AnimalType;
  displayName: string;
  sizeCategory: SizeCategory;
  dangerLevel: DangerLevel;
  confidence: number;
  bbox: [number, number, number, number];
  timestamp: number;
  frameData?: string;
}

export interface AnimalDetectionResult {
  animals: AnimalDetection[];
  largeAnimals: AnimalDetection[];
  smallAnimals: AnimalDetection[];
  dangerousAnimals: AnimalDetection[];
  processingTimeMs: number;
  frameData?: string;
}

export interface AnimalDetectorConfig {
  confidenceThreshold: number;
  motionThreshold: number;
  enableLargeAnimalAlerts: boolean;
  enableSmallAnimalAlerts: boolean;
  captureFrames: boolean;
  detectionWidth: number;
  detectionHeight: number;
}

export const DEFAULT_ANIMAL_CONFIG: AnimalDetectorConfig = {
  confidenceThreshold: 0.5,
  motionThreshold: 15,
  enableLargeAnimalAlerts: true,
  enableSmallAnimalAlerts: true,
  captureFrames: true,
  detectionWidth: 320,
  detectionHeight: 240,
};

// =============================================================================
// Animal Classification Data
// =============================================================================

interface AnimalInfo {
  displayName: string;
  sizeCategory: SizeCategory;
  dangerLevel: DangerLevel;
  isDomestic: boolean;
}

const ANIMAL_DATABASE: Record<AnimalType, AnimalInfo> = {
  // Domestic animals
  dog: { displayName: 'Dog', sizeCategory: 'medium', dangerLevel: 'low', isDomestic: true },
  cat: { displayName: 'Cat', sizeCategory: 'small', dangerLevel: 'none', isDomestic: true },
  bird: { displayName: 'Bird', sizeCategory: 'small', dangerLevel: 'none', isDomestic: true },
  horse: { displayName: 'Horse', sizeCategory: 'large', dangerLevel: 'low', isDomestic: true },
  sheep: { displayName: 'Sheep', sizeCategory: 'medium', dangerLevel: 'none', isDomestic: true },
  cow: { displayName: 'Cow', sizeCategory: 'large', dangerLevel: 'low', isDomestic: true },
  
  // Large wildlife (potentially dangerous)
  elephant: { displayName: 'Elephant', sizeCategory: 'large', dangerLevel: 'high', isDomestic: false },
  bear: { displayName: 'Bear', sizeCategory: 'large', dangerLevel: 'extreme', isDomestic: false },
  zebra: { displayName: 'Zebra', sizeCategory: 'large', dangerLevel: 'medium', isDomestic: false },
  giraffe: { displayName: 'Giraffe', sizeCategory: 'large', dangerLevel: 'low', isDomestic: false },
  deer: { displayName: 'Deer', sizeCategory: 'medium', dangerLevel: 'low', isDomestic: false },
  boar: { displayName: 'Wild Boar', sizeCategory: 'medium', dangerLevel: 'high', isDomestic: false },
  wolf: { displayName: 'Wolf', sizeCategory: 'medium', dangerLevel: 'extreme', isDomestic: false },
  coyote: { displayName: 'Coyote', sizeCategory: 'medium', dangerLevel: 'high', isDomestic: false },
  fox: { displayName: 'Fox', sizeCategory: 'small', dangerLevel: 'low', isDomestic: false },
  
  // Small wildlife
  mouse: { displayName: 'Mouse', sizeCategory: 'small', dangerLevel: 'none', isDomestic: false },
  rabbit: { displayName: 'Rabbit', sizeCategory: 'small', dangerLevel: 'none', isDomestic: false },
  squirrel: { displayName: 'Squirrel', sizeCategory: 'small', dangerLevel: 'none', isDomestic: false },
  raccoon: { displayName: 'Raccoon', sizeCategory: 'small', dangerLevel: 'medium', isDomestic: false },
  
  // Unknown
  unknown_animal: { displayName: 'Unknown Animal', sizeCategory: 'medium', dangerLevel: 'low', isDomestic: false },
};

// Map COCO-SSD classes to our animal types
const COCO_TO_ANIMAL: Record<string, AnimalType> = {
  'dog': 'dog',
  'cat': 'cat',
  'bird': 'bird',
  'horse': 'horse',
  'sheep': 'sheep',
  'cow': 'cow',
  'elephant': 'elephant',
  'bear': 'bear',
  'zebra': 'zebra',
  'giraffe': 'giraffe',
};

// All COCO-SSD animal classes
const COCO_ANIMAL_CLASSES = Object.keys(COCO_TO_ANIMAL);

// =============================================================================
// Model Loading
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
 * Load the COCO-SSD model for animal detection
 */
export async function loadAnimalDetectionModel(): Promise<CocoSsdModel> {
  if (model) return model;
  
  if (modelLoading) {
    return modelLoading;
  }

  modelLoadError = null;
  modelLoading = (async () => {
    try {
      const loadedModel = await loadDetectionModel();
      model = loadedModel;
      return loadedModel;
    } catch (error) {
      console.error('[AnimalDetection] Failed to load model:', error);
      modelLoadError = error instanceof Error ? error : new Error(String(error));
      throw modelLoadError;
    } finally {
      modelLoading = null;
    }
  })();

  return modelLoading;
}

/**
 * Check if model is ready
 */
export function isAnimalModelReady(): boolean {
  return model !== null;
}

/**
 * Unload model
 */
export function unloadAnimalModel(): void {
  model = null;
  modelLoading = null;
  modelLoadError = null;
}

// =============================================================================
// Animal Detector Class
// =============================================================================

export class AnimalDetector {
  private config: AnimalDetectorConfig;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private previousFrame: ImageData | null = null;
  private lastDetectionTime: number = 0;
  private isProcessing: boolean = false;

  constructor(config: Partial<AnimalDetectorConfig> = {}) {
    this.config = { ...DEFAULT_ANIMAL_CONFIG, ...config };
  }

  /**
   * Initialize detector
   */
  async initialize(): Promise<void> {
    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.config.detectionWidth;
      this.canvas.height = this.config.detectionHeight;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }

    await loadAnimalDetectionModel();
  }

  /**
   * Update config
   */
  updateConfig(config: Partial<AnimalDetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Detect motion between frames
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

    for (let i = 0; i < curr.length; i += 16) {
      const rDiff = Math.abs(curr[i] - prev[i]);
      const gDiff = Math.abs(curr[i + 1] - prev[i + 1]);
      const bDiff = Math.abs(curr[i + 2] - prev[i + 2]);
      diff += (rDiff + gDiff + bDiff) / 3;
      count++;
    }

    this.previousFrame = currentFrame;
    return (diff / count / 255) * 100;
  }

  /**
   * Capture frame as base64
   */
  private captureFrame(): string | undefined {
    if (!this.canvas || !this.config.captureFrames) return undefined;
    return this.canvas.toDataURL('image/jpeg', 0.8);
  }

  /**
   * Create detection from raw prediction
   */
  private createDetection(
    prediction: { bbox: [number, number, number, number]; class: string; score: number }
  ): AnimalDetection | null {
    const animalType = COCO_TO_ANIMAL[prediction.class];
    if (!animalType) return null;

    const info = ANIMAL_DATABASE[animalType];
    
    return {
      id: `animal-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: animalType,
      displayName: info.displayName,
      sizeCategory: info.sizeCategory,
      dangerLevel: info.dangerLevel,
      confidence: prediction.score,
      bbox: prediction.bbox,
      timestamp: Date.now(),
    };
  }

  /**
   * Process video frame for animal detection
   */
  async processFrame(video: HTMLVideoElement): Promise<AnimalDetectionResult | null> {
    if (this.isProcessing) return null;
    if (!this.canvas || !this.ctx) return null;

    this.isProcessing = true;
    const startTime = performance.now();

    try {
      // Draw frame
      this.ctx.drawImage(
        video,
        0, 0,
        this.config.detectionWidth,
        this.config.detectionHeight
      );

      // Check motion
      const frameData = this.ctx.getImageData(
        0, 0,
        this.config.detectionWidth,
        this.config.detectionHeight
      );

      const motionLevel = this.detectMotion(frameData);
      if (motionLevel < this.config.motionThreshold) {
        return {
          animals: [],
          largeAnimals: [],
          smallAnimals: [],
          dangerousAnimals: [],
          processingTimeMs: performance.now() - startTime,
        };
      }

      // Ensure model is loaded
      if (!model) {
        await loadAnimalDetectionModel();
      }

      if (!model) {
        throw new Error('Model not available');
      }

      // Run detection
      const predictions = await model.detect(
        this.canvas,
        10,
        this.config.confidenceThreshold
      );

      // Filter animal detections
      const animalPredictions = predictions.filter(p => 
        COCO_ANIMAL_CLASSES.includes(p.class) &&
        p.score >= this.config.confidenceThreshold
      );

      const animals: AnimalDetection[] = [];
      for (const pred of animalPredictions) {
        const detection = this.createDetection(pred);
        if (detection) {
          detection.frameData = this.captureFrame();
          animals.push(detection);
        }
      }

      // Categorize
      const largeAnimals = animals.filter(a => a.sizeCategory === 'large');
      const smallAnimals = animals.filter(a => a.sizeCategory === 'small');
      const dangerousAnimals = animals.filter(a => 
        a.dangerLevel === 'high' || a.dangerLevel === 'extreme'
      );

      return {
        animals,
        largeAnimals,
        smallAnimals,
        dangerousAnimals,
        processingTimeMs: performance.now() - startTime,
        frameData: this.captureFrame(),
      };
    } catch (error) {
      console.error('[AnimalDetection] Detection error:', error);
      return null;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Clean up
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

let detectorInstance: AnimalDetector | null = null;

/**
 * Get or create singleton detector
 */
export function getAnimalDetector(config?: Partial<AnimalDetectorConfig>): AnimalDetector {
  if (!detectorInstance) {
    detectorInstance = new AnimalDetector(config);
  } else if (config) {
    detectorInstance.updateConfig(config);
  }
  return detectorInstance;
}

/**
 * Reset detector
 */
export function resetAnimalDetector(): void {
  if (detectorInstance) {
    detectorInstance.dispose();
    detectorInstance = null;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get animal info from type
 */
export function getAnimalInfo(type: AnimalType): AnimalInfo {
  return ANIMAL_DATABASE[type] || ANIMAL_DATABASE.unknown_animal;
}

/**
 * Get danger level color
 */
export function getDangerColor(level: DangerLevel): string {
  switch (level) {
    case 'extreme': return '#ff0000';
    case 'high': return '#ff6600';
    case 'medium': return '#ffcc00';
    case 'low': return '#00cc00';
    default: return '#888888';
  }
}

/**
 * Get danger level label
 */
export function getDangerLabel(level: DangerLevel): string {
  switch (level) {
    case 'extreme': return 'EXTREME DANGER';
    case 'high': return 'High Risk';
    case 'medium': return 'Caution';
    case 'low': return 'Low Risk';
    default: return 'Safe';
  }
}

/**
 * Get size category icon
 */
export function getSizeIcon(size: SizeCategory): string {
  switch (size) {
    case 'large': return 'large';
    case 'medium': return 'medium';
    default: return 'small';
  }
}

/**
 * Create TTS announcement for animal detection
 */
export function createAnimalAnnouncement(detection: AnimalDetection): string {
  const danger = detection.dangerLevel;
  const name = detection.displayName;
  const confidence = Math.round(detection.confidence * 100);

  if (danger === 'extreme' || danger === 'high') {
    return `Warning! ${name} detected with ${confidence}% confidence. ${getDangerLabel(danger)}. Exercise extreme caution.`;
  }

  if (danger === 'medium') {
    return `${name} detected nearby. Confidence ${confidence}%. Please be cautious.`;
  }

  return `${name} detected. Confidence ${confidence}%.`;
}

/**
 * Sort detections by danger level
 */
export function sortByDanger(detections: AnimalDetection[]): AnimalDetection[] {
  const dangerOrder: Record<DangerLevel, number> = {
    extreme: 0,
    high: 1,
    medium: 2,
    low: 3,
    none: 4,
  };

  return [...detections].sort((a, b) => 
    dangerOrder[a.dangerLevel] - dangerOrder[b.dangerLevel]
  );
}

/**
 * Filter detections by size
 */
export function filterBySize(
  detections: AnimalDetection[],
  sizes: SizeCategory[]
): AnimalDetection[] {
  return detections.filter(d => sizes.includes(d.sizeCategory));
}

/**
 * Check if any detection is dangerous
 */
export function hasDangerousDetection(detections: AnimalDetection[]): boolean {
  return detections.some(d => 
    d.dangerLevel === 'high' || d.dangerLevel === 'extreme'
  );
}

