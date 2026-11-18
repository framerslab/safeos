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

import { test, expect, type Page } from '@playwright/test';

import monitorSettings from '../scripts/home-capture-settings.json';
import { setUpDevice } from './helpers/seeded-device';
import { CAMERA_FILE, stripedPhoto } from './helpers/striped-subject';

const SOUND_ID = 'sound-come-home';

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

/** Saves a short tone as the person's own sound for Lost Item Found, as Sounds stores one. */
const saveOwnSound = (page: Page, loop = false) =>
  page.evaluate(({ id, loop }) => new Promise<void>((resolve, reject) => {
    // A 0.3 second 660 Hz tone as a 16-bit mono WAV file.
    const rate = 16_000;
    const samples = Math.round(rate * 0.3);
    const wav = new DataView(new ArrayBuffer(44 + samples * 2));
    const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) wav.setUint8(at + i, s.charCodeAt(i)); };
    text(0, 'RIFF'); wav.setUint32(4, 36 + samples * 2, true); text(8, 'WAVE');
    text(12, 'fmt '); wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 1, true);
    wav.setUint32(24, rate, true); wav.setUint32(28, rate * 2, true); wav.setUint16(32, 2, true); wav.setUint16(34, 16, true);
    text(36, 'data'); wav.setUint32(40, samples * 2, true);
    for (let i = 0; i < samples; i++) wav.setInt16(44 + i * 2, Math.round(8000 * Math.sin((2 * Math.PI * 660 * i) / rate)), true);
    const audioBlob = new Blob([wav.buffer], { type: 'audio/wav' });

    const opening = indexedDB.open('safeos-custom-sounds', 1);
    opening.onupgradeneeded = () => {
      const store = opening.result.createObjectStore('sounds', { keyPath: 'id' });
      store.createIndex('name', 'name', { unique: false });
      store.createIndex('source', 'source', { unique: false });
      store.createIndex('enabled', 'enabled', { unique: false });
      store.createIndex('uploadedAt', 'uploadedAt', { unique: false });
    };
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const database = opening.result;
      const writing = database.transaction('sounds', 'readwrite');
      writing.objectStore('sounds').put({
        id, name: 'Come home', description: '', audioBlob, mimeType: 'audio/wav',
        durationSeconds: 0.3, fileSizeBytes: audioBlob.size, source: 'upload', uploadedAt: new Date().toISOString(),
        volume: 80, loop, repeatCount: 0, repeatDelayMs: 1000, fadeInMs: 0, fadeOutMs: 200,
        triggers: ['object_found'], priority: 5, enabled: true, playCount: 0,
      });
      writing.oncomplete = () => { database.close(); resolve(); };
      writing.onerror = () => { database.close(); reject(writing.error); };
    };
  }), { id: SOUND_ID, loop });

/** How many times the sound manager has played the saved sound. */
const timesPlayed = (page: Page) =>
  page.evaluate((id) => new Promise<number>((resolve) => {
    const opening = indexedDB.open('safeos-custom-sounds');
    opening.onerror = () => resolve(-1);
    opening.onsuccess = () => {
      const database = opening.result;
      const reading = database.transaction('sounds').objectStore('sounds').get(id);
      reading.onsuccess = () => { database.close(); resolve(reading.result?.playCount ?? -1); };
      reading.onerror = () => { database.close(); resolve(-1); };
    };
  }), SOUND_ID);

/** Enrols the striped pet, opens the watch and waits for the comparison to match. */
async function watchStripes(page: Page) {
  await page.getByText('Add New Subject to Watch').click();
  await expect(page.getByText('What are you looking for?')).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByPlaceholder('e.g., Max, Luna, Dad').fill('Stripes');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'stripes.png',
    mimeType: 'image/png',
    buffer: await stripedPhoto(page),
  });
  const next = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(next).toBeEnabled();
  await next.click();
  await page.getByRole('button', { name: 'Start Watching', exact: true }).click();

  await page.getByRole('button', { name: 'Start Monitoring' }).click({ timeout: 60_000 });
  await page.waitForURL(/\/monitor\/?$/, { timeout: 60_000 });
  await page.getByRole('button', { name: 'Start Monitoring', exact: true }).click({ timeout: 60_000 });
  await expect(page.getByText('LIVE', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/consecutive match/).first()).toBeVisible({ timeout: 60_000 });
}

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
  await saveOwnSound(page, true);
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
