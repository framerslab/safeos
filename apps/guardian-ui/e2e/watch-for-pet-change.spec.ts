/**
 * Another pet chosen while the watch compares
 *
 * The camera shows grey stripes. Two pets are saved: Stripes, enrolled from a
 * photo of the same stripes, which the comparison matches, and Plain, enrolled
 * from a plain blue photo, which it does not. The watch compares with Stripes
 * until a sighting is saved. Choosing Plain updates the pet's meter while
 * the camera runs, and the striped scene raises no sighting for Plain.
 *
 * @module e2e/watch-for-pet-change.spec
 */

import { test, expect, type Page } from '@playwright/test';

import monitorSettings from '../scripts/home-capture-settings.json';
import { enrolPet, sightingAlerts, watchStripes } from './helpers/own-sound';
import { setUpDevice } from './helpers/seeded-device';
import { CAMERA_FILE } from './helpers/striped-subject';

test.use({
  viewport: { width: 1280, height: 1000 },
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${CAMERA_FILE}`,
    ],
  },
});

test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'The fake camera file is a Chromium switch; the walk runs at desktop width'
);

/** A plain blue photo, which the camera's grey stripes do not match. */
async function plainPhoto(page: Page): Promise<Buffer> {
  const photo = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2D canvas');
    ctx.fillStyle = 'rgb(0, 0, 255)';
    ctx.fillRect(0, 0, 320, 240);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return Buffer.from(photo, 'base64');
}

test('another pet chosen while the watch compares updates the meter and keeps sightings with their own pet', async ({ page, context }) => {
  test.setTimeout(240_000);
  await setUpDevice(context, { use: 'pet', settings: monitorSettings });

  await page.goto('/lost-found/', { waitUntil: 'networkidle', timeout: 60_000 });
  await enrolPet(page, 'Plain', await plainPhoto(page));
  await expect(page.getByText('Add New Subject to Watch')).toBeVisible({ timeout: 60_000 });
  await watchStripes(page);

  // The saved sighting and the meter name Stripes.
  const petMeter = page.locator('.watch-meter--pet');
  await expect(petMeter.getByText('Comparing with Stripes’s photos', { exact: true })).toBeVisible({ timeout: 30_000 });
  expect(await sightingAlerts(page, 'Stripes')).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Change pet', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose a pet' });
  await dialog.getByText('Plain', { exact: true }).click();
  await expect(dialog).toHaveCount(0);

  // The meter names Plain at once, and the striped scene raises no sighting for Plain.
  await expect(petMeter.getByText('Comparing with Plain’s photos', { exact: true })).toBeVisible();
  await page.waitForTimeout(3_000);
  expect(await sightingAlerts(page, 'Plain')).toBe(0);
  await page.screenshot({ path: test.info().outputPath('watch-for-pet-changed-1280.png') });

  // The camera did not restart, and the comparison goes on with Plain.
  await expect(page.getByRole('button', { name: 'Stop watching', exact: true })).toBeVisible();
  await expect(petMeter.getByText('Comparing with Plain’s photos', { exact: true })).toBeVisible();
});
