/**
 * Another pet chosen while the watch compares
 *
 * The camera shows grey stripes. Two pets are saved: Stripes, enrolled from a
 * photo of the same stripes, which the comparison matches, and Plain, enrolled
 * from a plain blue photo, which it does not. The watch compares with Stripes
 * until its matches show; then Plain is chosen in Choose a pet. The panel then
 * names Plain with none of Stripes' matches under it, and the camera stays on.
 *
 * @module e2e/watch-for-pet-change.spec
 */

import { test, expect, type Page } from '@playwright/test';

import monitorSettings from '../scripts/home-capture-settings.json';
import { enrolPet, watchStripes } from './helpers/own-sound';
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

test('another pet chosen while the watch compares starts with none of the first pet’s matches', async ({ page, context }) => {
  test.setTimeout(240_000);
  await setUpDevice(context, { use: 'pet', settings: monitorSettings });

  await page.goto('/lost-found/', { waitUntil: 'networkidle', timeout: 60_000 });
  await enrolPet(page, 'Plain', await plainPhoto(page));
  await expect(page.getByText('Add New Subject to Watch')).toBeVisible({ timeout: 60_000 });
  await watchStripes(page);

  // Stripes' matches show on the picture and in the panel.
  const recent = page.getByRole('heading', { name: 'Recent Matches', exact: true });
  await expect(recent).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Stripes', level: 3 })).toBeVisible();

  await page.getByRole('button', { name: 'Change pet', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose a pet' });
  await dialog.getByText('Plain', { exact: true }).click();
  await expect(dialog).toHaveCount(0);

  // The panel names Plain, with no match of Stripes' under it, at once and while Plain is compared.
  await expect(page.getByRole('heading', { name: 'Plain', level: 3 })).toBeVisible();
  await expect(recent).toHaveCount(0);
  await expect(page.getByText(/consecutive match/)).toHaveCount(0);
  await page.waitForTimeout(3_000);
  await expect(recent).toHaveCount(0);
  await expect(page.getByText(/consecutive match/)).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('watch-for-pet-changed-1280.png') });

  // The camera did not restart, and the comparison goes on with Plain.
  await expect(page.getByRole('button', { name: 'Stop watching', exact: true })).toBeVisible();
  await expect(page.getByText('Watching...', { exact: true })).toBeVisible();
});
