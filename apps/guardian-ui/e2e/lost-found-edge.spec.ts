/**
 * Lost & Found: a sighting carries an edge score
 *
 * Enrols a subject from a striped picture, shows the camera the same stripes
 * and reads the edge score the watch keeps with the sighting's alert.
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
// The saved sighting
// =============================================================================

interface Scores { colorMatch: number; dominantMatch: number; edgeMatch: number; sizeMatch: number }

/**
 * The four scores the watch keeps with a sighting's alert, read from the
 * browser's database; null while no sighting is saved. They are kept as
 * data: the alert's card shows none of them.
 */
const sightingScores = (page: Page): Promise<Scores | null> =>
  page.evaluate(async () => {
    const known = await indexedDB.databases();
    if (!known.some((database) => database.name === 'safeos-guardian')) {
      return null;
    }
    return new Promise<Scores | null>((resolve) => {
      const opening = indexedDB.open('safeos-guardian');
      opening.onerror = () => resolve(null);
      opening.onsuccess = () => {
        const database = opening.result;
        if (!database.objectStoreNames.contains('alert_cache')) {
          database.close();
          resolve(null);
          return;
        }
        const reading = database.transaction('alert_cache').objectStore('alert_cache').getAll();
        reading.onsuccess = () => {
          database.close();
          const sighting = reading.result.find((alert) => alert.kind === 'sighting' && alert.details);
          resolve(sighting ? sighting.details : null);
        };
        reading.onerror = () => {
          database.close();
          resolve(null);
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

test('a sighting raised from a striped camera picture keeps an edge score above 0', async ({ page, context }) => {
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
    // The device has answered the notice about alert pictures, so a watch starts at its key.
    localStorage.setItem('safeos-alert-pictures', JSON.stringify({ state: {
      keep: true, deleteAfterDays: 3, noticeAnswered: true, inNotifications: false,
    }, version: 0 }));
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

  // Start the camera and wait for the watch to raise the sighting.
  await page.getByRole('button', { name: 'Start watching', exact: true }).click({ timeout: 60_000 });
  await expect(page.locator('.watch-frame[data-phase="live"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-alert-card]').filter({ hasText: 'Could this be Stripes?' }).first()).toBeVisible({ timeout: 90_000 });

  // The sighting's alert is saved with its four scores.
  await expect.poll(() => sightingScores(page), { timeout: 60_000 }).not.toBeNull();
  const scores = (await sightingScores(page))!;

  // The run's log keeps what the watch saved.
  console.log(`The saved sighting keeps: Color ${scores.colorMatch}, Dominant ${scores.dominantMatch}, Edge ${scores.edgeMatch}, Size ${scores.sizeMatch}`);

  expect(scores.edgeMatch).toBeGreaterThan(0);
});
