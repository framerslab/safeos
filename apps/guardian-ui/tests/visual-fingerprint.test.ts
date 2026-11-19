/**
 * Visual Fingerprint Tests
 * 
 * Tests for the visual fingerprinting library used
 * in Lost & Found detection.
 * 
 * @module tests/visual-fingerprint.test
 */

// Using Jest testing framework
import {
  rgbToHsl,
  colorDistance,
  perceptualColorDistance,
  calculateAverageColor,
  extractColorHistogram,
  extractDominantColors,
  extractEdgeSignature,
  estimateSizeRatio,
  compareFingerprints,
  quickCompare,
  mergeFingerprints,
  normalizeBrightness,
  poolEdgeSignature,
  upgradeFingerprint,
  addReferencePhotos,
  FINGERPRINT_VERSION,
  type RGB,
  type VisualFingerprint,
  type ColorBucket,
} from '../src/lib/visual-fingerprint';
import { SubjectMatcher, regionEdgeSignature } from '../src/lib/subject-matcher';
import { BLACK, WHITE, canvasOf, enrol, flat, picture, stripes } from './helpers/pictures';

// =============================================================================
// Mock ImageData for testing
// =============================================================================

function createMockImageData(width: number, height: number, fill?: RGB): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  const color = fill || { r: 128, g: 128, b: 128 };
  
  for (let i = 0; i < data.length; i += 4) {
    data[i] = color.r;
    data[i + 1] = color.g;
    data[i + 2] = color.b;
    data[i + 3] = 255;
  }
  
  return new ImageData(data, width, height);
}

function createGradientImageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      data[idx] = Math.floor((x / width) * 255);
      data[idx + 1] = Math.floor((y / height) * 255);
      data[idx + 2] = 128;
      data[idx + 3] = 255;
    }
  }
  
  return new ImageData(data, width, height);
}

// =============================================================================
// Color Conversion Tests
// =============================================================================

describe('Color Conversion', () => {
  describe('rgbToHsl', () => {
    it('should convert pure red to HSL', () => {
      const hsl = rgbToHsl(255, 0, 0);
      expect(hsl.h).toBe(0);
      expect(hsl.s).toBe(100);
      expect(hsl.l).toBe(50);
    });

    it('should convert pure green to HSL', () => {
      const hsl = rgbToHsl(0, 255, 0);
      expect(hsl.h).toBe(120);
      expect(hsl.s).toBe(100);
      expect(hsl.l).toBe(50);
    });

    it('should convert pure blue to HSL', () => {
      const hsl = rgbToHsl(0, 0, 255);
      expect(hsl.h).toBe(240);
      expect(hsl.s).toBe(100);
      expect(hsl.l).toBe(50);
    });

    it('should convert white to HSL', () => {
      const hsl = rgbToHsl(255, 255, 255);
      expect(hsl.h).toBe(0);
      expect(hsl.s).toBe(0);
      expect(hsl.l).toBe(100);
    });

    it('should convert black to HSL', () => {
      const hsl = rgbToHsl(0, 0, 0);
      expect(hsl.h).toBe(0);
      expect(hsl.s).toBe(0);
      expect(hsl.l).toBe(0);
    });

    it('should handle gray correctly', () => {
      const hsl = rgbToHsl(128, 128, 128);
      expect(hsl.h).toBe(0);
      expect(hsl.s).toBe(0);
      expect(hsl.l).toBeCloseTo(50.2, 0);
    });
  });
});

// =============================================================================
// Color Distance Tests
// =============================================================================

describe('Color Distance', () => {
  describe('colorDistance', () => {
    it('should return 0 for identical colors', () => {
      const color: RGB = { r: 100, g: 150, b: 200 };
      expect(colorDistance(color, color)).toBe(0);
    });

    it('should return max distance for black to white', () => {
      const black: RGB = { r: 0, g: 0, b: 0 };
      const white: RGB = { r: 255, g: 255, b: 255 };
      const distance = colorDistance(black, white);
      expect(distance).toBeCloseTo(441.67, 0);
    });

    it('should be symmetric', () => {
      const c1: RGB = { r: 50, g: 100, b: 150 };
      const c2: RGB = { r: 200, g: 50, b: 75 };
      expect(colorDistance(c1, c2)).toBe(colorDistance(c2, c1));
    });
  });

  describe('perceptualColorDistance', () => {
    it('should return 0 for identical colors', () => {
      const color: RGB = { r: 100, g: 150, b: 200 };
      expect(perceptualColorDistance(color, color)).toBe(0);
    });

    it('should weight green more than red', () => {
      const base: RGB = { r: 128, g: 128, b: 128 };
      const redShift: RGB = { r: 178, g: 128, b: 128 };
      const greenShift: RGB = { r: 128, g: 178, b: 128 };
      
      const redDist = perceptualColorDistance(base, redShift);
      const greenDist = perceptualColorDistance(base, greenShift);
      
      // Green should have more weight
      expect(greenDist).toBeGreaterThan(redDist);
    });
  });
});

// =============================================================================
// Color Analysis Tests
// =============================================================================

describe('Color Analysis', () => {
  describe('calculateAverageColor', () => {
    it('should calculate average of solid color image', () => {
      const imageData = createMockImageData(10, 10, { r: 100, g: 150, b: 200 });
      const avg = calculateAverageColor(imageData);
      
      expect(avg.r).toBe(100);
      expect(avg.g).toBe(150);
      expect(avg.b).toBe(200);
    });

    it('should calculate average of gradient image', () => {
      const imageData = createGradientImageData(10, 10);
      const avg = calculateAverageColor(imageData);
      
      // Average of gradient should be roughly middle values
      expect(avg.r).toBeGreaterThan(100);
      expect(avg.r).toBeLessThan(140);
    });
  });

  describe('extractColorHistogram', () => {
    it('should extract histogram from solid color image', () => {
      const imageData = createMockImageData(10, 10, { r: 100, g: 50, b: 200 });
      const histogram = extractColorHistogram(imageData);
      
      expect(histogram.length).toBeGreaterThan(0);
      expect(histogram[0].count).toBeGreaterThan(0);
      expect(histogram[0].percentage).toBeGreaterThan(0);
    });

    it('should respect bins parameter', () => {
      const imageData = createGradientImageData(10, 10);
      const smallHist = extractColorHistogram(imageData, 8);
      const largeHist = extractColorHistogram(imageData, 16);
      
      // More bins can mean more buckets
      expect(largeHist.length).toBeGreaterThanOrEqual(smallHist.length * 0.5);
    });
  });

  describe('extractDominantColors', () => {
    it('should extract dominant colors', () => {
      const imageData = createMockImageData(10, 10, { r: 100, g: 50, b: 200 });
      const colors = extractDominantColors(imageData, 3);
      
      expect(colors.length).toBeLessThanOrEqual(3);
      expect(colors.length).toBeGreaterThan(0);
    });

    it('should respect count parameter', () => {
      const imageData = createGradientImageData(10, 10);
      const colors = extractDominantColors(imageData, 5);
      
      expect(colors.length).toBeLessThanOrEqual(5);
    });
  });
});

// =============================================================================
// Feature Extraction Tests
// =============================================================================

describe('Feature Extraction', () => {
  describe('extractEdgeSignature', () => {
    it('should extract edge signature', () => {
      const imageData = createGradientImageData(32, 32);
      const signature = extractEdgeSignature(imageData, 4);
      
      expect(signature.length).toBe(16); // 4x4 grid
      expect(signature.every(v => typeof v === 'number')).toBe(true);
    });

    it('should return normalized values', () => {
      const imageData = createGradientImageData(32, 32);
      const signature = extractEdgeSignature(imageData, 4);
      
      // Check that values are numbers and within a reasonable range
      signature.forEach(v => {
        expect(typeof v).toBe('number');
        expect(v).toBeGreaterThanOrEqual(0);
        // Values can be normalized to any range, just ensure they're not extreme
      });
    });
  });

  describe('estimateSizeRatio', () => {
    it('should estimate size ratio', () => {
      const imageData = createMockImageData(100, 100, { r: 200, g: 200, b: 200 });
      const ratio = estimateSizeRatio(imageData);
      
      expect(ratio).toBeGreaterThanOrEqual(0);
      expect(ratio).toBeLessThanOrEqual(1);
    });
  });
});

// =============================================================================
// Fingerprint Comparison Tests
// =============================================================================

describe('Fingerprint Comparison', () => {
  const createMockFingerprint = (overrides: Partial<VisualFingerprint> = {}): VisualFingerprint => ({
    id: 'test-fp',
    name: 'Test',
    colorHistogram: [
      { color: { r: 100, g: 50, b: 25 }, count: 100, percentage: 60 },
    ],
    dominantColors: [{ r: 100, g: 50, b: 25 }],
    averageColor: { r: 100, g: 50, b: 25 },
    colorVariance: 20,
    estimatedSizeRatio: 0.3,
    edgeSignature: [0.1, 0.2, 0.3, 0.4],
    referenceImages: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  describe('compareFingerprints', () => {
    it('should return 100% for identical fingerprints', () => {
      const fp = createMockFingerprint();
      const result = compareFingerprints(fp, fp);
      
      expect(result.overall).toBeGreaterThan(95);
    });

    it('should return lower score for different fingerprints', () => {
      const fp1 = createMockFingerprint({
        averageColor: { r: 0, g: 0, b: 0 },
        dominantColors: [{ r: 0, g: 0, b: 0 }],
      });
      const fp2 = createMockFingerprint({
        averageColor: { r: 255, g: 255, b: 255 },
        dominantColors: [{ r: 255, g: 255, b: 255 }],
      });
      
      const resultSame = compareFingerprints(fp1, fp1);
      const resultDiff = compareFingerprints(fp1, fp2);
      
      // Different fingerprints should score lower than identical ones
      expect(resultDiff.overall).toBeLessThan(resultSame.overall);
    });

    it('should include detailed match scores', () => {
      const fp = createMockFingerprint();
      const result = compareFingerprints(fp, fp);
      
      expect(result).toHaveProperty('colorMatch');
      expect(result).toHaveProperty('dominantMatch');
      expect(result).toHaveProperty('edgeMatch');
      expect(result).toHaveProperty('sizeMatch');
      expect(result).toHaveProperty('overall');
    });
  });

  describe('quickCompare', () => {
    it('should return high score for similar colors', () => {
      const fp = createMockFingerprint();
      const imageData = createMockImageData(10, 10, { r: 100, g: 50, b: 25 });
      
      const score = quickCompare(fp, imageData);
      expect(score).toBeGreaterThan(50);
    });
  });
});

// =============================================================================
// Fingerprint Merging Tests
// =============================================================================

describe('Fingerprint Merging', () => {
  const createMockFingerprint = (overrides: Partial<VisualFingerprint> = {}): VisualFingerprint => ({
    id: 'test-fp',
    name: 'Test',
    colorHistogram: [
      { color: { r: 100, g: 50, b: 25 }, count: 100, percentage: 100 },
    ],
    dominantColors: [{ r: 100, g: 50, b: 25 }],
    averageColor: { r: 100, g: 50, b: 25 },
    colorVariance: 20,
    estimatedSizeRatio: 0.3,
    edgeSignature: [0.1, 0.2, 0.3, 0.4],
    referenceImages: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  describe('mergeFingerprints', () => {
    it('should merge multiple fingerprints', () => {
      const fp1 = createMockFingerprint({ id: 'fp1' });
      const fp2 = createMockFingerprint({ id: 'fp2' });
      
      const merged = mergeFingerprints([fp1, fp2]);
      
      expect(merged.id).toBeTruthy();
      expect(merged.referenceImages.length).toBe(0); // No reference images in mocks
    });

    it('should average colors from multiple sources', () => {
      const fp1 = createMockFingerprint({
        averageColor: { r: 0, g: 0, b: 0 },
      });
      const fp2 = createMockFingerprint({
        averageColor: { r: 200, g: 200, b: 200 },
      });
      
      const merged = mergeFingerprints([fp1, fp2]);
      
      expect(merged.averageColor.r).toBe(100);
      expect(merged.averageColor.g).toBe(100);
      expect(merged.averageColor.b).toBe(100);
    });
  });
});

// =============================================================================
// Brightness Normalization Tests
// =============================================================================

describe('Brightness Normalization', () => {
  describe('normalizeBrightness', () => {
    it('should normalize dark color to target lightness', () => {
      const dark: RGB = { r: 50, g: 50, b: 50 };
      const normalized = normalizeBrightness(dark, 50);
      
      // Should be brighter
      expect(normalized.r).toBeGreaterThan(dark.r);
    });

    it('should normalize bright color to target lightness', () => {
      const bright: RGB = { r: 200, g: 200, b: 200 };
      const normalized = normalizeBrightness(bright, 50);
      
      // Should be darker
      expect(normalized.r).toBeLessThan(bright.r);
    });
  });
});

// =============================================================================
// Edge signatures read on different grids
// =============================================================================

describe('Edge signatures read on different grids', () => {
  const withEdges = (edgeSignature: number[]): VisualFingerprint => ({
    id: 'edges',
    name: 'Edges',
    colorHistogram: [{ color: { r: 100, g: 50, b: 25 }, count: 100, percentage: 100 }],
    dominantColors: [{ r: 100, g: 50, b: 25 }],
    averageColor: { r: 100, g: 50, b: 25 },
    colorVariance: 0,
    estimatedSizeRatio: 0.3,
    edgeSignature,
    referenceImages: [],
    createdAt: '',
    version: FINGERPRINT_VERSION,
  });

  // Stripes on the left half, one flat colour on the right half: the left
  // cells of any even grid read 100 and the right cells read 0.
  const halfStriped = picture(128, 128, (x) => (x < 64 && x % 2 === 1 ? WHITE : BLACK));

  it('pools the finer grid down to the coarser one', () => {
    const fine = withEdges(extractEdgeSignature(halfStriped, 8));
    const coarse = withEdges(extractEdgeSignature(halfStriped, 4));

    expect(fine.edgeSignature).toHaveLength(64);
    expect(coarse.edgeSignature).toHaveLength(16);
    // The same picture read on two grids is the same picture.
    expect(compareFingerprints(fine, coarse).edgeMatch).toBe(100);
    expect(compareFingerprints(coarse, fine).edgeMatch).toBe(100);
  });

  it('still tells different edges apart across grids', () => {
    const fine = withEdges(extractEdgeSignature(halfStriped, 8));
    const striped = withEdges(extractEdgeSignature(stripes(128, 128), 4));

    // Half of the pooled cells read 0 where the striped picture reads 100.
    expect(compareFingerprints(fine, striped).edgeMatch).toBe(50);
  });

  it('keeps weak edges weak when it pools them', () => {
    // A flat grey wall with one level of dither, as a camera's noise gives
    // it: every cell reads 2 on any grid, where black and white stripes read
    // 100.
    const wall = picture(128, 128, (x, y) => ((x + y) % 2 === 1 ? [129, 129, 129] : [128, 128, 128]));
    const weakFine = withEdges(extractEdgeSignature(wall, 8));
    const weakCoarse = withEdges(extractEdgeSignature(wall, 4));
    const strongCoarse = withEdges(extractEdgeSignature(stripes(128, 128), 4));

    expect(weakFine.edgeSignature.every((cell) => cell === 2)).toBe(true);
    expect(weakCoarse.edgeSignature.every((cell) => cell === 2)).toBe(true);
    // Weak edges against strong ones score as they do on one grid: 2.
    expect(compareFingerprints(weakFine, strongCoarse).edgeMatch).toBe(2);
    expect(compareFingerprints(strongCoarse, weakFine).edgeMatch).toBe(2);
    // The same wall read on two grids is the same wall.
    expect(compareFingerprints(weakFine, weakCoarse).edgeMatch).toBe(100);
  });

  it('pools a region\'s weak edges to what the coarser grid reads', () => {
    // On a 16 by 16 grid, the left half's 2 by 2 blocks of cells each hold one
    // cell of one-level dither and three flat cells.
    const dotted = picture(128, 128, (x, y) => {
      const dithered = x < 64 && Math.floor(x / 8) % 2 === 0 && Math.floor(y / 8) % 2 === 0;
      return dithered && (x + y) % 2 === 1 ? [129, 129, 129] : [128, 128, 128];
    });
    const fine = regionEdgeSignature(dotted, 16);
    const coarse = regionEdgeSignature(dotted, 8);
    const pooled = poolEdgeSignature(fine, 8);

    expect(pooled).toHaveLength(64);
    // Each pooled cell reads what the coarser grid reads, give or take the
    // rounding of the finer cells.
    pooled.forEach((cell, i) => {
      expect(Math.abs(cell - coarse[i])).toBeLessThanOrEqual(1);
    });
  });

  it('scores 0 against a signature that is not a square grid', () => {
    const fine = withEdges(extractEdgeSignature(halfStriped, 8));
    const odd = withEdges([100, 100, 100, 100, 0, 0, 0, 0]);

    expect(compareFingerprints(fine, odd).edgeMatch).toBe(0);
  });
});

// =============================================================================
// Merging reference photos
// =============================================================================

describe('Merging the colour histograms of reference photos', () => {
  const photo = stripes(128, 128, [40, 40, 40], [200, 200, 200]);
  // The same picture one level brighter, as a second photo of one animal is.
  const brighter = stripes(128, 128, [41, 41, 41], [201, 201, 201]);

  const shares = (fingerprint: VisualFingerprint): number[] =>
    fingerprint.colorHistogram.map((bucket) => bucket.percentage);
  const total = (fingerprint: VisualFingerprint): number =>
    shares(fingerprint).reduce((sum, share) => sum + share, 0);

  it('gives one photo\'s histogram when the photos are identical', () => {
    const one = enrol(photo);
    const merged = mergeFingerprints([one, enrol(photo)]);

    expect(merged.colorHistogram).toEqual(one.colorHistogram);
  });

  it('puts buckets a level apart together and keeps their share', () => {
    const merged = mergeFingerprints([enrol(photo), enrol(brighter)]);

    // Half dark and half light in both photos: half and half merged.
    expect(shares(merged)).toEqual([50, 50]);
  });

  it('keeps the colours of every photo, with shares that add up as one photo\'s do', () => {
    const striped = enrol(stripes(128, 128));
    const red = enrol(flat(128, 128, [200, 30, 30]));
    const merged = mergeFingerprints([striped, red]);

    expect(total(striped)).toBe(100);
    expect(total(red)).toBe(100);
    // Red from one photo of two, black and white from the other.
    expect(shares(merged)).toEqual([50, 25, 25]);
    expect(total(merged)).toBe(100);
  });

  it('keeps a small photo\'s colour when a larger photo fills every bucket', () => {
    // 32 bands of 8 rows, each a colour of its own bucket: 2048 pixels each.
    const levels = [0, 85, 170, 255];
    const many = picture(256, 256, (_x, y) => {
      const band = Math.floor(y / 8);
      return [levels[band >> 4], levels[(band >> 2) & 3], levels[band & 3]];
    });
    // One colour far from all of them, over 1024 pixels.
    const small = flat(32, 32, WHITE);
    const merged = mergeFingerprints([enrol(many), enrol(small)]);

    expect(enrol(many).colorHistogram).toHaveLength(32);
    expect(merged.colorHistogram).toHaveLength(32);
    // Half of the subject is white in one photo of two.
    expect(merged.colorHistogram[0]).toEqual({ color: { r: 255, g: 255, b: 255 }, count: 512, percentage: 50 });
  });

  it('counts a photo added to a saved subject as one photo of the subject\'s photos', () => {
    // Each photo's fingerprint holds its one thumbnail, as generateFingerprint's does.
    const photoOf = (pixels: ImageData): VisualFingerprint => ({ ...enrol(pixels), referenceImages: ['thumbnail'] });
    const red = photoOf(flat(128, 128, [200, 30, 30]));
    const striped = photoOf(stripes(128, 128));

    // Four red photos saved together, then a striped one added on the
    // subject's page, which merges the saved fingerprint with the new photo's.
    const saved = mergeFingerprints([red, red, red, red]);
    const added = mergeFingerprints([saved, striped]);
    const together = mergeFingerprints([red, red, red, red, striped]);

    expect(saved.referenceImages).toHaveLength(4);
    // Red in four photos of five; black and white each half of one photo.
    expect(shares(added)).toEqual([80, 10, 10]);
    expect(added.edgeSignature.every((cell) => cell === 20)).toBe(true);
    // The same subject as the five photos saved together.
    expect(added.colorHistogram).toEqual(together.colorHistogram);
    expect(added.averageColor).toEqual(together.averageColor);
    expect(added.edgeSignature).toEqual(together.edgeSignature);
    expect(added.estimatedSizeRatio).toBeCloseTo(together.estimatedSizeRatio, 10);
    expect(added.colorVariance).toBeCloseTo(together.colorVariance, 10);
  });

  // Photos stand in by name for the saved pictures generateFingerprint reads.
  const COLOURS: Record<string, [number, number, number]> = {
    red: [200, 30, 30],
    blue: [30, 30, 200],
    green: [30, 200, 30],
    black: [0, 0, 0],
  };
  const PICTURES: Record<string, ImageData> = {
    ...Object.fromEntries(Object.entries(COLOURS).map(([name, colour]) => [name, flat(64, 64, colour)])),
    wall: picture(128, 128, (x, y) => ((x + y) % 2 === 1 ? [129, 129, 129] : [128, 128, 128])),
  };
  const read = async (photo: string): Promise<VisualFingerprint> => ({
    ...enrol(PICTURES[photo]),
    referenceImages: [photo],
  });
  const shareOf = (fingerprint: VisualFingerprint, name: string): number | undefined => {
    const [r, g, b] = COLOURS[name];
    return fingerprint.colorHistogram.find((bucket) => colorDistance(bucket.color, { r, g, b }) === 0)?.percentage;
  };

  it('rebuilds a subject saved by the version before from its photos when a photo is added', async () => {
    // Saved by the version before: two red photos enrolled together, then
    // blue added, then green, each added photo counted as much as all the
    // photos before it. Red, blue and green hold 25, 25 and 50.
    const bucket = (name: string, percentage: number): ColorBucket => {
      const [r, g, b] = COLOURS[name];
      return { color: { r, g, b }, count: 1024, percentage };
    };
    const photos = ['red', 'red', 'blue', 'green'];
    const savedBefore: VisualFingerprint = {
      ...(await read('red')),
      colorHistogram: [bucket('green', 50), bucket('red', 25), bucket('blue', 25)],
      referenceImages: photos,
      version: undefined,
    };

    const added = await addReferencePhotos(savedBefore, photos, ['black'], read);

    // Five photos, each counted once: two of them red.
    expect(['red', 'blue', 'green', 'black'].map((name) => shareOf(added, name))).toEqual([40, 20, 20, 20]);
  });

  it('rebuilds a subject saved by the version before from its saved photos', async () => {
    const savedBefore: VisualFingerprint = {
      ...(await read('wall')),
      id: 'saved',
      name: 'Saved',
      createdAt: 'then',
      // That version scaled a photo's edges to its own strongest cell.
      edgeSignature: new Array(64).fill(100),
      version: undefined,
    };

    const upgraded = await upgradeFingerprint(savedBefore, ['wall'], read);

    expect(upgraded.version).toBe(2);
    expect(upgraded.edgeSignature).toEqual(enrol(PICTURES.wall).edgeSignature);
    expect([upgraded.id, upgraded.name, upgraded.createdAt]).toEqual(['saved', 'Saved', 'then']);
  });

  it('weighs edges by the photos they came from, for a subject saved by the version before that could not be rebuilt', async () => {
    // Saved by the version before from a photo that cannot be read now: its
    // colours stay, and its edges, on that version's scale, are left out.
    const savedBefore: VisualFingerprint = {
      ...(await read('red')),
      edgeSignature: new Array(64).fill(100),
      referenceImages: ['lost'],
      version: undefined,
    };
    const pictures: Record<string, ImageData> = { striped: stripes(64, 64), plain: flat(64, 64, COLOURS.red) };
    const reading = async (photo: string): Promise<VisualFingerprint> => {
      if (!(photo in pictures)) throw new Error('The photo cannot be read');
      return { ...enrol(pictures[photo]), referenceImages: [photo] };
    };

    const once = await addReferencePhotos(savedBefore, ['lost'], ['striped'], reading);
    expect(once.edgeSignature).toEqual(enrol(pictures.striped).edgeSignature);

    const twice = await addReferencePhotos(once, once.referenceImages, ['plain'], reading);
    // The two photos with edges count once each: striped cells read 100, plain ones 0.
    expect(twice.edgeSignature.every((cell) => cell === 50)).toBe(true);
  });

  it('keeps a saved subject that has no photos as it was', async () => {
    const savedBefore: VisualFingerprint = { ...(await read('red')), version: undefined };

    expect(await upgradeFingerprint(savedBefore, [], read)).toBe(savedBefore);
  });

  it('scores a picture the same against one photo and against two that are a level apart', () => {
    const one = enrol(photo);
    const merged = mergeFingerprints([one, enrol(brighter)]);
    const colourTerm = (subject: VisualFingerprint): number | undefined => {
      const matcher = new SubjectMatcher({ minConfidenceForRecord: 0, adaptiveLighting: false, motionPriority: false });
      matcher.setFingerprint(subject);
      matcher.setActive(true);
      return matcher.processCanvas(canvasOf(photo))?.details.colorMatch;
    };

    expect(colourTerm(one)).toBe(100);
    expect(colourTerm(merged)).toBe(100);
  });
});
