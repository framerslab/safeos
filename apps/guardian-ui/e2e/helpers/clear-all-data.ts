/**
 * Clear all data, pressed on Settings, Data on this device: the key, then the
 * question asked in place and its "Clear all data". No browser confirm box
 * opens.
 *
 * @module e2e/helpers/clear-all-data
 */

import type { Page } from '@playwright/test';

export async function clearAllDataOnThisDevice(page: Page): Promise<void> {
  await page.goto('/settings/data/', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('button', { name: 'Clear all data on this device', exact: true }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Clear all data', exact: true }).click();
}
