/**
 * Visual Fingerprinting Library
 * 
 * Extracts color histograms, dominant colors, and visual signatures
 * from reference images for lost pet/person matching.
 * 
 * @module lib/visual-fingerprint
 */

// =============================================================================
// Types
// =============================================================================

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export interface ColorBucket {
  color: RGB;
  count: number;
  percentage: number;
}

export interface VisualFingerprint {
  id: string;
  name: string;
  colorHistogram: ColorBucket[];
  dominantColors: RGB[];
  averageColor: RGB;
  colorVariance: number;
  estimatedSizeRatio: number;
  edgeSignature: number[];
  referenceImages: string[];
  createdAt: string;
}

export interface FingerprintOptions {
  histogramBuckets: number;
  dominantColorCount: number;
  edgeGridSize: number;
  downsampleFactor: number;
}

/** The edge grid a reference photo is read on unless the caller asks for another. */
export const DEFAULT_EDGE_GRID_SIZE = 8;

const DEFAULT_OPTIONS: FingerprintOptions = {
  histogramBuckets: 32,
  dominantColorCount: 5,
  edgeGridSize: DEFAULT_EDGE_GRID_SIZE,
  downsampleFactor: 4,
};

// =============================================================================
// Color Utilities
// =============================================================================

/**
 * Convert RGB to HSL
 */
export function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Calculate color distance (Euclidean in RGB space)
 */
export function colorDistance(c1: RGB, c2: RGB): number {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Calculate weighted color distance (perceptual)
 */
export function perceptualColorDistance(c1: RGB, c2: RGB): number {
  // Weighted Euclidean distance based on human perception
  const rMean = (c1.r + c2.r) / 2;
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  
  const rWeight = 2 + rMean / 256;
  const gWeight = 4;
  const bWeight = 2 + (255 - rMean) / 256;
  
  return Math.sqrt(rWeight * dr * dr + gWeight * dg * dg + bWeight * db * db);
}

/**
 * Normalize brightness of a color
 */
export function normalizeBrightness(color: RGB, targetLightness: number = 50): RGB {
  const hsl = rgbToHsl(color.r, color.g, color.b);
  const factor = targetLightness / Math.max(hsl.l, 1);
  
  return {
    r: Math.min(255, Math.round(color.r * factor)),
    g: Math.min(255, Math.round(color.g * factor)),
    b: Math.min(255, Math.round(color.b * factor)),
  };
}

/**
 * Quantize color to reduce to bucket
 */
function quantizeColor(r: number, g: number, b: number, levels: number): string {
  const step = 256 / levels;
  const qr = Math.floor(r / step);
  const qg = Math.floor(g / step);
  const qb = Math.floor(b / step);
  return `${qr}-${qg}-${qb}`;
}

// =============================================================================
// Image Processing
// =============================================================================

/**
 * Load image from URL or base64 and return ImageData
 */
export async function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = source;
  });
}

/**
 * Get ImageData from an image
 */
export function getImageData(
  img: HTMLImageElement,
  maxWidth: number = 256,
  maxHeight: number = 256
): ImageData {
  const canvas = document.createElement('canvas');
  
  // Scale down for performance
  const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }
  
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Extract color histogram from ImageData
 */
export function extractColorHistogram(
  imageData: ImageData,
  buckets: number = 32
): ColorBucket[] {
  const colorCounts = new Map<string, { color: RGB; count: number }>();
  const levels = Math.ceil(Math.cbrt(buckets)); // Levels per channel
  
  const { data, width, height } = imageData;
  const totalPixels = width * height;
  
  // Count colors
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    
    // Skip transparent pixels
    if (a < 128) continue;
    
    const key = quantizeColor(r, g, b, levels);
    const existing = colorCounts.get(key);
    
    if (existing) {
      existing.count++;
      // Running average for representative color
      existing.color.r = Math.round((existing.color.r * (existing.count - 1) + r) / existing.count);
      existing.color.g = Math.round((existing.color.g * (existing.count - 1) + g) / existing.count);
      existing.color.b = Math.round((existing.color.b * (existing.count - 1) + b) / existing.count);
    } else {
      colorCounts.set(key, { color: { r, g, b }, count: 1 });
    }
  }
  
  // Convert to array and sort by count
  const histogram = Array.from(colorCounts.values())
    .map(({ color, count }) => ({
      color,
      count,
      percentage: (count / totalPixels) * 100,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, buckets);
  
  return histogram;
}

/**
 * Extract dominant colors using k-means-like clustering
 */
export function extractDominantColors(
  imageData: ImageData,
  count: number = 5
): RGB[] {
  const { data } = imageData;
  const pixels: RGB[] = [];
  
  // Sample pixels (skip every 4th for performance)
  for (let i = 0; i < data.length; i += 16) {
    if (data[i + 3] >= 128) { // Skip transparent
      pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
    }
  }
  
  if (pixels.length === 0) {
    return [{ r: 128, g: 128, b: 128 }];
  }
  
  // Simple k-means clustering
  let centroids: RGB[] = [];
  
  // Initialize centroids with evenly spaced pixels
  const step = Math.floor(pixels.length / count);
  for (let i = 0; i < count && i * step < pixels.length; i++) {
    centroids.push({ ...pixels[i * step] });
  }
  
  // Run k-means iterations
  for (let iter = 0; iter < 10; iter++) {
    const clusters: RGB[][] = centroids.map(() => []);
    
    // Assign pixels to nearest centroid
    for (const pixel of pixels) {
      let minDist = Infinity;
      let minIdx = 0;
      
      for (let i = 0; i < centroids.length; i++) {
        const dist = colorDistance(pixel, centroids[i]);
        if (dist < minDist) {
          minDist = dist;
          minIdx = i;
        }
      }
      
      clusters[minIdx].push(pixel);
    }
    
    // Update centroids
    centroids = clusters.map((cluster, i) => {
      if (cluster.length === 0) return centroids[i];
      
      const sum = cluster.reduce(
        (acc, p) => ({ r: acc.r + p.r, g: acc.g + p.g, b: acc.b + p.b }),
        { r: 0, g: 0, b: 0 }
      );
      
      return {
        r: Math.round(sum.r / cluster.length),
        g: Math.round(sum.g / cluster.length),
        b: Math.round(sum.b / cluster.length),
      };
    });
  }
  
  return centroids;
}

/**
 * Calculate average color
 */
export function calculateAverageColor(imageData: ImageData): RGB {
  const { data } = imageData;
  let r = 0, g = 0, b = 0, count = 0;
  
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] >= 128) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count++;
    }
  }
  
  if (count === 0) {
    return { r: 128, g: 128, b: 128 };
  }
  
  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count),
  };
}

/**
 * Calculate color variance (how varied the colors are)
 */
export function calculateColorVariance(imageData: ImageData, avgColor: RGB): number {
  const { data } = imageData;
  let variance = 0;
  let count = 0;
  
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] >= 128) {
      const pixel = { r: data[i], g: data[i + 1], b: data[i + 2] };
      variance += colorDistance(pixel, avgColor);
      count++;
    }
  }
  
  return count > 0 ? variance / count : 0;
}

/**
 * Extract edge signature using simple gradient detection
 */
export function extractEdgeSignature(imageData: ImageData, gridSize: number = 8): number[] {
  const { data, width, height } = imageData;
  const signature: number[] = [];
  
  const cellWidth = Math.floor(width / gridSize);
  const cellHeight = Math.floor(height / gridSize);
  
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      let edgeStrength = 0;
      let samples = 0;
      
      const startX = gx * cellWidth;
      const startY = gy * cellHeight;
      const endX = Math.min(startX + cellWidth, width - 1);
      const endY = Math.min(startY + cellHeight, height - 1);
      
      // Sample edges in this cell
      for (let y = startY; y < endY; y += 2) {
        for (let x = startX; x < endX; x += 2) {
          const idx = (y * width + x) * 4;
          const idxRight = idx + 4;
          const idxDown = idx + width * 4;
          
          if (idxRight < data.length && idxDown < data.length) {
            // Horizontal gradient
            const hGrad = Math.abs(data[idx] - data[idxRight]) +
                         Math.abs(data[idx + 1] - data[idxRight + 1]) +
                         Math.abs(data[idx + 2] - data[idxRight + 2]);
            
            // Vertical gradient
            const vGrad = Math.abs(data[idx] - data[idxDown]) +
                         Math.abs(data[idx + 1] - data[idxDown + 1]) +
                         Math.abs(data[idx + 2] - data[idxDown + 2]);
            
            edgeStrength += Math.sqrt(hGrad * hGrad + vGrad * vGrad);
            samples++;
          }
        }
      }
      
      signature.push(samples > 0 ? Math.round(edgeStrength / samples) : 0);
    }
  }
  
  // Normalize signature
  const maxEdge = Math.max(...signature, 1);
  return signature.map(e => Math.round((e / maxEdge) * 100));
}

/**
 * The side of the square grid an edge signature was read on: 8 for the 64
 * values of an 8 by 8 grid. Returns 0 when the signature is empty or its
 * length is not a square number.
 */
export function edgeGridSide(signature: number[]): number {
  const side = Math.round(Math.sqrt(signature.length));
  return side * side === signature.length ? side : 0;
}

/**
 * Estimate relative size of subject in image
 * Returns ratio of non-background pixels to total
 */
export function estimateSizeRatio(imageData: ImageData): number {
  const { data, width, height } = imageData;
  const totalPixels = width * height;
  
  // Detect background by sampling corners
  const cornerSamples: RGB[] = [];
  const sampleSize = Math.min(10, Math.floor(width / 10), Math.floor(height / 10));
  
  // Sample corners
  const corners = [
    [0, 0],
    [width - sampleSize, 0],
    [0, height - sampleSize],
    [width - sampleSize, height - sampleSize],
  ];
  
  for (const [cx, cy] of corners) {
    let r = 0, g = 0, b = 0, count = 0;
    for (let y = cy; y < cy + sampleSize; y++) {
      for (let x = cx; x < cx + sampleSize; x++) {
        const idx = (y * width + x) * 4;
        r += data[idx];
        g += data[idx + 1];
        b += data[idx + 2];
        count++;
      }
    }
    if (count > 0) {
      cornerSamples.push({
        r: Math.round(r / count),
        g: Math.round(g / count),
        b: Math.round(b / count),
      });
    }
  }
  
  // Average background color
  const bgColor = cornerSamples.length > 0
    ? {
        r: Math.round(cornerSamples.reduce((s, c) => s + c.r, 0) / cornerSamples.length),
        g: Math.round(cornerSamples.reduce((s, c) => s + c.g, 0) / cornerSamples.length),
        b: Math.round(cornerSamples.reduce((s, c) => s + c.b, 0) / cornerSamples.length),
      }
    : { r: 255, g: 255, b: 255 };
  
  // Count non-background pixels
  let foregroundPixels = 0;
  const bgThreshold = 50; // Distance threshold
  
  for (let i = 0; i < data.length; i += 4) {
    const pixel = { r: data[i], g: data[i + 1], b: data[i + 2] };
    if (colorDistance(pixel, bgColor) > bgThreshold) {
      foregroundPixels++;
    }
  }
  
  return foregroundPixels / totalPixels;
}

// =============================================================================
// Fingerprint Generation
// =============================================================================

/**
 * Generate a visual fingerprint from an image
 */
export async function generateFingerprint(
  imageSource: string,
  name: string,
  options: Partial<FingerprintOptions> = {}
): Promise<VisualFingerprint> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  const img = await loadImage(imageSource);
  const imageData = getImageData(img, 256, 256);
  
  const colorHistogram = extractColorHistogram(imageData, opts.histogramBuckets);
  const dominantColors = extractDominantColors(imageData, opts.dominantColorCount);
  const averageColor = calculateAverageColor(imageData);
  const colorVariance = calculateColorVariance(imageData, averageColor);
  const edgeSignature = extractEdgeSignature(imageData, opts.edgeGridSize);
  const estimatedSizeRatio = estimateSizeRatio(imageData);
  
  // Create thumbnail
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 64;
  thumbCanvas.height = 64;
  const thumbCtx = thumbCanvas.getContext('2d');
  if (thumbCtx) {
    thumbCtx.drawImage(img, 0, 0, 64, 64);
  }
  
  return {
    id: `fp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name,
    colorHistogram,
    dominantColors,
    averageColor,
    colorVariance,
    estimatedSizeRatio,
    edgeSignature,
    referenceImages: [thumbCanvas.toDataURL('image/jpeg', 0.8)],
    createdAt: new Date().toISOString(),
  };
}

/**
 * Merge multiple fingerprints into one (for multiple reference images)
 */
export function mergeFingerprints(fingerprints: VisualFingerprint[]): VisualFingerprint {
  if (fingerprints.length === 0) {
    throw new Error('No fingerprints to merge');
  }
  
  if (fingerprints.length === 1) {
    return fingerprints[0];
  }
  
  const base = fingerprints[0];
  
  // Merge color histograms (average counts)
  const histogramMap = new Map<string, ColorBucket>();
  
  for (const fp of fingerprints) {
    for (const bucket of fp.colorHistogram) {
      const key = `${bucket.color.r}-${bucket.color.g}-${bucket.color.b}`;
      const existing = histogramMap.get(key);
      
      if (existing) {
        existing.count += bucket.count;
        existing.percentage += bucket.percentage;
      } else {
        histogramMap.set(key, { ...bucket });
      }
    }
  }
  
  const mergedHistogram = Array.from(histogramMap.values())
    .map(b => ({
      ...b,
      count: Math.round(b.count / fingerprints.length),
      percentage: b.percentage / fingerprints.length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, base.colorHistogram.length);
  
  // Merge dominant colors (find most common across all)
  const allDominant = fingerprints.flatMap(fp => fp.dominantColors);
  const mergedDominant = extractDominantColorsFromArray(allDominant, base.dominantColors.length);
  
  // Average other properties
  const avgAvgColor = {
    r: Math.round(fingerprints.reduce((s, fp) => s + fp.averageColor.r, 0) / fingerprints.length),
    g: Math.round(fingerprints.reduce((s, fp) => s + fp.averageColor.g, 0) / fingerprints.length),
    b: Math.round(fingerprints.reduce((s, fp) => s + fp.averageColor.b, 0) / fingerprints.length),
  };
  
  const avgVariance = fingerprints.reduce((s, fp) => s + fp.colorVariance, 0) / fingerprints.length;
  const avgSizeRatio = fingerprints.reduce((s, fp) => s + fp.estimatedSizeRatio, 0) / fingerprints.length;
  
  // Average edge signatures
  const avgEdge = base.edgeSignature.map((_, i) =>
    Math.round(fingerprints.reduce((s, fp) => s + (fp.edgeSignature[i] || 0), 0) / fingerprints.length)
  );
  
  // Collect all reference images
  const allImages = fingerprints.flatMap(fp => fp.referenceImages);
  
  return {
    id: base.id,
    name: base.name,
    colorHistogram: mergedHistogram,
    dominantColors: mergedDominant,
    averageColor: avgAvgColor,
    colorVariance: avgVariance,
    estimatedSizeRatio: avgSizeRatio,
    edgeSignature: avgEdge,
    referenceImages: allImages.slice(0, 5), // Keep up to 5 reference images
    createdAt: base.createdAt,
  };
}

/**
 * Helper to extract dominant colors from an array of colors
 */
function extractDominantColorsFromArray(colors: RGB[], count: number): RGB[] {
  if (colors.length <= count) {
    return colors;
  }
  
  // Simple clustering
  const clusters: { center: RGB; members: RGB[] }[] = [];
  
  for (const color of colors) {
    let added = false;
    
    for (const cluster of clusters) {
      if (colorDistance(color, cluster.center) < 50) {
        cluster.members.push(color);
        // Update center
        cluster.center = {
          r: Math.round(cluster.members.reduce((s, c) => s + c.r, 0) / cluster.members.length),
          g: Math.round(cluster.members.reduce((s, c) => s + c.g, 0) / cluster.members.length),
          b: Math.round(cluster.members.reduce((s, c) => s + c.b, 0) / cluster.members.length),
        };
        added = true;
        break;
      }
    }
    
    if (!added) {
      clusters.push({ center: { ...color }, members: [color] });
    }
  }
  
  return clusters
    .sort((a, b) => b.members.length - a.members.length)
    .slice(0, count)
    .map(c => c.center);
}

// =============================================================================
// Fingerprint Comparison
// =============================================================================

export interface ComparisonResult {
  overall: number;          // 0-100 overall match score
  colorMatch: number;       // 0-100 color histogram match
  dominantMatch: number;    // 0-100 dominant color match
  edgeMatch: number;        // 0-100 edge signature match
  sizeMatch: number;        // 0-100 size ratio match
  details: string;
}

/**
 * Compare two fingerprints
 */
export function compareFingerprints(
  fp1: VisualFingerprint,
  fp2: VisualFingerprint,
  weights: { color: number; dominant: number; edge: number; size: number } = {
    color: 0.4,
    dominant: 0.35,
    edge: 0.15,
    size: 0.1,
  }
): ComparisonResult {
  // Color histogram match (Earth Mover's Distance approximation)
  const colorMatch = compareHistograms(fp1.colorHistogram, fp2.colorHistogram);
  
  // Dominant color match
  const dominantMatch = compareDominantColors(fp1.dominantColors, fp2.dominantColors);
  
  // Edge signature match
  const edgeMatch = compareEdgeSignatures(fp1.edgeSignature, fp2.edgeSignature);
  
  // Size ratio match
  const sizeDiff = Math.abs(fp1.estimatedSizeRatio - fp2.estimatedSizeRatio);
  const sizeMatch = Math.max(0, 100 - sizeDiff * 200);
  
  // Weighted overall score
  const overall = Math.round(
    colorMatch * weights.color +
    dominantMatch * weights.dominant +
    edgeMatch * weights.edge +
    sizeMatch * weights.size
  );
  
  return {
    overall,
    colorMatch: Math.round(colorMatch),
    dominantMatch: Math.round(dominantMatch),
    edgeMatch: Math.round(edgeMatch),
    sizeMatch: Math.round(sizeMatch),
    details: `Color: ${Math.round(colorMatch)}%, Dominant: ${Math.round(dominantMatch)}%, Edge: ${Math.round(edgeMatch)}%, Size: ${Math.round(sizeMatch)}%`,
  };
}

/**
 * Compare color histograms
 */
function compareHistograms(h1: ColorBucket[], h2: ColorBucket[]): number {
  if (h1.length === 0 || h2.length === 0) {
    return 0;
  }
  
  let matchScore = 0;
  let totalWeight = 0;
  
  for (const bucket1 of h1) {
    let bestMatch = 0;
    
    for (const bucket2 of h2) {
      const dist = colorDistance(bucket1.color, bucket2.color);
      const colorSimilarity = Math.max(0, 1 - dist / 442); // 442 = max RGB distance
      const percentSimilarity = 1 - Math.abs(bucket1.percentage - bucket2.percentage) / 100;
      
      const match = colorSimilarity * percentSimilarity;
      bestMatch = Math.max(bestMatch, match);
    }
    
    matchScore += bestMatch * bucket1.percentage;
    totalWeight += bucket1.percentage;
  }
  
  return totalWeight > 0 ? (matchScore / totalWeight) * 100 : 0;
}

/**
 * Compare dominant colors
 */
function compareDominantColors(d1: RGB[], d2: RGB[]): number {
  if (d1.length === 0 || d2.length === 0) {
    return 0;
  }
  
  let totalMatch = 0;
  
  for (const color1 of d1) {
    let bestMatch = 0;
    
    for (const color2 of d2) {
      const dist = perceptualColorDistance(color1, color2);
      const match = Math.max(0, 1 - dist / 500); // Normalize
      bestMatch = Math.max(bestMatch, match);
    }
    
    totalMatch += bestMatch;
  }
  
  return (totalMatch / d1.length) * 100;
}

/**
 * Compare edge signatures
 */
function compareEdgeSignatures(e1: number[], e2: number[]): number {
  if (e1.length !== e2.length || e1.length === 0) {
    return 0;
  }
  
  let diff = 0;
  for (let i = 0; i < e1.length; i++) {
    diff += Math.abs(e1[i] - e2[i]);
  }
  
  const avgDiff = diff / e1.length;
  return Math.max(0, 100 - avgDiff);
}

/**
 * Quick comparison for real-time matching (faster but less accurate)
 */
export function quickCompare(
  fingerprint: VisualFingerprint,
  frameImageData: ImageData
): number {
  // Extract quick features from frame
  const frameAvgColor = calculateAverageColor(frameImageData);
  const frameDominant = extractDominantColors(frameImageData, 3);
  
  // Compare average colors
  const avgDist = perceptualColorDistance(fingerprint.averageColor, frameAvgColor);
  const avgMatch = Math.max(0, 100 - avgDist / 5);
  
  // Compare dominant colors (quick)
  let dominantMatch = 0;
  for (const fpColor of fingerprint.dominantColors.slice(0, 3)) {
    for (const frameColor of frameDominant) {
      const dist = colorDistance(fpColor, frameColor);
      const match = Math.max(0, 100 - dist / 2.55);
      dominantMatch = Math.max(dominantMatch, match);
    }
  }
  
  return Math.round(avgMatch * 0.4 + dominantMatch * 0.6);
}

