/**
 * Lost & Found in setup, walked in Chromium
 *
 * A first visit to /setup/ goes through the steps, chooses Lost & Found at
 * the question of what is being watched, and the last key, "Open Lost and
 * Found", opens the Lost & Found page, where the pet's photos are added.
 * Pictures of the question and of the last step are kept for the pull
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

test('setup offers Lost & Found, and its last key opens the Lost & Found page', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/setup/');
  await page.getByRole('button', { name: /Begin Setup/ }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /Accept & Continue/ }).click();

  const lostFound = page.getByRole('button', { name: /Lost & Found/ });
  await expect(lostFound).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('setup-question-1280.png'), fullPage: true });
  await lostFound.click();

  await page.getByRole('button', { name: 'Continue without the camera' }).click();
  await page.getByRole('checkbox').uncheck();
  await page.getByRole('button', { name: /Skip & Continue/ }).click();

  const open = page.getByRole('button', { name: 'Open Lost and Found' });
  await expect(open).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('setup-last-step-1280.png'), fullPage: true });
  await open.click();

  await expect(page).toHaveURL(/\/lost-found\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Lost & Found' })).toBeVisible();
});
