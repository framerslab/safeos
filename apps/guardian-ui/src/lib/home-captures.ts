/**
 * The home page's capture files
 *
 * The first screen shows a capture of the monitor that the Pictures workflow
 * makes (scripts/home-captures.mjs) and that is committed under public/home/
 * with its record, provenance.json. This module names the files and reads
 * each crop's size from that record, so the page's pictures carry the width
 * and height of the files it serves.
 *
 * @module lib/home-captures
 */

import fs from 'fs';
import path from 'path';

export type CaptureCropName = 'phone' | 'portrait' | 'landscape';
export type CaptureLook = 'dark' | 'light';

export const CAPTURE_CROP_NAMES: CaptureCropName[] = ['phone', 'landscape', 'portrait'];
export const CAPTURE_LOOKS: CaptureLook[] = ['dark', 'light'];

/** Every file the capture job saves, as a path under public/. */
export const CAPTURE_FILES: string[] = [
  ...CAPTURE_CROP_NAMES.flatMap((crop) =>
    CAPTURE_LOOKS.flatMap((look) => [`home/capture-${crop}-${look}.webp`, `home/capture-${crop}-${look}.png`])
  ),
  'home/card.jpg',
  'screenshots/dashboard.png',
  'screenshots/monitoring.png',
];

export interface ProvenanceFile {
  path: string;
  look: string;
  viewport: string;
  deviceScaleFactor: number;
  crop: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
}

export interface Provenance {
  run: string | null;
  commit: string | null;
  captured: string;
  playwright: string;
  clip: { path: string; sha256: string; bytes: number };
  files: ProvenanceFile[];
}

/** The record of the committed captures, or null before the first capture is committed. */
export function readProvenance(publicDir: string = path.join(process.cwd(), 'public')): Provenance | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(publicDir, 'home', 'provenance.json'), 'utf8')) as Provenance;
  } catch {
    return null;
  }
}

// The size of each crop at the capture job's viewports, for a build made
// before the first capture is committed; the box keeps the crop's ratio.
const EXPECTED_SIZES: Record<CaptureCropName, { width: number; height: number }> = {
  phone: { width: 1246, height: 700 },
  portrait: { width: 1271, height: 1481 },
  landscape: { width: 1824, height: 1140 },
};

/** Each crop's width and height in pixels, from the capture record when it exists. */
export function captureSizes(publicDir?: string): Record<CaptureCropName, { width: number; height: number }> {
  const provenance = readProvenance(publicDir);
  const sizes = { ...EXPECTED_SIZES };
  for (const crop of CAPTURE_CROP_NAMES) {
    const file = provenance?.files.find((entry) => entry.path === `home/capture-${crop}-dark.webp`);
    if (file) sizes[crop] = { width: file.width, height: file.height };
  }
  return sizes;
}
