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
 * - the same loop stops when the watch stops;
 * - and it stops with the watch after Watch for moved to Motion and sound
 *   while it played;
 * - Silent quiet hours that begin while the watch runs keep the next match
 *   from playing the sound at once, without waiting for the app's periodic
 *   volume check.
 *
 * @module e2e/lost-found-sound-stop.spec
 */

import { test, expect } from '@playwright/test';

import monitorSettings from '../scripts/home-capture-settings.json';
import {
  countOwnSoundPasses, holdSavedSounds, ownSoundCounts, releaseSavedSounds, saveOwnSound, sightingAlerts, timesPlayed, watchStripes,
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
  page.getByRole('button', { name: 'Stop watching', exact: true }).click();

test('a saved sound still being read when the watch stops does not sound after Stop', async ({ page, context }) => {
  test.setTimeout(240_000);
  await setUpDevice(context, { use: 'pet', settings: monitorSettings });
  await countOwnSoundPasses(page);

  await page.goto('/lost-found/', { waitUntil: 'networkidle', timeout: 60_000 });
  await saveOwnSound(page);
  await watchStripes(page);
  await expect.poll(async () => (await ownSoundCounts(page)).passes, { timeout: 60_000 }).toBeGreaterThan(0);

  // The saved sounds' store is slow to answer: the next sighting's start waits on its read.
  await holdSavedSounds(page);
  await page.waitForTimeout(3_000);
  await stop(page);
  await expect(page.getByRole('button', { name: 'Start watching', exact: true })).toBeVisible({ timeout: 10_000 });
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
  await expect(page.locator('[data-alert-card]').filter({ hasText: /(Motion|Sound) at / }).first(), 'a motion or sound alert plays the loop')
    .toBeVisible({ timeout: 60_000 });
  // Lost & Found's sighting alerts and finds the loop playing.
  await page.waitForTimeout(5_000);
  const before = await ownSoundCounts(page);
  expect(before.passes, 'the loop plays').toBeGreaterThan(0);

  await page.getByRole('radiogroup', { name: 'Watch for' }).getByRole('radio', { name: 'Motion and sound' }).click();
  await expect(page.getByRole('button', { name: 'Stop watching', exact: true })).toBeVisible();
  await page.waitForTimeout(3_000);
  expect((await ownSoundCounts(page)).pauses, 'the loop the motion or sound alert plays is not stopped').toBe(before.pauses);
});

test('a loop that a motion or sound alert plays too stops when the watch stops', async ({ page, context }) => {
  test.setTimeout(240_000);
  await setUpDevice(context, { use: 'pet', settings: monitorSettings });
  await countOwnSoundPasses(page);

  await page.goto('/lost-found/', { waitUntil: 'networkidle', timeout: 60_000 });
  await saveOwnSound(page, { loop: true, triggers: ['motion_detected', 'audio_detected', 'object_found'] });
  await watchStripes(page);
  await expect(page.locator('[data-alert-card]').filter({ hasText: /(Motion|Sound) at / }).first(), 'a motion or sound alert plays the loop')
    .toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(5_000);
  const before = await ownSoundCounts(page);
  expect(before.passes, 'the loop plays').toBeGreaterThan(0);

  await stop(page);
  await expect(page.getByRole('button', { name: 'Start watching', exact: true })).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => (await ownSoundCounts(page)).pauses, { message: 'Stop watching stops the loop', timeout: 10_000 })
    .toBeGreaterThan(before.pauses);
});

test('a loop that a motion or sound alert plays too, left playing when Watch for moves to Motion and sound, stops when the watch stops', async ({ page, context }) => {
  test.setTimeout(240_000);
  await setUpDevice(context, { use: 'pet', settings: monitorSettings });
  await countOwnSoundPasses(page);

  await page.goto('/lost-found/', { waitUntil: 'networkidle', timeout: 60_000 });
  await saveOwnSound(page, { loop: true, triggers: ['motion_detected', 'audio_detected', 'object_found'] });
  await watchStripes(page);
  await expect(page.locator('[data-alert-card]').filter({ hasText: /(Motion|Sound) at / }).first(), 'a motion or sound alert plays the loop')
    .toBeVisible({ timeout: 60_000 });
  // Lost & Found's sighting alerts and finds the loop playing.
  await page.waitForTimeout(5_000);
  const before = await ownSoundCounts(page);
  expect(before.passes, 'the loop plays').toBeGreaterThan(0);

  // Lost & Found lets go of the loop; the motion or sound alert still plays it.
  await page.getByRole('radiogroup', { name: 'Watch for' }).getByRole('radio', { name: 'Motion and sound' }).click();
  await expect(page.getByRole('button', { name: 'Stop watching', exact: true })).toBeVisible();
  await page.waitForTimeout(3_000);
  const switched = await ownSoundCounts(page);
  expect(switched.pauses, 'the loop is not stopped by the change of Watch for').toBe(before.pauses);
  expect(switched.passes, 'the loop goes on playing after the change of Watch for').toBeGreaterThan(before.passes);

  await stop(page);
  await expect(page.getByRole('button', { name: 'Start watching', exact: true })).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => (await ownSoundCounts(page)).pauses, {
    message: 'Stop watching stops the loop that Lost & Found let go of when Watch for changed', timeout: 10_000,
  }).toBeGreaterThan(switched.pauses);
});

test('Silent quiet hours that begin while the watch runs mute the next sighting alert', async ({ page, context }) => {
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
  await expect.poll(() => timesPlayed(page), { timeout: 60_000 }).toBeGreaterThan(0);
  const playsBeforeQuiet = await timesPlayed(page);
  const alertsBeforeQuiet = await sightingAlerts(page);

  await page.clock.setSystemTime(new Date('2026-11-18T22:00:05Z'));
  await expect.poll(() => sightingAlerts(page), { timeout: 60_000 }).toBeGreaterThan(alertsBeforeQuiet);
  await page.waitForTimeout(1_500);
  expect(await timesPlayed(page), 'the sighting alert during quiet hours is silent').toBe(playsBeforeQuiet);
});
