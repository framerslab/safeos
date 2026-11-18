/**
 * A page that fails recovers instead of going blank
 *
 * Walks the blog in Chromium against the static export with the post's script
 * file blocked, as a deploy that replaced it leaves a tab from before it. The
 * post's link then fails to load its page. The app's error page reloads once
 * for the newest build; with the file still missing, the second failure shows
 * the message with a Reload key and a link home, and the page reloads no more.
 *
 * @module e2e/app-error-recovers.spec
 */

import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 900 } });

test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'One walk, in Chromium at desktop width'
);

// The post's own script file, as the static export names it.
const POST_SCRIPT = /\/_next\/static\/chunks\/app\/blog\/(\[|%5B)slug(\]|%5D)\/page-[^/]+\.js$/;

test('a missing script file reloads the page once, then says the page stopped working', async ({ page }) => {
  test.setTimeout(90_000);
  let blocked = 0;
  await page.route(POST_SCRIPT, (route) => {
    blocked += 1;
    return route.abort();
  });
  let loads = 0;
  page.on('load', () => { loads += 1; });

  await page.goto('/blog/', { waitUntil: 'networkidle', timeout: 60_000 });
  const before = loads;
  await page.getByRole('link', { name: /Read article/ }).first().click();

  await expect(page.getByRole('heading', { name: 'This page stopped working' })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
  // The file was asked for again after a reload, and the page settles: no reload loop.
  expect(blocked).toBeGreaterThanOrEqual(2);
  const settled = loads - before;
  expect(settled).toBeGreaterThanOrEqual(1);
  expect(settled).toBeLessThanOrEqual(2);
  await page.waitForTimeout(5_000);
  expect(loads - before).toBe(settled);
  await page.screenshot({ path: test.info().outputPath('app-error-1280.png') });
});
