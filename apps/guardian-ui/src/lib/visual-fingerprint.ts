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
  /**
   * The version of the fingerprint's form, FINGERPRINT_VERSION for one made
   * now. A fingerprint saved without one is version 1: its edges were scaled
   * to each photo's own strongest cell, and its histogram may weigh photos
   * unequally.
   */
  version?: number;
  /**
   * How many of its photos the edge signature was averaged over, when that
   * is fewer than the photos its colours count: a subject saved by version 1
   * whose photos could not be read again keeps their colours and leaves out
   * their edges (addReferencePhotos). Left out when every photo counts.
   */
  edgePhotos?: number;
}

/**
 * The version of the fingerprint's form that generateFingerprint and
 * mergeFingerprints make. Version 2 reads edges on one fixed scale
 * (extractEdgeSignature) and weighs every photo the same.
 */
export const FINGERPRINT_VERSION = 2;

/** True for a fingerprint in the current form; false for one saved by an earlier version. */
export function isCurrentFingerprint(fingerprint: VisualFingerprint): boolean {
  return (fingerprint.version ?? 1) >= FINGERPRINT_VERSION;
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
 * The number of levels each of red, green and blue is cut into for a
 * histogram of up to `buckets` buckets: 4 levels, each 64 wide, for 32.
 */
function histogramLevels(buckets: number): number {
  return Math.max(1, Math.ceil(Math.cbrt(buckets)));
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
  const levels = histogramLevels(buckets); // Levels per channel
  
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
 * The edge strength that reads 100. A cell's strength is the mean, over its
 * samples, of the step to the next pixel right and down, summed over red,
 * green and blue and taken as the length of the two steps: a cell in which
 * every sample steps 60 levels in each colour, right and down, reads 255.
 */
export const FULL_EDGE_STRENGTH = 255;

/**
 * The edge strength of each cell of a `gridSize` by `gridSize` grid over the
 * picture, row by row, as described at FULL_EDGE_STRENGTH: 0 for a flat cell,
 * about 1082 at most.
 */
export function extractEdgeStrengths(imageData: ImageData, gridSize: number = 8): number[] {
  const { data, width, height } = imageData;
  const strengths: number[] = [];

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

      strengths.push(samples > 0 ? edgeStrength / samples : 0);
    }
  }

  return strengths;
}

/**
 * Extract edge signature: one value per cell of a `gridSize` by `gridSize`
 * grid, the cell's edge strength on a fixed scale where FULL_EDGE_STRENGTH
 * reads 100 (stronger cells read 100 too). A subject's photos and each region
 * of the camera's frame are read on this one scale, so the same pixels give
 * the same signature on both sides, and a camera's noise reads as weak as it
 * is: a blank wall whose pixels alternate 8 levels reads 13 a cell, where
 * black and white stripes read 100. Below 100 the scale is a straight line,
 * so the mean of a block of cells is what the block reads as one cell. A cell
 * that reads 100 may stand for a stronger one, so a block that holds one can
 * pool lower than the block reads as one cell (see poolEdgeSignature).
 */
export function extractEdgeSignature(imageData: ImageData, gridSize: number = 8): number[] {
  return extractEdgeStrengths(imageData, gridSize).map((strength) =>
    Math.min(100, Math.round((strength / FULL_EDGE_STRENGTH) * 100))
  );
}

/**
 * The edge signature version 1 saved: each cell's strength, rounded, scaled
 * so the picture's strongest cell reads 100. The matcher reads the camera's
 * regions this way for a subject saved by that version that has not been rebuilt
 * from its photos, so the two sides are read on one scale.
 */
export function extractVersion1EdgeSignature(imageData: ImageData, gridSize: number = 8): number[] {
  const strengths = extractEdgeStrengths(imageData, gridSize).map((strength) => Math.round(strength));
  const strongest = Math.max(...strengths, 1);
  return strengths.map((strength) => Math.round((strength / strongest) * 100));
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
 * The fingerprint of a picture's pixels, without the thumbnail
 * generateFingerprint adds: `referenceImages` is empty.
 */
export function fingerprintOfPixels(
  imageData: ImageData,
  name: string,
  options: Partial<FingerprintOptions> = {}
): VisualFingerprint {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const colorHistogram = extractColorHistogram(imageData, opts.histogramBuckets);
  const dominantColors = extractDominantColors(imageData, opts.dominantColorCount);
  const averageColor = calculateAverageColor(imageData);
  const colorVariance = calculateColorVariance(imageData, averageColor);
  const edgeSignature = extractEdgeSignature(imageData, opts.edgeGridSize);
  const estimatedSizeRatio = estimateSizeRatio(imageData);

  return {
    id: `fp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name,
    colorHistogram,
    dominantColors,
    averageColor,
    colorVariance,
    estimatedSizeRatio,
    edgeSignature,
    referenceImages: [],
    createdAt: new Date().toISOString(),
    version: FINGERPRINT_VERSION,
  };
}

/**
 * Generate a visual fingerprint from an image
 */
export async function generateFingerprint(
  imageSource: string,
  name: string,
  options: Partial<FingerprintOptions> = {}
): Promise<VisualFingerprint> {
  const img = await loadImage(imageSource);
  const imageData = getImageData(img, 256, 256);
  const fingerprint = fingerprintOfPixels(imageData, name, options);

  // Create thumbnail
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 64;
  thumbCanvas.height = 64;
  const thumbCtx = thumbCanvas.getContext('2d');
  if (thumbCtx) {
    thumbCtx.drawImage(img, 0, 0, 64, 64);
  }

  return { ...fingerprint, referenceImages: [thumbCanvas.toDataURL('image/jpeg', 0.8)] };
}

/**
 * Merge the colour histograms of several photos into one of up to `buckets`
 * buckets.
 *
 * A bucket's colour is the average of the pixels that fell in it, so two
 * photos of one animal rarely give a bucket the very same colour. Buckets are
 * therefore put together by nearest colour: each bucket of a further photo
 * joins the merged bucket nearest to it, when the two colours are closer than
 * one bucket is wide and no nearer bucket of the same photo has taken it.
 * Buckets of one photo are never put together with each other.
 *
 * Each photo counts the same: a merged bucket's share is the mean of its
 * share in every photo (0 in a photo that lacks the colour), so the shares
 * add up to the mean of the photos' own totals. `photos[i]` is the number of
 * photos `histograms[i]` was made from, so a histogram already merged from
 * four photos counts as four. When there are more merged buckets than
 * `buckets`, those with the largest shares are kept.
 */
function mergeHistograms(histograms: ColorBucket[][], photos: number[], buckets: number): ColorBucket[] {
  const tolerance = 256 / histogramLevels(buckets);
  const totalPhotos = photos.reduce((sum, count) => sum + count, 0);
  // Colour sums are weighted by share, so each photo pulls a merged colour
  // by the share it holds of that colour.
  const merged: { r: number; g: number; b: number; weight: number; color: RGB; count: number; percentage: number }[] = [];

  histograms.forEach((histogram, histogramIdx) => {
    const photoCount = photos[histogramIdx];
    // Every pairing of a merged bucket with one of this photo's buckets that
    // is within the tolerance, nearest first.
    const pairs: { mergedIdx: number; bucketIdx: number; distance: number }[] = [];
    for (let mergedIdx = 0; mergedIdx < merged.length; mergedIdx++) {
      for (let bucketIdx = 0; bucketIdx < histogram.length; bucketIdx++) {
        const distance = colorDistance(merged[mergedIdx].color, histogram[bucketIdx].color);
        if (distance < tolerance) {
          pairs.push({ mergedIdx, bucketIdx, distance });
        }
      }
    }
    pairs.sort((a, b) => a.distance - b.distance);

    const target = new Array<number>(histogram.length).fill(-1);
    const taken = new Set<number>();
    for (const { mergedIdx, bucketIdx } of pairs) {
      if (target[bucketIdx] === -1 && !taken.has(mergedIdx)) {
        target[bucketIdx] = mergedIdx;
        taken.add(mergedIdx);
      }
    }

    histogram.forEach((bucket, bucketIdx) => {
      const weight = Math.max(bucket.percentage, 0) * photoCount;
      if (target[bucketIdx] === -1) {
        merged.push({
          r: bucket.color.r * weight,
          g: bucket.color.g * weight,
          b: bucket.color.b * weight,
          weight,
          color: { ...bucket.color },
          count: bucket.count * photoCount,
          percentage: bucket.percentage * photoCount,
        });
        return;
      }

      const into = merged[target[bucketIdx]];
      into.r += bucket.color.r * weight;
      into.g += bucket.color.g * weight;
      into.b += bucket.color.b * weight;
      into.weight += weight;
      into.count += bucket.count * photoCount;
      into.percentage += bucket.percentage * photoCount;
      if (into.weight > 0) {
        into.color = {
          r: Math.round(into.r / into.weight),
          g: Math.round(into.g / into.weight),
          b: Math.round(into.b / into.weight),
        };
      }
    });
  });

  return merged
    .map(({ color, count, percentage }) => ({
      color,
      count: Math.round(count / totalPhotos),
      percentage: percentage / totalPhotos,
    }))
    // Largest share first: a photo with fewer pixels counts as much as one
    // with more.
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, buckets);
}

/**
 * The number of photos a fingerprint was made from: one for a photo's own
 * fingerprint, which keeps its one thumbnail, and for a merged fingerprint the
 * thumbnails it kept, one a photo (up to 5, the most a subject holds).
 */
function photosIn(fingerprint: VisualFingerprint): number {
  return Math.max(1, fingerprint.referenceImages?.length ?? 0);
}

/**
 * Merge multiple fingerprints into one (for multiple reference images).
 * Every photo counts the same: a fingerprint already merged from several
 * photos, such as a saved subject's when photos are added to it, counts as
 * that many photos in the histogram and in the averaged values. That holds
 * for fingerprints in the current form; one saved by version 1 may already
 * weigh its photos unequally, so addReferencePhotos rebuilds it first.
 * `options.histogramBuckets` is the bucket count the photos' histograms were
 * made with; leave it out for photos read with generateFingerprint's default.
 */
export function mergeFingerprints(
  fingerprints: VisualFingerprint[],
  options: Partial<FingerprintOptions> = {}
): VisualFingerprint {
  if (fingerprints.length === 0) {
    throw new Error('No fingerprints to merge');
  }
  
  if (fingerprints.length === 1) {
    return fingerprints[0];
  }
  
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const base = fingerprints[0];
  const photos = fingerprints.map(photosIn);
  const totalPhotos = photos.reduce((sum, count) => sum + count, 0);
  // The mean over every photo of one value of each fingerprint.
  const perPhoto = (value: (fp: VisualFingerprint) => number): number =>
    fingerprints.reduce((sum, fp, i) => sum + value(fp) * photos[i], 0) / totalPhotos;
  
  // Merge color histograms (nearest colours together, shares averaged)
  const mergedHistogram = mergeHistograms(
    fingerprints.map(fp => fp.colorHistogram),
    photos,
    opts.histogramBuckets
  );
  
  // Merge dominant colors (find most common across all)
  const allDominant = fingerprints.flatMap(fp => fp.dominantColors);
  const mergedDominant = extractDominantColorsFromArray(allDominant, base.dominantColors.length);
  
  // Average other properties
  const avgAvgColor = {
    r: Math.round(perPhoto(fp => fp.averageColor.r)),
    g: Math.round(perPhoto(fp => fp.averageColor.g)),
    b: Math.round(perPhoto(fp => fp.averageColor.b)),
  };
  
  const avgVariance = perPhoto(fp => fp.colorVariance);
  const avgSizeRatio = perPhoto(fp => fp.estimatedSizeRatio);
  
  // Average edge signatures, each over the photos its edges came from
  const edgeWeights = fingerprints.map((fp, i) => Math.min(fp.edgePhotos ?? photos[i], photos[i]));
  const edgeTotal = edgeWeights.reduce((sum, count) => sum + count, 0);
  const avgEdge = base.edgeSignature.map((_, i) =>
    Math.round(
      edgeTotal > 0
        ? fingerprints.reduce((sum, fp, k) => sum + (fp.edgeSignature[i] || 0) * edgeWeights[k], 0) / edgeTotal
        : 0
    )
  );
  
  // Collect all reference images
  const allImages = fingerprints.flatMap(fp => fp.referenceImages);
  const keptImages = allImages.slice(0, 5); // Keep up to 5 reference images
  const edgePhotos = Math.min(edgeTotal, Math.max(1, keptImages.length));
  
  return {
    id: base.id,
    name: base.name,
    colorHistogram: mergedHistogram,
    dominantColors: mergedDominant,
    averageColor: avgAvgColor,
    colorVariance: avgVariance,
    estimatedSizeRatio: avgSizeRatio,
    edgeSignature: avgEdge,
    referenceImages: keptImages,
    createdAt: base.createdAt,
    // Photos of an earlier version's form leave the merge in that form.
    version: fingerprints.every(isCurrentFingerprint) ? FINGERPRINT_VERSION : undefined,
    ...(edgePhotos < Math.max(1, keptImages.length) ? { edgePhotos } : {}),
  };
}

/** Reads one reference photo into its fingerprint: generateFingerprint in the app. */
export type ReadPhoto = (photo: string) => Promise<VisualFingerprint>;

/**
 * A saved subject's fingerprint in the current form. A fingerprint saved by
 * version 1 is made again from the subject's saved photos, `photos`, each
 * read with `read` and each counted once; it keeps its id, name and creation
 * time. A current fingerprint, a subject with no saved photos and a photo
 * that cannot be read leave the saved fingerprint as it is: the matcher reads
 * a version 1 fingerprint's edges on that version's scale.
 */
export async function upgradeFingerprint(
  saved: VisualFingerprint,
  photos: string[],
  read: ReadPhoto
): Promise<VisualFingerprint> {
  if (isCurrentFingerprint(saved) || photos.length === 0) {
    return saved;
  }

  let rebuilt: VisualFingerprint;
  try {
    const fingerprints: VisualFingerprint[] = [];
    for (const photo of photos) {
      fingerprints.push(await read(photo));
    }
    rebuilt = mergeFingerprints(fingerprints);
  } catch {
    return saved;
  }

  if (!isCurrentFingerprint(rebuilt)) {
    return saved;
  }
  return { ...rebuilt, id: saved.id, name: saved.name, createdAt: saved.createdAt };
}

/**
 * A saved subject's fingerprint with `newPhotos` added, each photo counted
 * once. A fingerprint saved by version 1 is first rebuilt from the subject's
 * saved photos, `savedPhotos` (upgradeFingerprint). When it cannot be, its
 * colours count as the photos it was made from and its edges, read on
 * version 1's scale, are left out: the result's edges are the new photos'.
 */
export async function addReferencePhotos(
  saved: VisualFingerprint,
  savedPhotos: string[],
  newPhotos: string[],
  read: ReadPhoto
): Promise<VisualFingerprint> {
  const base = await upgradeFingerprint(saved, savedPhotos, read);
  const added: VisualFingerprint[] = [];
  for (const photo of newPhotos) {
    added.push(await read(photo));
  }
  if (added.length === 0) {
    return base;
  }

  const merged = mergeFingerprints([base, ...added]);
  if (isCurrentFingerprint(base) || !added.every(isCurrentFingerprint)) {
    return merged;
  }
  // The edges are the new photos' alone: the next photo added weighs them as
  // that many photos, not as every photo the colours count.
  const edgePhotos = added.reduce((sum, fp) => sum + photosIn(fp), 0);
  const counted = Math.max(1, merged.referenceImages.length);
  return {
    ...merged,
    edgeSignature: mergeFingerprints(added).edgeSignature,
    version: FINGERPRINT_VERSION,
    edgePhotos: edgePhotos < counted ? edgePhotos : undefined,
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

/** The size tolerance used when the caller gives none. */
export const DEFAULT_SIZE_TOLERANCE = 50;

/**
 * Compare two fingerprints.
 *
 * `sizeTolerance` (0 to 100) is the difference between the two size ratios,
 * in points of the picture, at which the size term reaches 0. Equal sizes
 * score 100 at every tolerance; at 50 a difference of 25 points scores 50; at
 * 0 only equal sizes score.
 */
export function compareFingerprints(
  fp1: VisualFingerprint,
  fp2: VisualFingerprint,
  weights: { color: number; dominant: number; edge: number; size: number } = {
    color: 0.4,
    dominant: 0.35,
    edge: 0.15,
    size: 0.1,
  },
  sizeTolerance: number = DEFAULT_SIZE_TOLERANCE
): ComparisonResult {
  // Color histogram match (Earth Mover's Distance approximation)
  const colorMatch = compareHistograms(fp1.colorHistogram, fp2.colorHistogram);
  
  // Dominant color match
  const dominantMatch = compareDominantColors(fp1.dominantColors, fp2.dominantColors);
  
  // Edge signature match
  const edgeMatch = compareEdgeSignatures(
    fp1.edgeSignature,
    fp2.edgeSignature,
    !isCurrentFingerprint(fp1),
    !isCurrentFingerprint(fp2)
  );
  
  // Size ratio match
  const sizeMatch = compareSizeRatios(fp1.estimatedSizeRatio, fp2.estimatedSizeRatio, sizeTolerance);
  
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
 * Read a square edge signature on a coarser square grid. Each coarse cell is
 * the mean of the fine cells it covers, weighted by how much of each it
 * covers. On the fixed scale of extractEdgeSignature that is what the coarser
 * grid reads while no fine cell reads 100, so weak edges stay as weak as they
 * are. A fine cell at 100 may stand for a stronger cell, which the signature
 * does not keep: a block of one such cell and three flat ones pools to 25
 * where the coarser grid can read it as up to 100. The app reads every
 * subject and every region of the camera's frame on one grid (a region on its
 * subject's grid), so it pools only signatures made on other grids. `scaledToStrongest` is
 * for a signature scaled to its picture's strongest cell, as version 1 saved
 * them: the result is scaled back so its strongest cell reads what the finer
 * signature's strongest cell read.
 */
export function poolEdgeSignature(signature: number[], side: number, scaledToStrongest: boolean = false): number[] {
  const from = edgeGridSide(signature);
  if (from === 0 || side <= 0 || side >= from) {
    return signature;
  }

  const scale = from / side;
  const pooled: number[] = [];

  for (let cy = 0; cy < side; cy++) {
    const top = cy * scale;
    const bottom = (cy + 1) * scale;

    for (let cx = 0; cx < side; cx++) {
      const left = cx * scale;
      const right = (cx + 1) * scale;
      let sum = 0;
      let weight = 0;

      for (let fy = Math.floor(top); fy < from && fy < bottom; fy++) {
        const rows = Math.min(bottom, fy + 1) - Math.max(top, fy);
        if (rows <= 0) continue;

        for (let fx = Math.floor(left); fx < from && fx < right; fx++) {
          const columns = Math.min(right, fx + 1) - Math.max(left, fx);
          if (columns <= 0) continue;

          sum += signature[fy * from + fx] * rows * columns;
          weight += rows * columns;
        }
      }

      pooled.push(weight > 0 ? sum / weight : 0);
    }
  }

  if (!scaledToStrongest) {
    return pooled;
  }

  // Pooling averages cells, which lowers the strongest one; a signature
  // scaled to its own strongest cell reads 100 there on any grid.
  const strongest = Math.max(...pooled);
  const ceiling = Math.max(...signature);
  return strongest > 0 ? pooled.map(e => (e / strongest) * ceiling) : pooled;
}

/**
 * Compare edge signatures cell by cell. Two signatures read on different
 * square grids are compared on the coarser of the two: the finer one is
 * pooled down to it, as a signature of version 1's scale when
 * `scaledToStrongest1` or `scaledToStrongest2` says so. A signature that is
 * empty or is not a square grid has no cells to line up with the other's, and
 * scores 0.
 */
function compareEdgeSignatures(
  e1: number[],
  e2: number[],
  scaledToStrongest1: boolean = false,
  scaledToStrongest2: boolean = false
): number {
  if (e1.length !== e2.length) {
    const side1 = edgeGridSide(e1);
    const side2 = edgeGridSide(e2);
    if (side1 === 0 || side2 === 0) {
      return 0;
    }
    const side = Math.min(side1, side2);
    return compareEdgeSignatures(
      poolEdgeSignature(e1, side, scaledToStrongest1),
      poolEdgeSignature(e2, side, scaledToStrongest2)
    );
  }

  if (e1.length === 0) {
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
 * Compare size ratios (each 0 to 1). The score falls in a straight line from
 * 100 for equal ratios to 0 at a difference of `tolerance` points.
 */
function compareSizeRatios(ratio1: number, ratio2: number, tolerance: number): number {
  const sizeDiff = Math.abs(ratio1 - ratio2);
  const allowed = Math.max(0, Math.min(100, tolerance));

  if (allowed === 0) {
    return sizeDiff === 0 ? 100 : 0;
  }

  return Math.max(0, 100 - sizeDiff * (10000 / allowed));
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

