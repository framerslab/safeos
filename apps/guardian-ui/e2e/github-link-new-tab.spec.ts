/**
 * The app header's GitHub link leaves a running watch running
 *
 * Starts a Motion and sound watch on /monitor/ with Chromium's fake camera,
 * then presses the GitHub mark in the app's header, and then the footer's
 * link to GitHub. Each opens GitHub in a new tab; the watch's page stays on
 * /monitor/, still watching, with its camera live. The new tabs are answered
 * here, so the walk reaches no other host.
 *
 * @module e2e/github-link-new-tab.spec
 */

import { test, expect } from '@playwright/test';
import { setUpDevice } from './helpers/seeded-device';

test.use({
  viewport: { width: 1280, height: 900 },
  launchOptions: {
    // The headless browser has no prompt to answer a camera request; the fake prompt grants it.
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
});

test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'The fake camera is a Chromium switch; the walk runs at desktop width'
);

test('pressing GitHub in the app header opens a new tab and the watch on Monitor goes on', async ({ page, context }) => {
  await setUpDevice(context, { use: 'pet' });
  await context.route('https://github.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>GitHub</title>' })
  );

  await page.goto('/monitor/', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('button', { name: 'Start watching', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop watching', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => Boolean(document.querySelector('video')?.srcObject)), { timeout: 30_000 }).toBe(true);

  const opened = context.waitForEvent('page', { timeout: 15_000 }).catch(() => null);
  await page.locator('header.app-header').getByRole('link', { name: /^SafeOS on GitHub/ }).click();

  // The watch's page did not leave, and it is still watching with its camera live.
  await expect(page).toHaveURL(/\/monitor\/(\?.*)?$/);
  await expect(page.getByRole('button', { name: 'Stop watching', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => {
      const stream = document.querySelector('video')?.srcObject as MediaStream | null | undefined;
      return stream?.getVideoTracks().map((track) => track.readyState) ?? [];
    })
  ).toEqual(['live']);

  // GitHub is in a tab of its own.
  const tab = await opened;
  expect(tab, 'a new tab opened').not.toBeNull();
  await tab!.waitForLoadState();
  expect(tab!.url()).toBe('https://github.com/framerslab/safeos');

  // The footer's link to GitHub, on the same page, opens a tab of its own too.
  const another = context.waitForEvent('page', { timeout: 15_000 }).catch(() => null);
  await page.locator('footer.site-footer').getByRole('link', { name: /^SafeOS on GitHub/ }).click();
  await expect(page).toHaveURL(/\/monitor\/(\?.*)?$/);
  await expect(page.getByRole('button', { name: 'Stop watching', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => {
      const stream = document.querySelector('video')?.srcObject as MediaStream | null | undefined;
      return stream?.getVideoTracks().map((track) => track.readyState) ?? [];
    })
  ).toEqual(['live']);
  const footerTab = await another;
  expect(footerTab, 'a new tab opened from the footer').not.toBeNull();
  await footerTab!.waitForLoadState();
  expect(footerTab!.url()).toBe('https://github.com/framerslab/safeos');
});
