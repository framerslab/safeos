/**
 * Lost & Found: a saved match carries an edge score
 *
 * Enrols a subject from a striped picture, shows the camera the same stripes
 * and reads the Edge value of the match the monitor saves, in the gallery.
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
import { CAMERA_FILE, stripedPhoto } from './helpers/striped-subject';

// =============================================================================
// The saved matches
// =============================================================================

/**
 * How many matches the browser's database holds. The monitor reports a match
 * on any frame that scores, and saves one only when the score reaches the
 * record line, a moment later (it makes a thumbnail first). Leaving the
 * monitor before that would leave the gallery empty.
 */
const savedMatches = (page: Page): Promise<number> =>
  page.evaluate(async () => {
    const known = await indexedDB.databases();
    if (!known.some((database) => database.name === 'safeos-guardian')) {
      return 0;
    }
    return new Promise<number>((resolve) => {
      const opening = indexedDB.open('safeos-guardian');
      opening.onerror = () => resolve(0);
      opening.onsuccess = () => {
        const database = opening.result;
        if (!database.objectStoreNames.contains('match_frame')) {
          database.close();
          resolve(0);
          return;
        }
        const counting = database.transaction('match_frame').objectStore('match_frame').count();
        counting.onsuccess = () => {
          database.close();
          resolve(counting.result);
        };
        counting.onerror = () => {
          database.close();
          resolve(0);
        };
      };
    });
  });

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
  await page.waitForURL(/\/monitor\/?$/, { timeout: 60_000 });

  // Start the camera and wait for the watch to report a match.
  await page.getByRole('button', { name: 'Start watching', exact: true }).click({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Stop watching', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/consecutive match/).first()).toBeVisible({ timeout: 60_000 });

  // Stay on the monitor until a match is in the browser's database; the
  // gallery reads the database when it opens.
  await expect.poll(() => savedMatches(page), { timeout: 60_000 }).toBeGreaterThan(0);

  const openMatch = page.getByRole('button', { name: 'View match details' }).first();
  await expect(async () => {
    await page.goto('/lost-found/gallery/', { waitUntil: 'networkidle', timeout: 30_000 });
    await expect(openMatch).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  await openMatch.click();

  // The four scores sit in a row, each a value over its label.
  const score = (label: string) =>
    page.getByText(label, { exact: true }).locator('xpath=..').locator('p').first();
  const edge = score('Edge');
  await expect(edge).toHaveText(/^\d+(\.\d+)?%$/);

  // The run's log keeps what the gallery showed.
  const shownScores: string[] = [];
  for (const label of ['Confidence', 'Color', 'Dominant', 'Edge', 'Size']) {
    const value = score(label);
    shownScores.push(`${label} ${(await value.count()) === 1 ? await value.textContent() : 'not read'}`);
  }
  console.log(`The saved match shows: ${shownScores.join(', ')}`);

  const shown = (await edge.textContent()) ?? '';
  expect(Number.parseFloat(shown)).toBeGreaterThan(0);
});
