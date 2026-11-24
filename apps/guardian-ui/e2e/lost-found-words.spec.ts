/**
 * Lost and Found says what it compares and asks the person to look
 *
 * The watch compares the colours and coarse shape of what the camera sees
 * with a pet's photos. These walks enrol "Stripes" from a photo of the fake
 * camera's stripes, as e2e/lost-found-edge.spec.ts does, and read every
 * Lost and Found screen: setup, the Lost & Found page, the pet's two cards on
 * the watch, an alert's notification, the full-screen pictures and their
 * spoken line, and the gallery. None shows a score, a percentage or a word
 * that claims more than a resemblance.
 *
 * @module e2e/lost-found-words.spec
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test';

import { BARRED, readWords } from './helpers/lost-found-words';
import { enrolPet } from './helpers/own-sound';
import { OWN_SETTING, setUpDevice } from './helpers/seeded-device';
import { CAMERA_FILE, HEIGHT, WIDTH, stripedPhoto } from './helpers/striped-subject';

test.use({
  viewport: { width: 1280, height: 1000 },
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${CAMERA_FILE}`,
    ],
  },
});

test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'The fake camera file is a Chromium switch; the walk runs at desktop width'
);

const NAME = 'Stripes';
const QUESTION = 'Could this be Stripes?';
const FIRST_LINE = 'Colours and shape like Stripes’s photos.';

const seed = (context: BrowserContext) =>
  setUpDevice(context, { use: 'pet', settings: { activePresetId: 'custom', globalSettings: OWN_SETTING } });

// =============================================================================
// Setup and the watch
// =============================================================================

/** Opens setup on the Lost & Found page and chooses a pet. */
async function openSetup(page: Page) {
  await page.getByText('Add New Subject to Watch').click();
  await expect(page.getByText('What are you looking for?')).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

/** Names the pet and adds the stripes' photo, then goes on to the alert step. */
async function addStripesPhoto(page: Page) {
  await page.getByPlaceholder('e.g., Max, Luna, Dad').fill(NAME);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'stripes.png',
    mimeType: 'image/png',
    buffer: await stripedPhoto(page),
  });
  const next = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(next).toBeEnabled();
  await next.click();
}

/** Switches on the full-screen pictures in setup's alert step. */
async function switchOnOverlay(page: Page) {
  const overlay = page
    .getByText('Image Flash Overlay', { exact: true })
    .locator('xpath=ancestor::div[.//input[@type="checkbox"]][1]')
    .locator('input[type="checkbox"]');
  // The switch draws over its own hidden box; a press on the switch reaches it.
  await overlay.locator('xpath=..').click();
  await expect(overlay).toBeChecked();
}

/** From the Lost & Found page with the pet chosen: opens the watch and starts the camera. */
async function openWatch(page: Page) {
  await page.getByRole('button', { name: 'Start Monitoring' }).click({ timeout: 60_000 });
  await page.waitForURL(/\/monitor\/(\?.*)?$/, { timeout: 60_000 });
  await page.getByRole('button', { name: 'Start watching', exact: true }).click({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Stop watching', exact: true })).toBeVisible({ timeout: 30_000 });
}

/** The saved pet's card on the Lost & Found page, there once setup has saved it. */
const savedPetCard = (page: Page) => page.getByText(/^No possible sightings saved • Created /);

// =============================================================================
// What the page keeps: notifications, spoken words, saved pictures
// =============================================================================

interface Kept {
  notifications: Array<{ title: string; body?: string; tag?: string }>;
  spoken: string[];
}

/**
 * Keeps each notification's title, body and tag, and the text of each line
 * the page speaks, before the page's own scripts run. A notification is kept
 * whether the page shows it through the offline worker or on its own.
 */
async function keepNotificationsAndSpeech(context: BrowserContext) {
  await context.addInitScript(() => {
    const kept: Kept = { notifications: [], spoken: [] };
    (window as unknown as { __lostFoundWords: Kept }).__lostFoundWords = kept;
    const record = (title: string, options?: NotificationOptions) => {
      kept.notifications.push({ title, body: options?.body, tag: options?.tag });
    };
    class RecordedNotification extends EventTarget {
      static permission = 'granted';
      static requestPermission = async () => 'granted';
      onclick: unknown = null;
      onclose: unknown = null;
      onerror: unknown = null;
      onshow: unknown = null;
      constructor(title: string, options?: NotificationOptions) {
        super();
        record(title, options);
      }
      close() {}
    }
    Object.defineProperty(window, 'Notification', { value: RecordedNotification, configurable: true, writable: true });
    if ('ServiceWorkerRegistration' in window) {
      ServiceWorkerRegistration.prototype.showNotification = async function (title: string, options?: NotificationOptions) {
        record(title, options);
      };
    }
    const speak = (utterance: SpeechSynthesisUtterance) => {
      kept.spoken.push(utterance.text);
    };
    if ('SpeechSynthesis' in window) SpeechSynthesis.prototype.speak = speak;
    if (window.speechSynthesis) Object.defineProperty(window.speechSynthesis, 'speak', { value: speak, configurable: true });
  });
}

const keptSoFar = (page: Page): Promise<Kept> =>
  page.evaluate(() => (window as unknown as { __lostFoundWords?: Kept }).__lostFoundWords ?? { notifications: [], spoken: [] });

/**
 * Writes one saved picture for the pet into the browser's database, as the
 * watch saves one: a 640 by 480 picture, a score of 82 with its four parts
 * and the compared region. The gallery then has a picture to show whether or
 * not the build saves a picture on each check.
 */
const savePicture = (page: Page) =>
  page.evaluate(
    async ({ name, width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2D canvas');
      for (let x = 0; x < width; x += 20) {
        ctx.fillStyle = (x / 20) % 2 === 0 ? 'rgb(60, 60, 60)' : 'rgb(200, 200, 200)';
        ctx.fillRect(x, 0, 20, height);
      }
      const picture = canvas.toDataURL('image/jpeg', 0.8);

      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const opening = indexedDB.open('safeos-guardian');
        opening.onsuccess = () => resolve(opening.result);
        opening.onerror = () => reject(opening.error);
      });
      try {
        const pets = await new Promise<Array<{ id: string; name: string }>>((resolve, reject) => {
          const reading = database.transaction('subject_profile').objectStore('subject_profile').getAll();
          reading.onsuccess = () => resolve(reading.result);
          reading.onerror = () => reject(reading.error);
        });
        const pet = pets.find((saved) => saved.name === name);
        if (!pet) throw new Error(`no saved pet named ${name}`);
        await new Promise<void>((resolve, reject) => {
          const writing = database.transaction('match_frame', 'readwrite');
          writing.objectStore('match_frame').put({
            id: `walk-picture-${Date.now()}`,
            subjectId: pet.id,
            frameData: picture,
            thumbnailData: picture,
            confidence: 82,
            timestamp: Date.now(),
            details: { colorMatch: 81, dominantMatch: 79, edgeMatch: 77, sizeMatch: 93 },
            region: { x: 160, y: 120, width: 160, height: 120 },
            acknowledged: false,
            notes: '',
            exported: false,
            alerted: true,
          });
          writing.oncomplete = () => resolve();
          writing.onerror = () => reject(writing.error);
        });
      } finally {
        database.close();
      }
    },
    { name: NAME, width: WIDTH, height: HEIGHT }
  );

// =============================================================================
// The walks
// =============================================================================

test('setup and the Lost & Found page say what the watch compares', async ({ page, context }, testInfo) => {
  test.setTimeout(180_000);
  await seed(context);

  await page.goto('/lost-found/', { waitUntil: 'networkidle', timeout: 60_000 });
  await expect(
    page.getByText(
      'Get an alert when the colours and shape are like the photos; another animal or an object of similar colour can set it off too'
    )
  ).toBeVisible();

  await openSetup(page);
  await expect(
    page.getByText('Add up to five photos, each cropped close: SafeOS reads the whole photo, background too.', { exact: true })
  ).toBeVisible();
  await addStripesPhoto(page);

  // The alert step: two lines with plain numbers, no per cent sign.
  const alertLine = page.getByText('Alert line', { exact: true });
  await expect(alertLine).toBeVisible();
  await expect(alertLine.locator('xpath=following-sibling::span[1]')).toHaveText(/^\d+$/);
  await expect(page.getByText('Colour sensitivity', { exact: true }).locator('xpath=following-sibling::span[1]')).toHaveText(/^\d+$/);
  await expect(page.getByText('The watch alerts when its comparison reaches this line.', { exact: true })).toBeVisible();
  await expect(page.getByText('More alerts', { exact: true })).toBeVisible();
  await expect(page.getByText('Fewer, closer', { exact: true })).toBeVisible();
  await switchOnOverlay(page);
  await expect(page.getByText('Shows your photos full screen when the watch alerts', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('lost-found-setup-words-1280.png'), fullPage: true });

  await page.getByRole('button', { name: 'Start Watching', exact: true }).click();
  await expect(savedPetCard(page)).toBeVisible({ timeout: 30_000 });
});

test('the watch says Quiet or Over the line and counts checks', async ({ page, context }, testInfo) => {
  test.setTimeout(240_000);
  await seed(context);

  await page.goto('/lost-found/', { waitUntil: 'networkidle', timeout: 60_000 });
  await enrolPet(page, NAME, await stripedPhoto(page));
  await openWatch(page);

  const onPicture = page.locator('[data-lost-found-card="picture"]');
  await expect(onPicture.getByText('Colours and shape', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(onPicture.getByText('Over the line', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(onPicture.getByText(/checks? (in a row )?like Stripes’s photos/)).toBeVisible({ timeout: 60_000 });

  const full = page.locator('[data-lost-found-card="full"]');
  await expect(full.getByText('Colours and shape now', { exact: true })).toBeVisible();
  const recent = full.getByRole('heading', { name: 'Recent possible sightings', exact: true });
  await expect(recent).toBeVisible({ timeout: 30_000 });
  const rows = recent.locator('xpath=following-sibling::div[1]/div');
  await expect(rows.filter({ hasText: /Over the line$/ }).first()).toBeVisible({ timeout: 30_000 });

  expect(await readWords(page, '[data-lost-found-card="picture"]')).not.toContain('%');
  expect(await readWords(page, '[data-lost-found-card="full"]')).not.toContain('%');
  await page.screenshot({ path: testInfo.outputPath('lost-found-watch-words-1280.png'), fullPage: true });
});

test('an alert asks its question in the notification and on the full-screen pictures, and speaks the new line', async ({ page, context }, testInfo) => {
  test.setTimeout(240_000);
  await keepNotificationsAndSpeech(context);
  await seed(context);

  await page.goto('/lost-found/', { waitUntil: 'networkidle', timeout: 60_000 });
  await openSetup(page);
  await addStripesPhoto(page);
  await switchOnOverlay(page);
  await page.getByRole('button', { name: 'Start Watching', exact: true }).click();
  await openWatch(page);

  await expect
    .poll(async () => (await keptSoFar(page)).notifications.map((shown) => shown.title), { timeout: 60_000 })
    .toContain(QUESTION);
  const shown = (await keptSoFar(page)).notifications.find((notification) => notification.title === QUESTION);
  expect(shown?.body).toMatch(/^Colours and shape like Stripes’s photos, .+\.$/);
  expect(shown?.body).not.toContain('%');

  const dialog = page.getByRole('alertdialog', { name: QUESTION });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByText(FIRST_LINE, { exact: true })).toBeVisible();

  await expect.poll(async () => (await keptSoFar(page)).spoken.length, { timeout: 30_000 }).toBeGreaterThan(0);
  expect((await keptSoFar(page)).spoken[0]).toBe('Colours like your pet’s photos are in view.');
  await page.screenshot({ path: testInfo.outputPath('lost-found-overlay-words-1280.png') });
});

test('the gallery lists saved pictures with no score, and an opened one asks the question', async ({ page, context }, testInfo) => {
  test.setTimeout(180_000);
  await seed(context);

  await page.goto('/lost-found/', { waitUntil: 'networkidle', timeout: 60_000 });
  await enrolPet(page, NAME, await stripedPhoto(page));
  await expect(page.getByRole('button', { name: 'Start Monitoring' })).toBeVisible({ timeout: 30_000 });
  await savePicture(page);

  await page.goto('/lost-found/gallery/', { waitUntil: 'networkidle', timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Possible sightings', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Saved pictures', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Closest first', exact: true })).toBeAttached();
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Over the alert line', exact: true })).toBeVisible();

  const picture = page.getByRole('img', { name: /^What the camera saw at / }).first();
  await expect(picture).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Open this picture', exact: true }).first().click();
  await expect(page.getByText(QUESTION, { exact: true })).toBeVisible();
  await expect(page.getByText(FIRST_LINE, { exact: true })).toBeVisible();

  const words = await readWords(page);
  for (const score of ['82', '%', 'Confidence', 'Edge']) expect(words, `the gallery shows "${score}"`).not.toContain(score);
  await page.screenshot({ path: testInfo.outputPath('lost-found-gallery-words-1280.png') });
});

test('no Lost and Found screen says match, detected, confidence, accurate or likelihood', async ({ page, context }, testInfo) => {
  test.setTimeout(300_000);
  await seed(context);
  const holdsNoBarredWord = async (stop: string, scope?: string) => {
    const words = await readWords(page, scope);
    expect(words, `${stop} says: ${words.match(BARRED)?.[0]}`).not.toMatch(BARRED);
  };

  await page.goto('/lost-found/', { waitUntil: 'networkidle', timeout: 60_000 });
  await expect(page.getByText('Add New Subject to Watch')).toBeVisible();
  await holdsNoBarredWord('the Lost & Found page');

  await page.getByText('Add New Subject to Watch').click();
  await expect(page.getByText('What are you looking for?')).toBeVisible();
  await holdsNoBarredWord('setup, the kind of subject');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByPlaceholder('e.g., Max, Luna, Dad')).toBeVisible();
  await holdsNoBarredWord('setup, the photos');
  await addStripesPhoto(page);
  await switchOnOverlay(page);
  await holdsNoBarredWord('setup, the alert step');
  await page.getByRole('button', { name: 'Start Watching', exact: true }).click();
  await expect(savedPetCard(page)).toBeVisible({ timeout: 30_000 });
  await holdsNoBarredWord('the Lost & Found page with a saved pet');

  await openWatch(page);
  await expect(page.locator('[data-lost-found-card="picture"]').getByText('Over the line', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-lost-found-card="full"]')).toBeVisible();
  await holdsNoBarredWord('the pet’s cards on the watch', '[data-lost-found-card]');
  const dialog = page.getByRole('alertdialog', { name: QUESTION });
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  await holdsNoBarredWord('the full-screen pictures', '[role="alertdialog"]');

  await savePicture(page);
  await page.goto('/lost-found/gallery/', { waitUntil: 'networkidle', timeout: 60_000 });
  const picture = page.getByRole('img', { name: /^What the camera saw at / }).first();
  await expect(picture).toBeVisible({ timeout: 30_000 });
  await holdsNoBarredWord('the gallery');
  await page.getByRole('button', { name: 'Open this picture', exact: true }).first().click();
  await expect(page.getByText(QUESTION, { exact: true })).toBeVisible();
  await holdsNoBarredWord('an opened picture');
  await page.screenshot({ path: testInfo.outputPath('lost-found-words-read-1280.png') });
});
