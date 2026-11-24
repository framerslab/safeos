/**
 * Lost and Found: a saved frame or sighting carries an edge score
 *
 * Enrols a pet from a striped picture, shows the camera the same stripes
 * and reads the comparison details the watch kept on this device.
 *
 * The camera is Chromium's fake one, fed from a .y4m file through
 * --use-file-for-fake-video-capture as scripts/home-captures.mjs feeds it.
 * The clip is written by e2e/helpers/striped-subject.ts, so the test needs no
 * clip in the repository and no ffmpeg.
 *
 * @module e2e/lost-found-edge.spec
 */

import { test, expect, type Page } from '@playwright/test';

import monitorSettings from '../scripts/home-capture-settings.json';
import { petOverTheLine } from './helpers/own-sound';
import { CAMERA_FILE, stripedPhoto } from './helpers/striped-subject';

// =============================================================================
// The saved comparisons
// =============================================================================

interface SavedScores {
  colorMatch: number;
  dominantMatch: number;
  edgeMatch: number;
  sizeMatch: number;
}

interface SavedComparison {
  kind?: string;
  subjectId: string;
  details?: SavedScores;
}

/** Reads both versions of a comparison the watch can keep for this pet. */
const savedScores = (page: Page, name: string): Promise<SavedScores[]> =>
  page.evaluate(async (petName) => {
    if (!(await indexedDB.databases()).some((database) => database.name === 'safeos-guardian')) return [];
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('safeos-guardian');
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      const read = <T,>(store: string) => new Promise<T[]>((resolve, reject) => {
        if (!database.objectStoreNames.contains(store)) {
          resolve([]);
          return;
        }
        const reading = database.transaction(store).objectStore(store).getAll();
        reading.onsuccess = () => resolve(reading.result as T[]);
        reading.onerror = () => reject(reading.error);
      });
      const [pets, frames, alerts] = await Promise.all([
        read<{ id: string; name: string }>('subject_profile'),
        read<SavedComparison>('match_frame'),
        read<SavedComparison>('alert_cache'),
      ]);
      const ids = new Set(pets.filter((pet) => pet.name === petName).map((pet) => pet.id));
      const sightings = alerts.filter((alert) => alert.kind === 'sighting');
      return [...frames, ...sightings].flatMap(({ subjectId, details }) =>
        ids.has(subjectId) && details ? [details] : []
      );
    } finally {
      database.close();
    }
  }, name);

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

test('a frame or sighting saved from a striped camera picture keeps an edge score above 0', async ({ page, context }) => {
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

  const photo = await stripedPhoto(page);

  await page.getByPlaceholder('e.g., Max, Luna, Dad').fill('Stripes');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'stripes.png',
    mimeType: 'image/png',
    buffer: photo,
  });
  const next = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(next).toBeEnabled();
  await next.click();
  await page.getByRole('button', { name: 'Start Watching', exact: true }).click();

  // The watch is held in memory, so the monitor is reached by the page's own
  // key, without a reload.
  await page.getByRole('button', { name: 'Start Monitoring' }).click({ timeout: 60_000 });
  await page.waitForURL(/\/monitor\/(\?.*)?$/, { timeout: 60_000 });

  // Start the camera and wait for the comparison to reach the alert line.
  await page.getByRole('button', { name: 'Start watching', exact: true }).click({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Stop watching', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(petOverTheLine(page)).toBeVisible({ timeout: 60_000 });

  await expect.poll(async () => {
    const scores = (await savedScores(page, 'Stripes')).find((comparison) => comparison.edgeMatch > 0);
    if (!scores) return 0;

    console.log(
      `Saved comparison scores: colour ${scores.colorMatch}, main colours ${scores.dominantMatch}, ` +
      `edges ${scores.edgeMatch}, size ${scores.sizeMatch}`
    );
    return scores.edgeMatch;
  }, { timeout: 60_000 }).toBeGreaterThan(0);
});
