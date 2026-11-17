/**
 * Nap Mode opens the watch
 *
 * Walks /nap/ in Chromium with its fake camera: the warning, the check of the
 * camera, motion and sound, then Start Nap Mode. The address becomes
 * /monitor/ and the saved settings hold the infant_sleep preset, so Motion and
 * sound does the watching.
 *
 * @module e2e/nap-opens-the-watch.spec
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

test('Start Nap Mode opens Motion and sound with the infant_sleep preset', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.grantPermissions(['camera', 'microphone']);
  await context.addInitScript(() => {
    localStorage.setItem('safeos-onboarding', JSON.stringify({ state: {
      isComplete: true, selectedScenario: 'baby',
      acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
    }, version: 0 }));
    localStorage.setItem('guardian-onboarding-complete', 'true');
    localStorage.setItem('safeos-notification-prompt-dismissed', String(Date.now()));
    localStorage.setItem('safeos-pwa-prompt-dismissed', String(Date.now()));
  });

  await page.goto('/nap/', { waitUntil: 'networkidle', timeout: 60_000 });
  await expect(page.getByRole('slider')).toHaveCount(0);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Continue to Pre-Nap Test', exact: true }).click();

  // The camera check; the motion check starts by itself and passes on a changed frame or after 300 frames.
  await page.getByRole('button', { name: 'Start', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toHaveCount(1, { timeout: 30_000 });
  // The sound check.
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const start = page.getByRole('button', { name: 'Start Nap Mode', exact: true });
  await expect(start).toBeEnabled({ timeout: 15_000 });
  await start.click();

  await expect(page).toHaveURL(/\/monitor\/?$/, { timeout: 30_000 });
  const preset = await page.evaluate(() => JSON.parse(localStorage.getItem('safeos-settings') || '{}')?.state?.activePresetId);
  expect(preset).toBe('infant_sleep');
});
