/**
 * Lost & Found: a saved match carries an edge score
 *
 * Enrols a subject from a striped picture, shows the camera the same stripes
 * and reads the Edge value of the match the monitor saves, in the gallery.
 *
 * The camera is Chromium's fake one, fed from a .y4m file through
 * --use-file-for-fake-video-capture as scripts/home-captures.mjs feeds it.
 * The file is written here, so the test needs no clip in the repository and
 * no ffmpeg.
 *
 * @module e2e/lost-found-edge.spec
 */

import { test, expect } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import monitorSettings from '../scripts/home-capture-settings.json';

// =============================================================================
// The stripes
// =============================================================================

const WIDTH = 640;
const HEIGHT = 480;
/** Pixels from one bright stripe to the next. */
const PERIOD = 40;
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
function stripedClip(): Buffer {
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

const CAMERA_FILE = path.join(mkdtempSync(path.join(tmpdir(), 'lost-found-camera-')), 'stripes.y4m');
writeFileSync(CAMERA_FILE, stripedClip());

// =============================================================================
// The test
// =============================================================================

test.use({
  viewport: { width: 1280, height: 1000 },
  launchOptions: {
    args: [
      // The headless browser has no prompt to answer a camera request; the
      // fake prompt grants it.
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${CAMERA_FILE}`,
    ],
  },
});

test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'The fake camera file is a Chromium switch; the test runs at desktop width'
);

test('a match saved from a striped camera picture shows an Edge value above 0', async ({ page, context }) => {
  test.setTimeout(240_000);

  await context.grantPermissions(['camera', 'microphone']);
  // A person who has finished setup, with the two cards that appear unasked
  // already put away, as scripts/home-captures.mjs seeds one.
  await context.addInitScript((settings) => {
    localStorage.setItem('safeos-onboarding', JSON.stringify({ state: {
      isComplete: true, selectedScenario: 'pet',
      acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
    }, version: 0 }));
    localStorage.setItem('guardian-onboarding-complete', 'true');
    localStorage.setItem('safeos-settings', JSON.stringify({ state: settings, version: 0 }));
    localStorage.setItem('safeos-notification-prompt-dismissed', String(Date.now()));
    localStorage.setItem('safeos-pwa-prompt-dismissed', String(Date.now()));
  }, monitorSettings);

  // Enrol a subject from one reference photo: the clip's stripes, standing still.
  await page.goto('/lost-found/', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByText('Add New Subject to Watch').click();
  await expect(page.getByText('What are you looking for?')).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

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

  await page.getByPlaceholder('e.g., Max, Luna, Dad').fill('Stripes');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'stripes.png',
    mimeType: 'image/png',
    buffer: Buffer.from(photo, 'base64'),
  });
  const next = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(next).toBeEnabled();
  await next.click();
  await page.getByRole('button', { name: 'Start Watching', exact: true }).click();

  // The watch is held in memory, so the monitor is reached by the page's own
  // key, without a reload.
  await page.getByRole('button', { name: 'Start Monitoring' }).click({ timeout: 60_000 });
  await page.waitForURL(/\/monitor\/?$/, { timeout: 60_000 });

  // Start the camera and wait for the watch to report a match.
  await page.getByRole('button', { name: 'Start Monitoring', exact: true }).click({ timeout: 60_000 });
  await expect(page.getByText('LIVE', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/consecutive match/).first()).toBeVisible({ timeout: 60_000 });

  // The match is written to the browser's database a moment after it is
  // reported; the gallery reads the database when it opens.
  const openMatch = page.getByRole('button', { name: 'View match details' }).first();
  await expect(async () => {
    await page.goto('/lost-found/gallery/', { waitUntil: 'networkidle', timeout: 30_000 });
    await expect(openMatch).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  await openMatch.click();

  // The four scores sit in a row, each a value over its label.
  const edge = page.getByText('Edge', { exact: true }).locator('xpath=..').locator('p').first();
  await expect(edge).toHaveText(/^\d+(\.\d+)?%$/);
  const shown = (await edge.textContent()) ?? '';
  expect(Number.parseFloat(shown)).toBeGreaterThan(0);
});
