/**
 * A Lost & Found alert plays the person's own sound
 *
 * A sound of the person's own is saved for Lost Item Found. A pet is enrolled
 * from a striped photo and the camera shows the same stripes, so the watch's
 * comparison raises a Lost & Found alert. The sound manager counts each play
 * of a saved sound: the sound's count rises, and Sounds shows it played. A
 * saved sound that loops stops when the watch stops, and Silent quiet hours
 * keep the saved sound from playing.
 *
 * @module e2e/lost-found-sound.spec
 */

import { test, expect } from '@playwright/test';

import monitorSettings from '../scripts/home-capture-settings.json';
import { saveOwnSound, timesPlayed, watchStripes } from './helpers/own-sound';
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

test("a Lost & Found alert plays the sound saved for Lost Item Found", async ({ page, context }) => {
  test.setTimeout(240_000);
  await setUpDevice(context, { use: 'pet', settings: monitorSettings });

  await page.goto('/lost-found/', { waitUntil: 'networkidle', timeout: 60_000 });
  await saveOwnSound(page);
  expect(await timesPlayed(page)).toBe(0);
  await watchStripes(page);

  await expect.poll(() => timesPlayed(page), { timeout: 60_000 }).toBeGreaterThan(0);
  await page.screenshot({ path: test.info().outputPath('lost-found-alert-1280.png') });

  await page.goto('/settings/sounds/', { waitUntil: 'networkidle', timeout: 60_000 });
  await expect(page.getByText(/Played [1-9]\d*x/)).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: test.info().outputPath('sounds-played-1280.png') });
});

test('a saved sound that loops stops when the watch stops', async ({ page, context }) => {
  test.setTimeout(240_000);
  await setUpDevice(context, { use: 'pet', settings: monitorSettings });
  // Counts each time a saved sound (an audio element on a blob) starts a pass.
  await context.addInitScript(() => {
    const w = window as unknown as { __ownSoundPasses: number };
    w.__ownSoundPasses = 0;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (this.src.startsWith('blob:')) w.__ownSoundPasses += 1;
      return play.call(this);
    };
  });
  const passes = () => page.evaluate(() => (window as unknown as { __ownSoundPasses: number }).__ownSoundPasses);

  await page.goto('/lost-found/', { waitUntil: 'networkidle', timeout: 60_000 });
  await saveOwnSound(page, { loop: true });
  await watchStripes(page);
  await expect.poll(passes, { timeout: 60_000 }).toBeGreaterThan(1);

  await page.getByRole('button', { name: 'Stop Monitoring', exact: true }).click();
  await page.waitForTimeout(1_000);
  const afterStop = await passes();
  // The sound lasts 0.3 seconds: a loop that went on would start about ten passes here.
  await page.waitForTimeout(3_000);
  expect(await passes()).toBe(afterStop);
});

test('in Silent quiet hours a Lost & Found alert does not play the saved sound', async ({ page, context }) => {
  test.setTimeout(240_000);
  await page.clock.install({ time: new Date('2026-11-18T23:00:00Z') });
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
  // The comparison alerts on the matching frames that follow; give it five seconds of them.
  await page.waitForTimeout(5_000);
  await expect(page.getByText(/consecutive match/).first()).toBeVisible();
  expect(await timesPlayed(page)).toBe(0);
});
