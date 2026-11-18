/**
 * A striped picture for the Lost & Found walks: a camera clip of grey stripes
 * drifting sideways, and a still photo of the same stripes to enrol.
 *
 * The camera is Chromium's fake one, fed from a .y4m file through
 * --use-file-for-fake-video-capture as scripts/home-captures.mjs feeds it.
 * The file is written here, so the walks need no clip in the repository and
 * no ffmpeg.
 *
 * @module e2e/helpers/striped-subject
 */

import type { Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// =============================================================================
// The stripes
// =============================================================================

export const WIDTH = 640;
export const HEIGHT = 480;
/** Pixels from one bright stripe to the next. */
export const PERIOD = 40;
/** The clip drifts the stripes one whole period sideways and loops. */
const FRAMES = 8;

/**
 * Brightness of column x, as the luma a .y4m file stores (16 is black, 235 is
 * white). The stripes fade from dark to bright and back, so every pixel has a
 * neighbour of another brightness: there is an edge to read everywhere,
 * however the camera scales the picture.
 */
const luma = (x: number, shift = 0): number =>
  126 + 96 * Math.sin((2 * Math.PI * (x - shift)) / PERIOD);

/** The clip: grey stripes drifting sideways, in the YUV4MPEG2 format. */
export function stripedClip(): Buffer {
  const parts: Buffer[] = [
    Buffer.from(`YUV4MPEG2 W${WIDTH} H${HEIGHT} F30:1 Ip A1:1 C420jpeg\n`, 'ascii'),
  ];
  // No colour: both colour planes, a quarter of the picture each, at mid value.
  const colourPlanes = Buffer.alloc((WIDTH / 2) * (HEIGHT / 2) * 2, 128);

  for (let frame = 0; frame < FRAMES; frame++) {
    const shift = (frame * PERIOD) / FRAMES;
    const row = Buffer.from(Array.from({ length: WIDTH }, (_, x) => Math.round(luma(x, shift))));
    const lumaPlane = Buffer.alloc(WIDTH * HEIGHT);
    for (let y = 0; y < HEIGHT; y++) {
      row.copy(lumaPlane, y * WIDTH);
    }
    parts.push(Buffer.from('FRAME\n', 'ascii'), lumaPlane, colourPlanes);
  }

  return Buffer.concat(parts);
}

export const CAMERA_FILE = path.join(mkdtempSync(path.join(tmpdir(), 'lost-found-camera-')), 'stripes.y4m');
writeFileSync(CAMERA_FILE, stripedClip());


/** A still photo of the stripes, as a PNG, made in the page's canvas. */
export async function stripedPhoto(page: Page): Promise<Buffer> {
  const photo = await page.evaluate(
    ({ width, height, period }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2D canvas');
      for (let x = 0; x < width; x++) {
        // The grey a browser shows for this luma.
        const y = 126 + 96 * Math.sin((2 * Math.PI * x) / period);
        const grey = Math.round(((y - 16) * 255) / 219);
        ctx.fillStyle = `rgb(${grey}, ${grey}, ${grey})`;
        ctx.fillRect(x, 0, 1, height);
      }
      return canvas.toDataURL('image/png').split(',')[1];
    },
    { width: WIDTH, height: HEIGHT, period: PERIOD }
  );
  return Buffer.from(photo, 'base64');
}
