/**
 * A lost pet in setup, walked in Chromium
 *
 * A first visit to /setup/ goes on from step 1 with Continue without the
 * camera. Step 2 asks what the device is watching with five answers, the last
 * A lost pet; chosen, it shows its two sentences and the last key reads Open
 * Lost and Found, which opens the Lost and Found page, where the pet's photos
 * are added.
 * Pictures of the question and of A lost pet chosen are kept for the pull
 * request (ci.yml uploads setup-*-1280.png).
 *
 * @module e2e/setup-lost-found.spec
 */

import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 1280, height: 1000 },
  launchOptions: {
    // The headless browser has no prompt to answer a camera request; the fake prompt grants it.
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
});

test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'The fake camera is a Chromium switch; the walk runs at desktop width'
);

test('setup offers A lost pet, and its last key opens the Lost and Found page', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/setup/');
  await page.getByRole('button', { name: 'Continue without the camera', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'What is it watching?' })).toBeVisible();

  const answers = page.getByRole('radio');
  await expect(answers).toHaveCount(5);
  await expect(answers.last()).toHaveAccessibleName('A lost pet');
  await page.screenshot({ path: test.info().outputPath('setup-question-1280.png'), fullPage: true });

  await page.getByRole('radio', { name: 'A lost pet', exact: true }).check();
  await expect(page.getByText('SafeOS watches for your pet’s colours near home and keeps a picture of each possible sighting.', { exact: false })).toBeVisible();
  await expect(page.getByText('Add your pet’s photos on the Lost and Found page, then press Start watching there.', { exact: false })).toBeVisible();
  const open = page.getByRole('button', { name: 'Open Lost and Found', exact: true });
  await expect(open).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('setup-lost-pet-1280.png'), fullPage: true });
  await open.click();

  await expect(page).toHaveURL(/\/lost-found\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Lost and Found' })).toBeVisible();
});
