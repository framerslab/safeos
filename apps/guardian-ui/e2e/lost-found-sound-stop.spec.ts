/**
 * Lost & Found's saved sounds after Stop, and at the instant quiet hours begin
 *
 * A sound of the person's own is saved for Lost Item Found, and the striped
 * pet's comparison matches the camera's stripes, so each matching frame
 * alerts and plays it. The walks count the passes the saved sound's audio
 * element starts:
 *
 * - a start whose read of the saved sounds is still on its way when the
 *   watch stops does not sound after Stop;
 * - a sound that repeats after a pause does not start its next pass after Stop;
 * - a loop that a motion or sound alert plays too keeps playing when the
 *   Lost & Found watch ends and monitoring goes on;
 * - Silent quiet hours that begin while the watch runs keep the next match
 *   from playing the sound at once, without waiting for the app's periodic
 *   volume check.
 *
 * @module e2e/lost-found-sound-stop.spec
 */

import { test, expect } from '@playwright/test';

import monitorSettings from '../scripts/home-capture-settings.json';
import {
  countOwnSoundPasses, holdSavedSounds, ownSoundCounts, releaseSavedSounds, saveOwnSound, timesPlayed, watchStripes,
} from './helpers/own-sound';
import { setUpDevice } from './helpers/seeded-device';
import { CAMERA_FILE } from './helpers/striped-subject';

test.use({
  viewport: { width: 1280, height: 1000 },
  timezoneId: 'UTC',
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${CAMERA_FILE}`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
});

test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'The fake camera file is a Chromium switch; the walk runs at desktop width'
);

const stop = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'Stop Monitoring', exact: true }).click();

test('a saved sound still being read when the watch stops does not sound after Stop', async ({ page, context }) => {
  test.setTimeout(240_000);
  await setUpDevice(context, { use: 'pet', settings: monitorSettings });
  await countOwnSoundPasses(page);

  await page.goto('/lost-found/', { waitUntil: 'networkidle', timeout: 60_000 });
  await saveOwnSound(page);
  await watchStripes(page);
  await expect.poll(async () => (await ownSoundCounts(page)).passes, { timeout: 60_000 }).toBeGreaterThan(0);

  // The saved sounds' store is slow to answer: the next match's start waits on its read.
  await holdSavedSounds(page);
  await page.waitForTimeout(3_000);
  await stop(page);
  await expect(page.getByText('LIVE', { exact: true })).toBeHidden({ timeout: 10_000 });
  const atStop = (await ownSoundCounts(page)).passes;
  await releaseSavedSounds(page);
  await page.waitForTimeout(3_000);
  expect((await ownSoundCounts(page)).passes, 'no pass of the saved sound starts after Stop').toBe(atStop);
});

test('a saved sound that repeats after a pause does not start its next pass after Stop', async ({ page, context }) => {
  test.setTimeout(240_000);
  await setUpDevice(context, { use: 'pet', settings: monitorSettings });
  await countOwnSoundPasses(page);

  await page.goto('/lost-found/', { waitUntil: 'networkidle', timeout: 60_000 });
  // Three more passes, four seconds apart.
  await saveOwnSound(page, { repeatCount: 3, repeatDelayMs: 4_000 });
  await watchStripes(page);
  // The first pass has played (0.3 seconds) and the sound waits for its next pass.
  await expect.poll(async () => (await ownSoundCounts(page)).ended, { timeout: 60_000, intervals: [50] }).toBeGreaterThan(0);
  await stop(page);
  const atStop = (await ownSoundCounts(page)).passes;
  await page.waitForTimeout(6_000);
  expect((await ownSoundCounts(page)).passes, 'the pause before the next pass ends after Stop, and no pass starts').toBe(atStop);
});

test('a loop that a motion or sound alert plays too keeps playing when the Lost & Found watch ends and monitoring goes on', async ({ page, context }) => {
  test.setTimeout(240_000);
  await setUpDevice(context, { use: 'pet', settings: monitorSettings });
  await countOwnSoundPasses(page);

  await page.goto('/lost-found/', { waitUntil: 'networkidle', timeout: 60_000 });
  // One looping sound for the drifting stripes' motion and the beep's sound alerts, and for Lost Item Found.
  await saveOwnSound(page, { loop: true, triggers: ['motion_detected', 'audio_detected', 'object_found'] });
  await watchStripes(page);
  await expect(page.locator('p').filter({ hasText: /^(Motion|Audio) detected: \d+%/ }).first(), 'a motion or sound alert plays the loop')
    .toBeVisible({ timeout: 60_000 });
  // Lost & Found's matches alert on each matching frame and find the loop playing.
  await page.waitForTimeout(5_000);
  const before = await ownSoundCounts(page);
  expect(before.passes, 'the loop plays').toBeGreaterThan(0);

  await page.getByRole('radiogroup', { name: 'Watch for' }).getByRole('radio', { name: 'Motion and sound' }).click();
  await expect(page.getByRole('button', { name: 'Stop Monitoring', exact: true })).toBeVisible();
  await page.waitForTimeout(3_000);
  expect((await ownSoundCounts(page)).pauses, 'the loop the motion or sound alert plays is not stopped').toBe(before.pauses);
});

test('Silent quiet hours that begin while the watch runs keep the next match from playing the saved sound', async ({ page, context }) => {
  test.setTimeout(240_000);
  await page.clock.install({ time: new Date('2026-11-18T21:50:00Z') });
  await setUpDevice(context, {
    use: 'pet',
    settings: {
      ...monitorSettings,
      quietHoursSettings: {
        enabled: true, startTime: '22:00', endTime: '07:00', days: [0, 1, 2, 3, 4, 5, 6],
        mode: 'silent', reducedVolume: 30,
      },
    },
  });

  await page.goto('/lost-found/', { waitUntil: 'networkidle', timeout: 60_000 });
  await saveOwnSound(page);
  await watchStripes(page);
  // Before 22:00 each match plays the sound.
  await expect.poll(() => timesPlayed(page), { timeout: 60_000 }).toBeGreaterThan(0);

  // The clock passes 22:00; the app's timers keep their own schedule.
  await page.clock.setSystemTime(new Date('2026-11-18T22:00:05Z'));
  // A start already on its way may still count.
  await page.waitForTimeout(1_500);
  const atQuiet = await timesPlayed(page);
  await page.waitForTimeout(6_000);
  await expect(page.getByText(/consecutive match/).first()).toBeVisible();
  expect(await timesPlayed(page), 'no match plays the saved sound once quiet hours begin').toBe(atQuiet);
});
