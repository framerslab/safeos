/**
 * Detection's use rows show the values the watch runs at
 *
 * On a fresh device, with nothing saved for any use, Detection's Baby row
 * reads the setting's motion and sound (80 and 80 on the default setting,
 * Maximum Alert), and a watch for a baby runs at the same values.
 *
 * @module e2e/detection-use-values.spec
 */

import { test, expect } from '@playwright/test';
import { setUpDevice } from './helpers/seeded-device';

test.use({ viewport: { width: 1280, height: 1000 } });

test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'The walk runs in Chromium at desktop width'
);

test("a use with nothing saved shows the setting's values, and its watch runs at them", async ({ page, context }) => {
  test.setTimeout(90_000);
  await setUpDevice(context, { use: 'baby' });

  await page.goto('/settings/detection/', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('button', { name: /Baby Monitoring/ }).click();
  await expect(page.getByRole('slider', { name: 'Baby Monitoring motion sensitivity' })).toHaveValue('80');
  await expect(page.getByRole('slider', { name: 'Baby Monitoring audio sensitivity' })).toHaveValue('80');
  await page.screenshot({ path: test.info().outputPath('detection-baby-row-1280.png') });

  await page.goto('/monitor/', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('button', { name: 'Show settings', exact: true }).click({ timeout: 30_000 });
  await expect(page.getByText(/^Motion: 80% \| Audio: 80%/)).toBeVisible({ timeout: 30_000 });
});
