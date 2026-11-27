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

import { readable, wordsOn } from './helpers/alert-pictures';
import { BARRED, readWords } from './helpers/lost-found-words';
import { enrolPet, sightingAlerts } from './helpers/own-sound';
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
    // The runner offers no installed voices. Supply a local voice and
    // record speech addressed to it, so the walk checks the spoken words.
    const synth = window.speechSynthesis;
    if (synth) {
      const voice: SpeechSynthesisVoice = {
        name: 'Local English', lang: 'en-US', voiceURI: 'local-en',
        localService: true, default: true,
      };
      class RecordedUtterance {
        constructor(public text: string) {}
      }
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: RecordedUtterance, configurable: true });
      Object.defineProperties(synth, {
        getVoices: { value: () => [voice], configurable: true },
        speak: {
          value: (utterance: SpeechSynthesisUtterance) => {
            if (utterance.voice === voice) kept.spoken.push(utterance.text);
          },
          configurable: true,
        },
      });
    }
  });
}

const keptSoFar = (page: Page): Promise<Kept> =>
  page.evaluate(() => (window as unknown as { __lostFoundWords?: Kept }).__lostFoundWords ?? { notifications: [], spoken: [] });

/**
 * Writes one saved picture for the pet into the browser's database, as the
 * watch saves one: a 640 by 480 picture, a score of 82 with its four parts
 * and the compared region. The gallery then has a picture to show whether or
 * not the build saves a picture on each check. With `counted`, the pet's
 * saved count goes up by one too, as the watch's own save raises it.
 */
const savePicture = (page: Page, { counted = false }: { counted?: boolean } = {}) =>
  page.evaluate(
    async ({ name, width, height, counted }) => {
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
        const pets = await new Promise<Array<{ id: string; name: string; matchCount?: number }>>((resolve, reject) => {
          const reading = database.transaction('subject_profile').objectStore('subject_profile').getAll();
          reading.onsuccess = () => resolve(reading.result);
          reading.onerror = () => reject(reading.error);
        });
        const pet = pets.find((saved) => saved.name === name);
        if (!pet) throw new Error(`no saved pet named ${name}`);
        await new Promise<void>((resolve, reject) => {
          const writing = database.transaction(['match_frame', 'subject_profile'], 'readwrite');
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
          if (counted) writing.objectStore('subject_profile').put({ ...pet, matchCount: (pet.matchCount ?? 0) + 1 });
          writing.oncomplete = () => resolve();
          writing.onerror = () => reject(writing.error);
        });
      } finally {
        database.close();
      }
    },
    { name: NAME, width: WIDTH, height: HEIGHT, counted }
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

test('the watch names the pet it compares with no score, bar or count', async ({ page, context }, testInfo) => {
  test.setTimeout(240_000);
  await seed(context);

  await page.goto('/lost-found/', { waitUntil: 'networkidle', timeout: 60_000 });
  await enrolPet(page, NAME, await stripedPhoto(page));
  await openWatch(page);

  // The pet's meter at the foot of the live picture names the pet and what
  // it compares. It draws no bar and says no number, even once the watch
  // has raised a sighting.
  const petMeter = page.locator('.watch-meter--pet');
  await expect(petMeter.getByText('Comparing with Stripes’s photos', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => sightingAlerts(page, NAME), { timeout: 60_000 }).toBeGreaterThan(0);
  const meterWords = await readWords(page, '.watch-meter--pet');
  expect(meterWords).not.toMatch(/\d|%|Quiet|Over the line|Colours and shape|checks? (in a row )?like/);
  await expect(petMeter.locator('[style*="width"]')).toHaveCount(0);

  // The pet's card beside the picture keeps its photos and limits, and adds
  // no reading, list of sightings or link.
  const card = page.locator('.watch-pet--card');
  await expect(card).toBeVisible();
  const cardWords = await readWords(page, '.watch-pet--card');
  expect(cardWords).not.toMatch(/%|Quiet|Over the line|Colours and shape now|Recent possible sightings|Saved pictures/);
  await page.screenshot({ path: testInfo.outputPath('lost-found-watch-words-1280.png'), fullPage: true });
});

for (const look of ['light', 'dark'] as const) {
  test(`an alert asks its question in the notification and on the full-screen pictures, and speaks the new line, ${look}`, async ({ page, context }, testInfo) => {
    test.setTimeout(240_000);
    await page.emulateMedia({ colorScheme: look });
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
    await expect.soft(dialog, 'the pictures take focus when they open').toBeFocused();

    await expect.poll(async () => (await keptSoFar(page)).spoken.length, { timeout: 30_000 }).toBeGreaterThan(0);
    expect((await keptSoFar(page)).spoken[0]).toBe('Colours like your pet’s photos are in view.');
    // Paused, the pictures stay open while they are read: the cycle's words among them, the photo drawn whole.
    await dialog.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(dialog.getByText(/^Cycle \d of 3$/)).toBeVisible();
    await expect(dialog.locator('img')).toHaveCSS('opacity', '1');
    const capture = look === 'light' ? 'lost-found-overlay-words-1280.png' : 'lost-found-overlay-words-1280-dark.png';
    await page.screenshot({ path: testInfo.outputPath(capture) });
    const title = dialog.getByRole('heading', { name: QUESTION, exact: true });
    const titleStyle = await wordsOn(dialog, title);
    expect.soft(titleStyle.ratio, 'the heading has at least 12:1 contrast against the black overlay').toBeGreaterThanOrEqual(12);
    expect.soft(titleStyle.solid).toBe(true);
    expect.soft(titleStyle.size).toBeGreaterThanOrEqual(18);
    expect(await readable(dialog, { lead: 18, other: 18, floor: 18, leadRatio: 12, otherRatio: 7 })).toEqual([]);

    // The pictures fill the window, and a window shorter than the photo keeps every key in it.
    for (const height of [1000, 600]) {
      await page.setViewportSize({ width: 1280, height });
      await expect
        .poll(async () => {
          const box = await dialog.boundingBox();
          return box && [box.y, box.height];
        }, { message: `the pictures fill a window ${height} px high`, timeout: 5_000 })
        .toEqual([0, height]);
      for (const name of ['Close alert', 'Mute', 'Resume']) {
        const key = (await dialog.getByRole('button', { name, exact: true }).boundingBox())!;
        expect(key.y, `${name} starts in a window ${height} px high`).toBeGreaterThanOrEqual(0);
        expect(key.y + key.height, `${name} ends in a window ${height} px high`).toBeLessThanOrEqual(height);
      }
    }

    // Tab goes round the dialog's own keys, either way, and Escape closes it.
    const holdsFocus = () => dialog.evaluate((node) => node.contains(document.activeElement));
    for (const press of ['Tab', 'Shift+Tab']) {
      for (let stop = 1; stop <= 5; stop++) {
        await page.keyboard.press(press);
        expect.soft(await holdsFocus(), `${press} pressed ${stop} times stays on the pictures`).toBe(true);
      }
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
}

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

test.describe('The gallery on a touch screen', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('a tap on a saved picture opens it and deletes nothing', async ({ page, context }) => {
    test.setTimeout(180_000);
    await seed(context);

    await page.goto('/lost-found/', { waitUntil: 'networkidle', timeout: 60_000 });
    await enrolPet(page, NAME, await stripedPhoto(page));
    await expect(page.getByRole('button', { name: 'Start Monitoring' })).toBeVisible({ timeout: 30_000 });
    await savePicture(page);

    // A finger shows no hover, so the tile's keys are out of sight: the tap lands where Delete stands.
    await page.goto('/lost-found/gallery/', { waitUntil: 'networkidle', timeout: 60_000 });
    const key = (await page.getByRole('button', { name: 'Delete this picture', exact: true }).boundingBox())!;
    await page.touchscreen.tap(key.x + key.width / 2, key.y + key.height / 2);
    const opened = page.getByRole('dialog', { name: QUESTION, exact: true });
    await expect(opened.getByText(QUESTION, { exact: true })).toBeVisible();
    await opened.getByRole('button', { name: 'Close', exact: true }).tap();
    await expect(page.getByRole('img', { name: /^What the camera saw at / })).toHaveCount(1);
  });
});

test('the pet’s card counts the pictures saved for it, and a picture deleted in the gallery leaves the count', async ({ page, context }) => {
  test.setTimeout(180_000);
  await seed(context);

  await page.goto('/lost-found/', { waitUntil: 'networkidle', timeout: 60_000 });
  await enrolPet(page, NAME, await stripedPhoto(page));
  await expect(savedPetCard(page)).toBeVisible({ timeout: 30_000 });
  await savePicture(page, { counted: true });
  await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
  await expect(page.getByText(/^1 possible sighting saved • Created /)).toBeVisible({ timeout: 30_000 });

  await page.goto('/lost-found/gallery/', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('button', { name: 'Open this picture', exact: true }).first().click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('No pictures saved', { exact: true })).toBeVisible();

  await page.goto('/lost-found/', { waitUntil: 'networkidle', timeout: 60_000 });
  await expect(savedPetCard(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/^1 possible sighting saved/)).toHaveCount(0);
});

test('no Lost and Found screen says match, detected, confidence, accurate or likelihood', async ({ page, context }, testInfo) => {
  test.setTimeout(300_000);
  await seed(context);
  // A whole page is read with its title, which names the page in the tab,
  // the history, a bookmark and a search result.
  const holdsNoBarredWord = async (stop: string, scope?: string) => {
    const words = scope ? await readWords(page, scope) : `${await page.title()}\n${await readWords(page)}`;
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
  await expect(page.locator('.watch-meter--pet').getByText('Comparing with Stripes’s photos', { exact: true }))
    .toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.watch-pet--card')).toBeVisible();
  await holdsNoBarredWord('the pet’s meter on the watch', '.watch-meter--pet');
  await holdsNoBarredWord('the pet’s card on the watch', '.watch-pet--card');
  const dialog = page.getByRole('alertdialog', { name: QUESTION });
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  await holdsNoBarredWord('the full-screen pictures', '[role="alertdialog"]');

  await savePicture(page);
  await page.goto('/lost-found/gallery/', { waitUntil: 'networkidle', timeout: 60_000 });
  const picture = page.getByRole('img', { name: /^What the camera saw at / }).first();
  await expect(picture).toBeVisible({ timeout: 30_000 });
  await holdsNoBarredWord('the gallery');
  await page.getByRole('button', { name: 'Open this picture', exact: true }).first().click();
  const opened = page.getByRole('dialog', { name: QUESTION, exact: true });
  await expect(opened.getByText(QUESTION, { exact: true })).toBeVisible();
  await holdsNoBarredWord('an opened picture');
  await page.screenshot({ path: testInfo.outputPath('lost-found-words-read-1280.png') });
});

// =============================================================================
// The FAQ and How it works
// =============================================================================

const COMPARE_QUESTION = 'How does Lost and Found compare my pet\'s photos?';
const COMPARE_ANSWER = 'Twice a second, the browser compares each part of the camera\'s picture that moved with your pet\'s photos: their colours, 5 main colours, outline on an 8 by 8 grid and size. When a part comes close enough, Lost and Found shows a possible sighting with that picture beside your photo, so you can check it yourself. It reads colours and outline with no model, so another animal, or a cushion or bag of similar colours, can raise one too. Crop each photo close to your pet: the background in a photo counts as well.';
const MODELS_QUESTION = 'What AI models does SafeOS Guardian use?';
const MODELS_ANSWER = 'Security and Wildlife modes use COCO-SSD, a TensorFlow.js object detection model, to find people and animals. The monitor page uses no model: it compares video frames for motion, measures sound levels and, for Lost and Found, compares the picture with your pet\'s photos by colour and outline. Everything runs in the browser.';
const HOW_IT_WORKS_LEAD = 'Motion and sound alerts compare camera frames and measure the sound level in your browser, with no model. Lost and Found compares the camera’s picture with your pet’s photos by colour and outline, also with no model. The People and Wildlife pages add an object-detection model that runs in your browser too. Open a card to see how each part works.';

const plain = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim();

/** Opens an FAQ question in its section and returns the answer it shows. */
async function faqAnswer(page: Page, section: string, question: string): Promise<string> {
  // The section's heading carries its number before its name; its questions follow it.
  const part = page.getByRole('heading', { name: section }).locator('xpath=following-sibling::div[1]');
  const asked = part.getByRole('button', { name: question, exact: true });
  await expect(asked).toBeVisible();
  await asked.click();
  await expect(asked).toHaveAttribute('aria-expanded', 'true');
  const answer = asked.locator('xpath=following-sibling::div[1]').locator('p');
  await expect(answer).toBeVisible();
  return plain(await answer.textContent());
}

test('the FAQ says how Lost and Found compares a pet\'s photos, and the models answer and How it works name it', async ({ page }) => {
  await page.goto('/faq/', { waitUntil: 'networkidle', timeout: 60_000 });
  expect(await faqAnswer(page, 'Detection & Alerts', COMPARE_QUESTION)).toBe(COMPARE_ANSWER);
  expect(await faqAnswer(page, 'Technical', MODELS_QUESTION)).toBe(MODELS_ANSWER);
  for (const words of [COMPARE_ANSWER, MODELS_ANSWER]) expect(words).not.toMatch(BARRED);

  await page.goto('/', { waitUntil: 'networkidle', timeout: 60_000 });
  const lead = page.locator('#how-it-works .home-detection__lead');
  await lead.scrollIntoViewIfNeeded();
  await expect(lead).toBeVisible();
  expect(plain(await lead.textContent())).toBe(HOW_IT_WORKS_LEAD);
  expect(plain(await lead.textContent())).not.toMatch(BARRED);
});
