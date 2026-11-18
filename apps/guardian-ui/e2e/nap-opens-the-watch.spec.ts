/**
 * Nap Mode opens the watch
 *
 * Walks /nap/ in Chromium with its fake camera: the warning with its planned
 * duration, the check of the camera, motion and sound, then Start Nap Mode.
 * The address becomes /monitor/, the saved settings hold the infant_sleep
 * preset, the watch starts with no second press, and the fake camera's moving
 * picture raises a pixel alert there, so Motion and sound does the watching.
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
  // The planned duration stays: the watch reminds when it has passed.
  await expect(page.getByRole('slider')).toHaveCount(1);
  // One step down from 30 minutes, by the keyboard as a person moves it.
  await page.getByRole('slider').press('ArrowLeft');
  await expect(page.getByText('Planned nap duration: 15 minutes')).toBeVisible();
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

  // The monitor reads the planned nap from the address once, then drops it.
  await expect(page).toHaveURL(/\/monitor\/?$/, { timeout: 30_000 });
  const preset = await page.evaluate(() => JSON.parse(localStorage.getItem('safeos-settings') || '{}')?.state?.activePresetId);
  expect(preset).toBe('infant_sleep');

  // The watch starts on arrival, with no second press.
  await expect(page.getByRole('button', { name: /^(Stop Monitoring|Cancel Starting)$/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Start Monitoring', exact: true })).toHaveCount(0);
  // Chromium's fake camera shows a moving picture, so the Nap preset's pixel check alerts.
  await expect(page.getByText(/Pixel movement detected/).first()).toBeVisible({ timeout: 45_000 });
  // The watch as it runs after Start Nap Mode, kept as the pull request's picture.
  await page.screenshot({ path: test.info().outputPath('nap-watch-1280.png') });
});
