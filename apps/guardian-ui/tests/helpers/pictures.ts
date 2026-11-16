/**
 * Pictures made in code for the Lost & Found matcher's tests, and the small
 * stand-ins that let the matcher read them under Node.
 */

import {
  calculateAverageColor,
  calculateColorVariance,
  estimateSizeRatio,
  extractColorHistogram,
  extractDominantColors,
  extractEdgeSignature,
  type VisualFingerprint,
} from '../../src/lib/visual-fingerprint';

export type Colour = [number, number, number];

export const BLACK: Colour = [0, 0, 0];
export const WHITE: Colour = [255, 255, 255];

/** A picture whose pixel at (x, y) has the colour `colourAt` returns. */
export function picture(
  width: number,
  height: number,
  colourAt: (x: number, y: number) => Colour
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colourAt(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

/** Vertical stripes one pixel wide: `even` on even columns, `odd` on odd ones. */
export const stripes = (
  width: number,
  height: number,
  even: Colour = BLACK,
  odd: Colour = WHITE
): ImageData => picture(width, height, (x) => (x % 2 === 0 ? even : odd));

/** One colour everywhere. */
export const flat = (width: number, height: number, colour: Colour): ImageData =>
  picture(width, height, () => colour);

/**
 * One colour with a centred block of another: the block spans the middle half
 * of the width and of the height, a quarter of the picture.
 */
export const centredBlock = (
  width: number,
  height: number,
  around: Colour,
  block: Colour
): ImageData =>
  picture(width, height, (x, y) =>
    x >= width / 4 && x < (width * 3) / 4 && y >= height / 4 && y < (height * 3) / 4 ? block : around
  );

/**
 * The fingerprint generateFingerprint stores for a picture: the same
 * extractors with the same defaults (32 buckets, 5 colours, an 8 by 8 edge
 * grid), without the image loading a browser does first.
 */
export function enrol(pixels: ImageData): VisualFingerprint {
  const averageColor = calculateAverageColor(pixels);
  return {
    id: 'subject',
    name: 'subject',
    referenceImages: [],
    createdAt: '',
    colorHistogram: extractColorHistogram(pixels, 32),
    dominantColors: extractDominantColors(pixels, 5),
    averageColor,
    colorVariance: calculateColorVariance(pixels, averageColor),
    estimatedSizeRatio: estimateSizeRatio(pixels),
    edgeSignature: extractEdgeSignature(pixels, 8),
  };
}

/** A canvas that hands processCanvas the given pixels. */
export const canvasOf = (pixels: ImageData): HTMLCanvasElement =>
  ({
    width: pixels.width,
    height: pixels.height,
    getContext: () => ({ getImageData: () => pixels }),
  }) as unknown as HTMLCanvasElement;

/** A video element that shows the given pixels to processFrame. */
export const videoOf = (pixels: ImageData): HTMLVideoElement =>
  ({
    videoWidth: pixels.width,
    videoHeight: pixels.height,
    pixels,
  }) as unknown as HTMLVideoElement;

/**
 * processFrame draws the video on a canvas of its own and reads the pixels
 * back, and Node has no document to make that canvas. This installs one whose
 * canvas hands back the pixels of the video from videoOf last drawn on it.
 * Call the returned function to take it away again.
 */
export function installCanvasDocument(): () => void {
  const globals = globalThis as unknown as { document?: unknown };
  const previous = globals.document;
  globals.document = {
    createElement: () => {
      let drawn: ImageData | null = null;
      const context = {
        drawImage: (video: { pixels: ImageData }) => {
          drawn = video.pixels;
        },
        getImageData: () => drawn,
      };
      return {
        width: 0,
        height: 0,
        getContext: () => context,
        toDataURL: () => 'data:image/jpeg;base64,AA==',
      };
    },
  };
  return () => {
    if (previous === undefined) {
      delete globals.document;
    } else {
      globals.document = previous;
    }
  };
}
