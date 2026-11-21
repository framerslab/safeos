/**
 * Lost & Found: a sighting keeps the camera's picture beside the pet's photo
 *
 * The pet "Stripes" is enrolled from a striped photo on the Lost & Found
 * page, and the camera is a canvas stream drawing the same stripes, drifting
 * sideways. The watch's comparison raises the sighting: one entry a run, with
 * the camera's picture, a box round the part like the pet's photos, the
 * close-up and the pet's saved photo. `window.__stripes.hidden` turns the
 * camera to a flat grey, which ends the run.
 *
 * Run in CI by ci.yml's "Web app Lost & Found browser test" job against the
 * static export.
 *
 * @module e2e/lost-found-sighting.spec
 */

import { readFile } from 'node:fs/promises';

import { test, expect, type BrowserContext, type Locator, type Page } from '@playwright/test';

import {
  CUSTOM_PRESET,
  near,
  notesOf,
  pixelsAt,
  readDatabase,
  recordNotifications,
  type DatabaseReading,
  type NotificationStandIn,
} from './helpers/alert-pictures';
import { countOwnSoundPasses, enrolPet, ownSoundCounts, saveOwnSound } from './helpers/own-sound';
import { HEIGHT, PERIOD, WIDTH, stripedPhoto } from './helpers/striped-subject';

declare global {
  interface Window {
    __stripes?: { hidden: boolean };
  }
}

// One launch for the whole file: a sound may start with no press, as the Lost & Found sound walks allow it.
test.use({
  permissions: ['camera', 'microphone'],
  launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
});

test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'the sighting walk hands the page a canvas camera and runs in desktop Chromium',
);

// =============================================================================
// The device, the camera and the pet
// =============================================================================

/** The watch with Lost and Found alone: the motion, sound and picture checks are off, so every card is a sighting's. */
const SIGHTINGS_ONLY = {
  activePresetId: 'custom',
  globalSettings: { ...CUSTOM_PRESET, motionDetectionEnabled: false, audioDetectionEnabled: false, pixelDetectionEnabled: false },
};

interface Device {
  settings?: Record<string, unknown>;
  pictures?: { keep?: boolean; inNotifications?: boolean };
  notifications?: NotificationStandIn;
}

/** A device that finished setup and answered the notice about alert pictures. */
async function setUp(context: BrowserContext, device: Device = {}): Promise<void> {
  if (device.notifications) await recordNotifications(context, device.notifications);
  await context.addInitScript((d: { settings: Record<string, unknown>; pictures: Record<string, unknown> }) => {
    if (localStorage.getItem('safeos-walk-seeded')) return;
    localStorage.setItem('safeos-walk-seeded', 'true');
    localStorage.setItem('safeos-onboarding', JSON.stringify({ state: {
      isComplete: true, selectedScenario: 'pet',
      acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
    }, version: 0 }));
    localStorage.setItem('guardian-onboarding-complete', 'true');
    localStorage.setItem('safeos-settings', JSON.stringify({ state: d.settings, version: 0 }));
    localStorage.setItem('safeos-notification-prompt-dismissed', String(Date.now()));
    localStorage.setItem('safeos-pwa-prompt-dismissed', String(Date.now()));
    localStorage.setItem('safeos-alert-pictures', JSON.stringify({ state: {
      keep: true, deleteAfterDays: 3, noticeAnswered: true, inNotifications: false, ...d.pictures,
    }, version: 0 }));
  }, { settings: device.settings ?? SIGHTINGS_ONLY, pictures: device.pictures ?? {} });
}

/**
 * Hands the page a canvas stream of the stripes the pet is enrolled from,
 * drifting one period every eight frames at 25 frames a second. While
 * `window.__stripes.hidden` is true it shows a flat grey.
 */
async function stripedCamera(page: Page): Promise<void> {
  await page.addInitScript(({ width, height, period }) => {
    window.__stripes = { hidden: false };
    navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px';
      document.body.appendChild(canvas);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context for the striped camera');
      let frame = 0;
      const draw = () => {
        if (window.__stripes?.hidden) {
          ctx.fillStyle = 'rgb(128, 128, 128)';
          ctx.fillRect(0, 0, width, height);
          return;
        }
        const shift = ((frame % 8) * period) / 8;
        frame += 1;
        for (let x = 0; x < width; x++) {
          // The grey a browser shows for the stripes' brightness, as the enrolled photo draws it.
          const luma = 126 + 96 * Math.sin((2 * Math.PI * (x - shift)) / period);
          const grey = Math.round(((luma - 16) * 255) / 219);
          ctx.fillStyle = `rgb(${grey}, ${grey}, ${grey})`;
          ctx.fillRect(x, 0, 1, height);
        }
      };
      draw();
      setInterval(draw, 40);
      const stream = canvas.captureStream(25);
      if (constraints && constraints.audio) {
        const audio = new AudioContext();
        const microphone = audio.createMediaStreamDestination();
        void audio.resume();
        for (const track of microphone.stream.getAudioTracks()) stream.addTrack(track);
      }
      return stream;
    };
  }, { width: WIDTH, height: HEIGHT, period: PERIOD });
}

const TIME = String.raw`\d{1,2}:\d{2}:\d{2}(?:\s?[AP]M)?`;
const QUESTION = 'Could this be Stripes?';
const LIKE_LINE = 'Colours and shape like Stripes’s photos.';
const COMPARE_LINE = 'Compare the two pictures. It can be another animal that looks alike.';
const PET_PHOTO = 'Stripes’s saved photo';
const FORBIDDEN = /match|detected|found|recogni[sz]e|identif|confidence|%/i;

const cards = (page: Page) => page.locator('[data-alert-card]');
const sightings = (page: Page) => cards(page).filter({ hasText: QUESTION });
const pictureName = (time: string) => `What the camera saw at ${time}. A box marks what changed.`;
const closeUpName = (time: string) => `Close-up of the boxed part at ${time}`;
const timePattern = (time: string) => time.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s');
const keptRows = (reading: DatabaseReading) => reading.pictures.filter((row) => row.state === 'kept');

/** The time a sighting's card shows under its question. */
async function timeOf(card: Locator): Promise<string> {
  const line = card.getByText(new RegExp(`^${TIME}$`)).first();
  await expect(line).toBeVisible({ timeout: 90_000 });
  return ((await line.textContent()) ?? '').replace(/\s+/g, ' ').trim();
}

/** Enrols Stripes on the Lost & Found page, opens the watch from there and starts it. */
async function watchForStripes(page: Page): Promise<void> {
  await page.goto('/lost-found/', { waitUntil: 'networkidle', timeout: 60_000 });
  await enrolPet(page, 'Stripes', await stripedPhoto(page));
  await page.getByRole('button', { name: 'Start Monitoring' }).click({ timeout: 60_000 });
  await page.waitForURL(/\/monitor\/?$/, { timeout: 60_000 });
  await page.getByRole('button', { name: 'Start Monitoring', exact: true }).click({ timeout: 60_000 });
  await expect(page.getByText('LIVE', { exact: true })).toBeVisible({ timeout: 30_000 });
}

/** The words a card, a dialog or a row shows and names: its text, its pictures' names and its keys' names. */
const wordsOf = (root: Locator): Promise<string> => root.evaluate((el) => {
  const named = Array.from(el.querySelectorAll('[alt], [aria-label]'))
    .map((part) => part.getAttribute('alt') ?? part.getAttribute('aria-label') ?? '');
  return [(el as HTMLElement).innerText, ...named].join(' \n ');
});

// =============================================================================
// The walks
// =============================================================================

for (const look of ['dark', 'light'] as const) {
  for (const width of [390, 1280]) {
    test.describe(`A sighting's entry, ${width} px, ${look}`, () => {
      test.use({ colorScheme: look, viewport: { width, height: 1000 } });

      test(`a sighting tops the list with the camera's picture beside the pet's photo, ${width} px, ${look}`, async ({ page, context }) => {
        test.setTimeout(240_000);
        await setUp(context);
        await stripedCamera(page);
        await watchForStripes(page);

        const card = sightings(page).first();
        await expect(card).toBeVisible({ timeout: 90_000 });
        const time = await timeOf(card);
        await expect(sightings(page)).toHaveCount(1);
        await expect(cards(page).first()).toContainText(QUESTION);

        // The camera's picture with one box, then the close-up and the pet's saved photo side by side.
        const picture = card.getByRole('img', { name: pictureName(time), exact: true });
        await expect(picture).toBeVisible();
        await expect(card.locator('.alert-picture__frame .alert-picture__box')).toHaveCount(1);
        const closeUp = card.getByRole('img', { name: closeUpName(time), exact: true });
        const petPhoto = card.getByRole('img', { name: PET_PHOTO, exact: true });
        await expect(closeUp).toBeVisible();
        await expect(petPhoto).toBeVisible();
        const tiles = card.locator('.alert-picture__tile');
        await expect(tiles).toHaveCount(2);
        const [first, second] = [(await tiles.nth(0).boundingBox())!, (await tiles.nth(1).boundingBox())!];
        if (width === 390) {
          for (const tile of [first, second]) expect([Math.round(tile.width), Math.round(tile.height)]).toEqual([112, 84]);
        }
        expect(Math.abs(first.y - second.y), 'the two tiles stand side by side').toBeLessThanOrEqual(2);
        expect(second.x).toBeGreaterThanOrEqual(first.x + first.width);

        // The question at 600, the time, the two lines, Open picture and Acknowledge.
        const question = card.getByText(QUESTION, { exact: true });
        await expect(question).toBeVisible();
        expect(await question.evaluate((el) => getComputedStyle(el).fontWeight)).toBe('600');
        await expect(card.getByText(LIKE_LINE, { exact: true })).toBeVisible();
        await expect(card.getByText(COMPARE_LINE, { exact: true })).toBeVisible();
        await expect(card.getByRole('button', { name: /^Open picture: / })).toBeVisible();
        await expect(card.getByRole('button', { name: 'Acknowledge', exact: true })).toBeVisible();
        // No level word and no escalation level.
        await expect(card.getByText(/^(Info|Low|Medium|High|Critical)$/)).toHaveCount(0);
        await expect(card.getByText(/^Level \d/)).toHaveCount(0);
        await expect(card.locator('[data-escalation-bar]')).toHaveCount(0);

        // One kept set, as JPEG files; the watch saves no frame of its own for the check.
        await expect.poll(async () => keptRows(await readDatabase(page)).length, { timeout: 15_000 }).toBe(1);
        const reading = await readDatabase(page);
        const [row] = keptRows(reading);
        expect(row.kind).toBe('sighting');
        expect(row.frame).toMatchObject({ type: 'image/jpeg' });
        expect(row.closeUp).toMatchObject({ type: 'image/jpeg' });
        expect([row.frameWidth, row.frameHeight]).toEqual([WIDTH, HEIGHT]);
        expect(reading.matchFrames).toEqual([]);
        const saved = reading.alerts.find((alert) => alert.kind === 'sighting')!;
        expect(saved).toMatchObject({ kind: 'sighting', subjectName: 'Stripes', pictureId: row.id, severity: 'info' });
        expect(JSON.stringify(reading.alerts)).not.toContain('data:image');

        // Read once from the polite status.
        await expect(page.getByRole('status').filter({
          hasText: new RegExp(`^Could this be Stripes\\? Colours and shape like Stripes’s photos, at ${timePattern(time)}\\.`),
        })).toHaveCount(1);
      });
    });
  }
}

test.describe('A sighting on the watch, 390 px', () => {
  test.use({ viewport: { width: 390, height: 1000 } });

  test('the live picture boxes the sighting’s region for 10 seconds with Colours like Stripes’s', async ({ page, context }) => {
    test.setTimeout(240_000);
    await setUp(context);
    await stripedCamera(page);
    await watchForStripes(page);
    await expect(sightings(page).first()).toBeVisible({ timeout: 90_000 });
    const seen = Date.now();
    const plate = page.locator('.alert-live__plate');
    await expect(plate).toHaveText('Colours like Stripes’s', { timeout: 2_000 });
    await expect(page.locator('.alert-live__box')).toHaveCount(1);
    await expect(page.locator('.alert-live')).toHaveAttribute('aria-hidden', 'true');
    await page.waitForTimeout(Math.max(0, 6_000 - (Date.now() - seen)));
    await expect(plate).toHaveCount(1);
    await expect(plate).toHaveCount(0, { timeout: 6_000 });
    await expect(page.locator('.alert-live__box')).toHaveCount(0);
  });

  test('keeping off keeps no sighting picture', async ({ page, context }) => {
    test.setTimeout(240_000);
    await setUp(context, { pictures: { keep: false } });
    await stripedCamera(page);
    await watchForStripes(page);
    const card = sightings(page).first();
    const time = await timeOf(card);
    await expect(card.getByRole('img', { name: pictureName(time), exact: true })).toBeVisible();
    await expect(card.getByText('This picture is not kept. It goes when you reload or close the page.', { exact: true })).toBeVisible();
    expect((await readDatabase(page)).pictures).toEqual([]);
    await page.reload({ waitUntil: 'networkidle' });
    const after = sightings(page).first();
    await expect(after.getByText('No picture was kept for this alert.', { exact: true })).toBeVisible();
    await expect(after.getByText(QUESTION, { exact: true })).toBeVisible();
    await expect(after.getByRole('img', { name: /^What the camera saw/ })).toHaveCount(0);
    await expect(after.getByRole('button', { name: /^Open picture: / })).toHaveCount(0);
    expect((await readDatabase(page)).pictures).toEqual([]);
  });

  test('Delete all pictures deletes a sighting’s kept picture', async ({ page, context }) => {
    test.setTimeout(240_000);
    await setUp(context);
    await stripedCamera(page);
    await watchForStripes(page);
    const card = sightings(page).first();
    const time = await timeOf(card);
    await expect(card.getByRole('img', { name: pictureName(time), exact: true })).toBeVisible();
    await expect.poll(async () => keptRows(await readDatabase(page)).length, { timeout: 15_000 }).toBe(1);
    // The stripes leave, so no repeat keeps a newer picture after the delete.
    await page.evaluate(() => { window.__stripes!.hidden = true; });
    const head = page.getByRole('button', { name: /^Alert pictures/ });
    if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
    const group = page.getByRole('group', { name: 'Alert pictures', exact: true });
    await group.getByRole('button', { name: 'Delete all pictures', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete all pictures', exact: true }).click();
    await expect(group.getByText('No pictures kept on this device', { exact: true })).toBeVisible();
    await expect(card.getByText('You deleted its picture.', { exact: true })).toBeVisible();
    await expect(card.getByText(QUESTION, { exact: true })).toBeVisible();
    expect(keptRows(await readDatabase(page))).toEqual([]);
  });
});

test.describe('A sighting on the watch, 1280 px', () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test('a sighting that goes on repeats on its entry after the Cooldown Period, with its sound once an alert', async ({ page, context }) => {
    test.setTimeout(360_000);
    await setUp(context, {
      settings: { ...SIGHTINGS_ONLY, timingSettings: { cooldownPeriod: 30, minimumMotionDuration: 500, emergencyEscalationDelay: 300 } },
    });
    await stripedCamera(page);
    await countOwnSoundPasses(page);
    await page.goto('/lost-found/', { waitUntil: 'networkidle', timeout: 60_000 });
    // A short sound of the person's own for Lost Item Found, played once a start.
    await saveOwnSound(page);
    await watchForStripes(page);

    const card = sightings(page).first();
    const first = await timeOf(card);
    const firstSrc = await card.getByRole('img', { name: pictureName(first), exact: true }).getAttribute('src');
    await expect.poll(async () => (await ownSoundCounts(page)).passes, { timeout: 15_000 }).toBe(1);
    // Between alerts the checks go on twice a second and start no sound.
    await page.waitForTimeout(10_000);
    expect((await ownSoundCounts(page)).passes, 'the sound plays once an alert, not once a check').toBe(1);

    await expect(card.getByText('Repeated 2 times', { exact: true })).toBeVisible({ timeout: 90_000 });
    await expect(sightings(page)).toHaveCount(1);
    const newest = await timeOf(card);
    expect(newest).not.toBe(first);
    const newestPicture = card.getByRole('img', { name: pictureName(newest), exact: true });
    await expect(newestPicture).toBeVisible();
    expect(await newestPicture.getAttribute('src')).not.toBe(firstSrc);
    await expect.poll(async () => (await ownSoundCounts(page)).passes, { timeout: 15_000 }).toBe(3);
    // The store holds one set for the entry: the newest.
    await expect.poll(async () => keptRows(await readDatabase(page)).length, { timeout: 15_000 }).toBe(1);
    expect((await readDatabase(page)).matchFrames).toEqual([]);
  });

  test('the stripes gone for 40 seconds make the next sighting a new entry', async ({ page, context }) => {
    test.setTimeout(300_000);
    await setUp(context);
    await stripedCamera(page);
    await watchForStripes(page);
    await expect(sightings(page)).toHaveCount(1, { timeout: 90_000 });
    await page.evaluate(() => { window.__stripes!.hidden = true; });
    await page.waitForTimeout(40_000);
    await expect(sightings(page)).toHaveCount(1);
    await page.evaluate(() => { window.__stripes!.hidden = false; });
    await expect(sightings(page)).toHaveCount(2, { timeout: 60_000 });
    await expect(sightings(page).first().getByText(/^Repeated /)).toHaveCount(0);
    await expect.poll(async () => keptRows(await readDatabase(page)).length, { timeout: 15_000 }).toBe(2);
  });

  test('the sighting opens with the pet’s photo, and Save picture saves the camera’s picture', async ({ page, context }) => {
    test.setTimeout(240_000);
    await setUp(context);
    await stripedCamera(page);
    await watchForStripes(page);
    const card = sightings(page).first();
    const time = await timeOf(card);
    await expect.poll(async () => keptRows(await readDatabase(page)).length, { timeout: 15_000 }).toBe(1);
    const [row] = keptRows(await readDatabase(page));
    await card.getByRole('button', { name: /^Open picture: / }).click();
    const dialog = page.getByRole('dialog', { name: QUESTION, exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(new RegExp(`^${timePattern(time)}$`))).toBeVisible();
    await expect(dialog.getByRole('img', { name: pictureName(time), exact: true })).toBeVisible();
    await expect(dialog.locator('.alert-picture__box')).toHaveCount(1);
    const closeUp = dialog.getByRole('img', { name: closeUpName(time), exact: true });
    const petPhoto = dialog.getByRole('img', { name: PET_PHOTO, exact: true });
    await expect(closeUp).toBeVisible();
    await expect(petPhoto).toBeVisible();
    await expect(dialog.getByText(PET_PHOTO, { exact: true })).toBeVisible();
    expect((await petPhoto.boundingBox())!.y, 'the pet’s photo stands after the close-up').toBeGreaterThanOrEqual((await closeUp.boundingBox())!.y);

    // Save picture saves the camera's picture alone, with its box drawn in while the box shows.
    const [saved] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Save picture', exact: true }).click()]);
    expect(saved.suggestedFilename()).toMatch(/^safeos-lost-and-found-\d{4}-\d{2}-\d{2}-\d{6}\.jpg$/);
    const bytes = await readFile((await saved.path())!);
    const size = await page.evaluate((url) => new Promise<[number, number]>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve([image.naturalWidth, image.naturalHeight]);
      image.onerror = () => reject(new Error('the saved picture did not load'));
      image.src = url;
    }), `data:image/jpeg;base64,${bytes.toString('base64')}`);
    expect(size, 'the camera’s whole picture, not the two side by side').toEqual([row.frameWidth, row.frameHeight]);
    const edge = Math.round(row.box.x + row.box.width);
    const middle = Math.round(row.box.y + row.box.height / 2);
    if (edge < row.frameWidth - 2) {
      const across = await pixelsAt(page, `data:image/jpeg;base64,${bytes.toString('base64')}`, [[edge - 2, middle], [edge - 1, middle]]);
      expect(across.some((rgb) => near(rgb, '#4ade80', 60)), `the region’s box is drawn in (${JSON.stringify(across)})`).toBe(true);
    }
  });

  test('History lists the sighting with its picture, and an older frame with the same words', async ({ page, context }) => {
    test.setTimeout(240_000);
    await setUp(context);
    await stripedCamera(page);
    await watchForStripes(page);
    const card = sightings(page).first();
    const time = await timeOf(card);
    await expect.poll(async () => keptRows(await readDatabase(page)).length, { timeout: 15_000 }).toBe(1);

    // The watch's Lost and Found panel, shown while it compares, links to History.
    const link = page.getByRole('link', { name: 'Open in History', exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', /^\/history\/?$/);
    await expect(page.getByText('View Match History')).toHaveCount(0);

    // A frame an earlier version saved for this pet, with its own thumbnail and score.
    await page.evaluate(() => new Promise<void>((resolve, reject) => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 48;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'rgb(90, 120, 150)';
      ctx.fillRect(0, 0, 64, 48);
      const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
      const opening = indexedDB.open('safeos-guardian');
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const db = opening.result;
        const tx = db.transaction(['match_frame', 'subject_profile'], 'readwrite');
        const pets = tx.objectStore('subject_profile').getAll();
        pets.onsuccess = () => {
          const pet = pets.result.find((profile) => profile.name === 'Stripes');
          tx.objectStore('match_frame').put({
            id: 'match-earlier-1', subjectId: pet.id, frameData: thumbnail, thumbnailData: thumbnail, confidence: 82,
            timestamp: Date.now() - 3_600_000, details: { colorMatch: 80, dominantMatch: 70, edgeMatch: 60, sizeMatch: 50 },
            region: { x: 10, y: 10, width: 40, height: 40 }, acknowledged: false, notes: '', exported: false,
          });
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    }));

    await link.click();
    await page.waitForURL(/\/history\/?$/, { timeout: 30_000 });
    const rows = page.locator('[data-history-row]');
    const sighting = rows.filter({ hasText: time }).first();
    await expect(sighting.getByText(QUESTION, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(sighting.getByRole('img', { name: closeUpName(time), exact: true })).toBeVisible();
    await expect(sighting.getByRole('button', { name: /^Open picture: / })).toBeVisible();
    await expect(sighting.getByText(new RegExp(` at ${timePattern(time)}$`))).toBeVisible();
    await expect(sighting.getByText(/^(Info|Low|Medium|High|Critical)$/)).toHaveCount(0);

    // The earlier frame: its own thumbnail beside the same question, with no score.
    const earlier = page.locator('[data-history-row][data-earlier-frame]').first();
    await expect(earlier.getByText(QUESTION, { exact: true })).toBeVisible();
    await expect(earlier.getByRole('img')).toHaveCount(1);
    expect(await wordsOf(earlier)).not.toMatch(/82|%|match/i);

    // Both list under Lost & Found, and neither under Alerts.
    for (const row of [sighting, earlier]) expect(await wordsOf(row)).not.toMatch(FORBIDDEN);
    await sighting.getByRole('button', { name: /^Open picture: / }).click();
    const dialog = page.getByRole('dialog', { name: QUESTION, exact: true });
    await expect(dialog.getByRole('img', { name: PET_PHOTO, exact: true })).toBeVisible();
    expect(await wordsOf(dialog)).not.toMatch(FORBIDDEN);
  });

  test('the sighting’s notification carries its words and no pet photo', async ({ page, context }) => {
    test.setTimeout(240_000);
    await setUp(context, { notifications: {} });
    await stripedCamera(page);
    await watchForStripes(page);
    const card = sightings(page).first();
    const time = await timeOf(card);
    await expect.poll(async () => (await notesOf(page)).length, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
    const [note] = await notesOf(page);
    expect(note.title).toBe(QUESTION);
    expect((note.body ?? '').replace(/\s+/g, ' ')).toBe(`Colours and shape like Stripes’s photos, ${time}.`);
    expect(note.image ?? null, 'no picture while the switch is off').toBeNull();
    expect(note.icon ?? '', 'the pet’s photo is never the notification’s icon').not.toMatch(/^(data|blob):/);
    expect(`${note.title} ${note.body ?? ''}`).not.toMatch(FORBIDDEN);
    // No word of the entry says match, detected, found, recognise, identify, confidence or a percentage.
    expect(await wordsOf(card)).not.toMatch(FORBIDDEN);
    await expect(page.getByRole('link', { name: 'Open in History', exact: true })).toBeVisible();
  });

  test('with the switch on, the sighting’s notification carries the camera’s picture and no pet photo', async ({ page, context }) => {
    test.setTimeout(240_000);
    await setUp(context, { pictures: { inNotifications: true }, notifications: {} });
    await stripedCamera(page);
    await watchForStripes(page);
    await expect(sightings(page).first()).toBeVisible({ timeout: 90_000 });
    await expect.poll(async () => (await notesOf(page)).length, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
    const [note] = await notesOf(page);
    expect(note.title).toBe(QUESTION);
    expect(note.image).toMatch(/^data:image\/jpeg;base64,/);
    expect(note.icon ?? '').not.toMatch(/^(data|blob):/);
    const size = await page.evaluate((url) => new Promise<[number, number]>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve([image.naturalWidth, image.naturalHeight]);
      image.onerror = () => reject(new Error('the notification’s picture did not load'));
      image.src = url;
    }), note.image!);
    expect(size, 'the camera’s picture at 640 px on its long edge').toEqual([WIDTH, HEIGHT]);
    // The region's box is drawn in: its green line stands at the box's left edge.
    await expect.poll(async () => keptRows(await readDatabase(page)).length, { timeout: 15_000 }).toBe(1);
    const [row] = keptRows(await readDatabase(page));
    const middle = Math.round(row.box.y + row.box.height / 2);
    const left = Math.round(row.box.x);
    const across = await pixelsAt(page, note.image!, [[left, middle], [left + 1, middle], [left + 2, middle], [left + 3, middle]]);
    expect(across.filter((rgb) => near(rgb, '#4ade80', 60)).length, `the region’s box is drawn in (${JSON.stringify(across)})`).toBeGreaterThanOrEqual(2);
  });
});
