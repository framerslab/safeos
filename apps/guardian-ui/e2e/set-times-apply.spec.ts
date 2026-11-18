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

const NIGHT_EVERY_DAY = {
  schedulingEnabled: true,
  schedules: [{
    id: 'sched_night', name: 'Night', enabled: true, preset: 'night', days: EVERY_DAY,
    timeSlot: { start: '22:00', end: '06:00' }, priority: 10,
    createdAt: '2026-11-18T12:00:00.000Z', updatedAt: '2026-11-18T12:00:00.000Z',
  }],
};

/** A value of the saved setting the watch runs at. */
const savedValue = (page: Page, key: string): Promise<unknown> =>
  page.evaluate((k) => JSON.parse(localStorage.getItem('safeos-settings') || '{}')?.state?.globalSettings?.[k], key);

test('a set time made with the form as it opens puts on a whole setting', async ({ page, context }) => {
  test.setTimeout(90_000);
  // A Wednesday at noon: inside the form's first hours, 09:00 to 17:00 on weekdays.
  await page.clock.install({ time: new Date('2026-11-18T12:00:00Z') });
  await setUpDevice(context, { use: 'baby' });

  await page.goto('/settings/schedule/', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('button', { name: 'Create Schedule', exact: true }).click();
  await page.getByPlaceholder('e.g., Night Watch').fill('Work');
  await page.getByRole('button', { name: 'Save Schedule', exact: true }).click();
  await page.clock.fastForward('01:10');

  await page.goto('/monitor/', { waitUntil: 'networkidle', timeout: 60_000 });
  await expect.poll(() => savedValue(page, 'motionSensitivity'), { timeout: 15_000 }).toBe(80);
  await expect(page.getByText(/^Motion: 80% \| Audio: 80%/)).toBeVisible();
});

test("a set time in force when the app opens is put on after the person's saved preferences are read", async ({ page, context }) => {
  test.setTimeout(90_000);
  await page.clock.install({ time: new Date('2026-11-18T23:00:00Z') });
  await setUpDevice(context, { use: 'baby', schedules: NIGHT_EVERY_DAY });
  // Preferences an earlier version saved on this browser, read once when the app opens.
  await context.addInitScript(() => {
    if (!localStorage.getItem('safeos-settings')) {
      localStorage.setItem('safeos_user_settings', JSON.stringify({
        preferences: { motionSensitivity: 0.3, audioSensitivity: 0.3, alertVolume: 0.5 },
      }));
    }
  });

  await page.goto('/monitor/', { waitUntil: 'networkidle', timeout: 60_000 });
  await expect.poll(() => savedSetting(page), { timeout: 15_000 }).toBe('night');
  // Night's own values: motion 40.
  await expect.poll(() => savedValue(page, 'motionSensitivity'), { timeout: 15_000 }).toBe(40);
});

test('editing the setting of a set time in force puts the new setting on', async ({ page, context }) => {
  test.setTimeout(90_000);
  await page.clock.install({ time: new Date('2026-11-18T23:00:00Z') });
  await setUpDevice(context, { use: 'baby', schedules: NIGHT_EVERY_DAY });

  await page.goto('/settings/schedule/', { waitUntil: 'networkidle', timeout: 60_000 });
  await expect.poll(() => savedSetting(page), { timeout: 15_000 }).toBe('night');
  await page.getByRole('button', { name: 'Edit schedule' }).click();
  await page.locator('select').last().selectOption('silent');
  await page.getByRole('button', { name: 'Save Schedule', exact: true }).click();
  await page.clock.fastForward('01:10');
  await expect.poll(() => savedSetting(page), { timeout: 15_000 }).toBe('silent');
});

test("the person's own setting during a set time stays after a reload", async ({ page, context }) => {
  test.setTimeout(90_000);
  await page.clock.install({ time: new Date('2026-11-18T23:00:00Z') });
  await setUpDevice(context, { use: 'baby', schedules: NIGHT_EVERY_DAY });

  await page.goto('/monitor/', { waitUntil: 'networkidle', timeout: 60_000 });
  await expect.poll(() => savedSetting(page), { timeout: 15_000 }).toBe('night');
  await page.getByRole('button', { name: 'Select Security Mode' }).click();
  await page.getByRole('button', { name: /^Maximum Alert/ }).click();
  await expect.poll(() => savedSetting(page)).toBe('maximum');

  await page.reload({ waitUntil: 'networkidle' });
  await page.clock.fastForward('01:10');
  await expect(page.getByRole('button', { name: 'Start Monitoring', exact: true })).toBeVisible({ timeout: 30_000 });
  expect(await savedSetting(page)).toBe('maximum');
});
