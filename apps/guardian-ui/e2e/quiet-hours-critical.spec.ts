/**
 * Quiet hours in Emergency Only: a critical alert sounds
 *
 * The browser's clock reads 23:00, inside quiet hours from 22:00 to 07:00 in
 * Emergency Only. An alert made on Test Alerts, then the watch's page opened
 * through the app's own links, so the alert is one this tab raised: the
 * watch's alert panel plays its sound (an alert read back from the device's
 * saved list stays silent). The page records the volume each sound is given
 * (the gain between the sound and the speakers): a high alert plays nothing,
 * and a critical alert plays at the alert volume, 60.
 *
 * @module e2e/quiet-hours-critical.spec
 */

import { test, expect, type Page } from '@playwright/test';
import { OWN_SETTING, setUpDevice } from './helpers/seeded-device';

declare global {
  interface Window {
    __soundVolumes?: number[];
  }
}

test.use({
  viewport: { width: 1280, height: 1000 },
  timezoneId: 'UTC',
  launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
});

test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'The walk runs in Chromium at desktop width'
);

/** How many alerts the browser's database holds. */
const savedAlerts = (page: Page): Promise<number> =>
  page.evaluate(() => new Promise<number>((resolve) => {
    const opening = indexedDB.open('safeos-guardian');
    opening.onerror = () => resolve(-1);
    opening.onsuccess = () => {
      const database = opening.result;
      if (!database.objectStoreNames.contains('alert_cache')) {
        database.close();
        resolve(0);
        return;
      }
      const counting = database.transaction('alert_cache').objectStore('alert_cache').count();
      counting.onsuccess = () => { database.close(); resolve(counting.result); };
      counting.onerror = () => { database.close(); resolve(-1); };
    };
  }));

/**
 * Makes one alert of `level` on Test Alerts, alone, and opens the watch's page
 * from there through the header's Dashboard and the dashboard's link to it,
 * with no new page load between.
 */
async function alertThenWatch(page: Page, level: 'high' | 'critical') {
  await page.goto('/settings/test-alerts/', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('button', { name: 'Clear All', exact: true }).click();
  await expect.poll(() => savedAlerts(page), { timeout: 15_000 }).toBe(0);
  await page.getByRole('button', { name: level, exact: true }).click();
  await expect(page.getByText('Active alerts: 1')).toBeVisible();
  await expect.poll(() => savedAlerts(page), { timeout: 15_000 }).toBe(1);

  await page.getByRole('navigation', { name: 'App' }).getByRole('link', { name: 'Dashboard', exact: true }).click();
  await page.waitForURL(/\/dashboard\/?$/, { timeout: 30_000 });
  // Only the sounds played on the watch's page are counted.
  await page.evaluate(() => {
    window.__soundVolumes?.splice(0);
  });
  await page.locator('#main-content a[href^="/monitor"]:visible').first().click();
  await page.waitForURL(/\/monitor\/?$/, { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Acknowledge' })).toHaveCount(1, { timeout: 30_000 });
  // The panel plays an alert's first sound on its next tick, within half a second.
  await page.waitForTimeout(2_000);
  return page.evaluate(() => window.__soundVolumes ?? []);
}

test('in Emergency Only quiet hours a critical alert plays at the alert volume and a high alert plays nothing', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.clock.install({ time: new Date('2026-11-18T23:00:00Z') });
  await setUpDevice(context, {
    use: 'baby',
    settings: {
      activePresetId: 'custom',
      globalSettings: { ...OWN_SETTING, alertVolume: 60 },
      quietHoursSettings: {
        enabled: true, startTime: '22:00', endTime: '07:00', days: [0, 1, 2, 3, 4, 5, 6],
        mode: 'emergency_only', reducedVolume: 30,
      },
    },
  });
  // Each sound plays through one gain node wired to the speakers; its value is
  // the sound's volume, 0 to 1.
  await context.addInitScript(() => {
    const volumes: number[] = [];
    window.__soundVolumes = volumes;
    const toSpeakers = new WeakSet<AudioParam>();
    const connect = AudioNode.prototype.connect as (this: AudioNode, ...args: unknown[]) => unknown;
    (AudioNode.prototype as unknown as { connect: unknown }).connect = function (this: AudioNode, ...args: unknown[]) {
      if (this instanceof GainNode && args[0] instanceof AudioDestinationNode) toSpeakers.add(this.gain);
      return connect.apply(this, args);
    };
    const value = Object.getOwnPropertyDescriptor(AudioParam.prototype, 'value')!;
    Object.defineProperty(AudioParam.prototype, 'value', {
      ...value,
      set(this: AudioParam, v: number) {
        if (toSpeakers.has(this)) volumes.push(v);
        value.set!.call(this, v);
      },
    });
  });

  const high = await alertThenWatch(page, 'high');
  expect(high.filter((v) => v > 0)).toEqual([]);

  const critical = await alertThenWatch(page, 'critical');
  console.log(`A critical alert in Emergency Only quiet hours played at: ${JSON.stringify(critical)}`);
  expect(critical).toContain(0.6);
  await page.screenshot({ path: test.info().outputPath('quiet-hours-critical-1280.png') });
});
