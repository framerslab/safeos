/**
 * Set times apply
 *
 * A set time on Quiet hours puts the Night setting on at 22:00 every day. The
 * browser's clock starts at 21:59 with the watch open on its own setting, then
 * runs past 22:00: the watch's setting becomes Night.
 *
 * @module e2e/set-times-apply.spec
 */

import { test, expect, type Page } from '@playwright/test';
import { setUpDevice } from './helpers/seeded-device';

test.use({ viewport: { width: 1280, height: 1000 }, timezoneId: 'UTC' });

test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'The walk runs in Chromium at desktop width'
);

const EVERY_DAY = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** The setting the watch runs at, as saved; a device that saved none runs at Maximum Alert. */
const savedSetting = (page: Page): Promise<string> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('safeos-settings') || '{}')?.state?.activePresetId ?? 'maximum');

test('a set time of Night at 22:00 makes the watch run at Night at 22:00', async ({ page, context }) => {
  test.setTimeout(90_000);
  await page.clock.install({ time: new Date('2026-11-18T21:59:00Z') });
  await setUpDevice(context, {
    use: 'baby',
    schedules: {
      schedulingEnabled: true,
      schedules: [{
        id: 'sched_night', name: 'Night', enabled: true, preset: 'night', days: EVERY_DAY,
        timeSlot: { start: '22:00', end: '06:00' }, priority: 10,
        createdAt: '2026-11-18T12:00:00.000Z', updatedAt: '2026-11-18T12:00:00.000Z',
      }],
    },
  });

  await page.goto('/monitor/', { waitUntil: 'networkidle', timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Start Monitoring', exact: true })).toBeVisible({ timeout: 30_000 });
  expect(await savedSetting(page)).toBe('maximum');

  // 22:00 and a little past: the check runs once a minute.
  await page.clock.fastForward('01:30');
  await expect.poll(() => savedSetting(page), { timeout: 15_000 }).toBe('night');
  await expect(page.getByText('Night Mode', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('set-time-night-1280.png') });
});
