/**
 * Alert pictures: each Motion, Picture change and Sound alert keeps the
 * camera's picture of the moment, a box round what set it off and a
 * close-up of that box, in the browser's database on this device.
 *
 * The walks open the built site in desktop Chromium with a camera handed to
 * the page: Chromium's fake camera playing the committed sample clip, or a
 * canvas stream whose moving part is redrawn at random grey levels (as
 * e2e/alerts-repeat.spec.ts draws it). The page's own detectors raise the
 * alerts. The database is read and written on the walk's own connections.
 *
 * Run in CI by ci.yml's "Web app alert walk" job against the static export.
 */

import { test, expect, type BrowserContext, type Locator, type Page } from '@playwright/test';

import {
  BLOCK_READABILITY,
  CUSTOM_PRESET,
  LEFT_THIRD,
  MOTION_ONLY,
  canvasCamera,
  clipSettings,
  cooldownPeriod,
  doubleText,
  faultPictureStore,
  keptPicture,
  naturalSize,
  near,
  pixelsAt,
  pngUrl,
  readDatabase,
  readable,
  redatePicture,
  requireSampleClip,
  routedServer,
  sampleClipLaunch,
  savedAlert,
  scrollsSideways,
  seedDevice,
  seedPictureRows,
  seedVersion7,
  setFault,
  startWatching,
  type CanvasCamera,
  type DatabaseReading,
  type PicturesSeed,
} from './helpers/alert-pictures';

// One launch for the whole file (Playwright takes launch options at the top
// of a file only): Chromium's fake camera and microphone play the sample
// clip. A walk that hands the page a canvas camera replaces getUserMedia, so
// it never reads the clip.
test.use({
  permissions: ['camera', 'microphone'],
  launchOptions: { args: sampleClipLaunch() },
});

// The camera stand-ins and the camera grants need desktop Chromium, as the
// alert walk does; under the other projects the walk skips.
test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'the alert pictures walk runs in desktop Chromium',
);

/** The database, or null while the page holds it mid-reload. */
async function databaseNow(page: Page): Promise<DatabaseReading | null> {
  try {
    return await readDatabase(page);
  } catch {
    return null;
  }
}

const monitoringAlerts = (reading: DatabaseReading | null) => (reading?.alerts ?? []).filter((row) => row.monitoring === true);

test.describe('The picture store and the alert record', () => {
  test('a device saved by the release before this one keeps every alert and frame', async ({ page, context }) => {
    await seedDevice(context, { pictures: { noticeAnswered: true } });
    const alert = savedAlert('motion-1763500000000-abcdefg', 1763500000000);
    const matchFrame = {
      id: 'match-1763500000000',
      subjectId: 'subject-stripes',
      frameData: '',
      thumbnailData: '',
      confidence: 82,
      timestamp: 1763500000000,
      details: { colorMatch: 80, dominantMatch: 70, edgeMatch: 60, sizeMatch: 50 },
      region: { x: 10, y: 10, width: 40, height: 40 },
      acknowledged: false,
      notes: '',
      exported: false,
    };
    const subject = {
      id: 'subject-stripes',
      name: 'Stripes',
      type: 'pet',
      description: '',
      fingerprint: null,
      referenceImages: [],
      createdAt: new Date(1763400000000).toISOString(),
      lastActiveAt: null,
      matchCount: 1,
    };
    await seedVersion7(page, { alerts: [alert], matchFrames: [matchFrame], subjects: [subject] });

    await page.goto('/monitor/', { waitUntil: 'networkidle' });
    await expect.poll(async () => (await databaseNow(page))?.version, { timeout: 15_000 }).toBe(8);
    const reading = (await databaseNow(page))!;
    expect(reading.stores).toContain('alert_picture');
    expect(reading.alerts).toEqual([alert]);
    expect(reading.matchFrames).toEqual([matchFrame]);
    expect(reading.pictures).toEqual([]);
  });

  test('Clear All Local Data leaves no alert picture', async ({ page, context }) => {
    await seedDevice(context, { pictures: { noticeAnswered: true } });
    const at = Date.now() - 60_000;
    await seedPictureRows(page, [
      { alert: savedAlert('motion-1-aaaaaaa', at, { pictureId: 'picture-1-aaaaaaa', kind: 'motion' }), picture: keptPicture('picture-1-aaaaaaa', at) },
      { alert: savedAlert('motion-2-bbbbbbb', at + 1_000, { pictureId: 'picture-2-bbbbbbb', kind: 'motion' }), picture: keptPicture('picture-2-bbbbbbb', at + 1_000) },
    ]);
    expect((await readDatabase(page)).pictures).toHaveLength(2);

    await page.goto('/settings/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Privacy' }).click();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Clear All Local Data' }).click();

    await expect.poll(async () => {
      const reading = await databaseNow(page);
      return reading ? { pictures: reading.pictures.length, alerts: monitoringAlerts(reading).length } : null;
    }, { timeout: 15_000 }).toEqual({ pictures: 0, alerts: 0 });
  });

  test('the 101st alert takes the oldest alert\'s picture with it', async ({ page, context }) => {
    test.setTimeout(120_000);
    await seedDevice(context, { settings: { ...MOTION_ONLY, timingSettings: cooldownPeriod(20) }, pictures: { noticeAnswered: true } });
    await canvasCamera(page, LEFT_THIRD);
    const oldest = 1763400000000;
    const rows = Array.from({ length: 100 }, (_, i) => {
      const at = oldest + i * 60_000;
      const tail = i === 0 ? 'aaaaaaa' : `k${String(i).padStart(6, '0')}`;
      return {
        alert: savedAlert(`motion-${at}-${tail}`, at, { acknowledged: true, kind: 'motion', pictureId: `picture-${at}-${tail}` }),
        picture: keptPicture(`picture-${at}-${tail}`, at),
      };
    });
    await seedPictureRows(page, rows);
    expect(monitoringAlerts(await readDatabase(page))).toHaveLength(100);

    await page.goto('/monitor/', { waitUntil: 'networkidle' });
    await startWatching(page);

    await expect.poll(async () => {
      const reading = await databaseNow(page);
      return reading ? monitoringAlerts(reading).some((row) => row.id === 'motion-1763400000000-aaaaaaa') : true;
    }, { timeout: 60_000, message: 'the oldest alert leaves when the 101st is saved' }).toBe(false);
    const reading = (await readDatabase(page))!;
    expect(monitoringAlerts(reading)).toHaveLength(100);
    expect(reading.pictures.map((row) => row.id)).not.toContain('picture-1763400000000-aaaaaaa');
    expect(reading.pictures.filter((row) => row.state === 'kept').length).toBeLessThanOrEqual(100);
  });
});

// =============================================================================
// Each alert's picture on today's card
// =============================================================================

const TIME = String.raw`\d{1,2}:\d{2}:\d{2}(?:\s?[AP]M)?`;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LEVELS = /^(Low|Medium|High|Critical)$/;

const cards = (page: Page) => page.locator('[data-alert-card]');
const kindLine = (kind: string) => new RegExp(`^${kind} at ${TIME}$`);

/** The time a card's "{kind} at {time}" line shows. */
async function timeOf(card: Locator, kind: string): Promise<string> {
  const line = card.getByText(kindLine(kind)).first();
  await expect(line).toBeVisible({ timeout: 120_000 });
  // The device's own time format may hold a narrow space before AM or PM; names are matched with plain spaces.
  return ((await line.textContent()) ?? '').replace(/\s+/g, ' ').replace(`${kind} at `, '').trim();
}

const pictureName = (time: string, boxed: boolean) =>
  boxed ? `What the camera saw at ${time}. A box marks what changed.` : `What the camera saw at ${time}.`;
const closeUpName = (time: string) => `Close-up of the boxed part at ${time}`;

/**
 * Waits for the watch's first card, then makes `count` events in all: the
 * picture holds still, so the event ends, then it moves again.
 */
async function raiseEvents(page: Page, count: number, from = 1): Promise<void> {
  for (let n = from; n <= count; n++) {
    if (n > from || from > 1) {
      await page.evaluate(() => { window.__camera!.moving.width = 0; });
      await page.waitForTimeout(3_000);
      await page.evaluate(() => { window.__camera!.moving.width = 1 / 3; });
    }
    await expect(cards(page)).toHaveCount(n, { timeout: 40_000 });
  }
}

/** Opens the watch with the device, the camera and the width given, and starts watching. */
async function watchWith(page: Page, context: BrowserContext, options: {
  settings: Record<string, unknown>;
  camera?: CanvasCamera;
  pictures?: PicturesSeed;
}): Promise<void> {
  await seedDevice(context, { settings: options.settings, pictures: options.pictures ?? { noticeAnswered: true } });
  if (options.camera) await canvasCamera(page, options.camera);
  await page.goto('/monitor/', { waitUntil: 'networkidle' });
  await startWatching(page);
}

/**
 * The lines of the picture block's box, read on a screenshot of the picture
 * along a row or column through the middle of one of the box's edges, from
 * outside the box inwards: how many pixels of the dark line stand before the
 * green line and how wide the green line is. The edge read is the first of
 * left, right, top and bottom that stands inside the picture, where the dark
 * line has room.
 */
async function boxLines(page: Page, frame: Locator): Promise<{ greenWidth: number; darkWidth: number; row: string }> {
  const box = frame.locator('.alert-picture__box');
  await expect(box).toHaveCount(1);
  const frameRect = (await frame.boundingBox())!;
  const boxRect = (await box.boundingBox())!;
  const shot = await frame.screenshot({ animations: 'disabled' });
  const left = Math.round(boxRect.x - frameRect.x);
  const top = Math.round(boxRect.y - frameRect.y);
  const right = Math.round(boxRect.x + boxRect.width - frameRect.x);
  const bottom = Math.round(boxRect.y + boxRect.height - frameRect.y);
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;
  const steps = Array.from({ length: 10 }, (_, i) => i - 4);
  const edges: Array<{ room: boolean; points: Array<[number, number]> }> = [
    { room: left >= 3, points: steps.map((i) => [left + i, midY]) },
    { room: right <= frameRect.width - 3, points: steps.map((i) => [right - 1 - i, midY]) },
    { room: top >= 3, points: steps.map((i) => [midX, top + i]) },
    { room: bottom <= frameRect.height - 3, points: steps.map((i) => [midX, bottom - 1 - i]) },
  ];
  const edge = edges.find((candidate) => candidate.room);
  expect(edge, 'one edge of the box stands inside the picture').toBeTruthy();
  const row = await pixelsAt(page, pngUrl(shot), edge!.points);
  const firstGreen = row.findIndex((rgb) => near(rgb, '#4ade80'));
  let greenWidth = 0;
  while (firstGreen >= 0 && firstGreen + greenWidth < row.length && near(row[firstGreen + greenWidth], '#4ade80')) greenWidth += 1;
  let darkWidth = 0;
  while (firstGreen - 1 - darkWidth >= 0 && near(row[firstGreen - 1 - darkWidth], '#0b131b', 12)) darkWidth += 1;
  return { greenWidth, darkWidth, row: JSON.stringify(row) };
}

/** A time as a card shows it, for a pattern: the device may write a narrow space before AM or PM. */
const timePattern = (time: string) => escape(time).replace(/ /g, '\\s');

for (const look of ['dark', 'light'] as const) {
  for (const width of [390, 1280]) {
    test.describe(`The card on the sample clip, ${width} px, ${look}`, () => {
      test.use({ colorScheme: look, viewport: { width, height: 900 } });
      test.beforeEach(() => requireSampleClip());

      test(`a Motion alert's card shows the camera's picture with one box, with no line reading Motion detected, ${width} px, ${look}`, async ({ page, context }) => {
        test.setTimeout(180_000);
        await watchWith(page, context, { settings: clipSettings({ motion: true, sound: false }) });
        const card = cards(page).first();
        const time = await timeOf(card, 'Motion');

        // The clip's camera moves, so its first alert's changed cells cover the frame: one box,
        // round all of it. A box over half of the frame has no close-up; the close-up and the
        // box's two lines are read on the canvas camera below, whose change is a third of the frame.
        const picture = card.getByRole('img', { name: pictureName(time, true), exact: true });
        await expect(picture).toBeVisible();
        expect(await naturalSize(picture)).toEqual({ width: 640, height: 480 });
        await expect(card.locator('.alert-picture__frame .alert-picture__box')).toHaveCount(1);
        await expect(card.getByText(/^Level 1$/)).toBeVisible();
        await expect(card.getByRole('button', { name: 'Acknowledge', exact: true })).toBeVisible();
        expect(await page.locator('body').innerText()).not.toMatch(/Motion detected/);
        await expect(page.getByRole('status').filter({ hasText: new RegExp(`^New alert: Motion, (Low|Medium|High|Critical), at ${timePattern(time)}\\.`) })).toHaveCount(1);
      });
    });

    test.describe(`The card's box and close-up, ${width} px, ${look}`, () => {
      test.use({ colorScheme: look, viewport: { width, height: 900 } });

      test(`a Motion alert's box is a 2 px green line inside a dark line, and its close-up stands beside the kind and time, ${width} px, ${look}`, async ({ page, context }) => {
        test.setTimeout(120_000);
        await watchWith(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD });
        const card = cards(page).first();
        const time = await timeOf(card, 'Motion');

        const picture = card.getByRole('img', { name: pictureName(time, true), exact: true });
        await expect(picture).toBeVisible();
        const frame = card.locator('.alert-picture__frame').first();
        const lines = await boxLines(page, frame);
        expect(lines.greenWidth, `the box's line is 2 px of #4ade80 (the row reads ${lines.row})`).toBe(2);
        expect(lines.darkWidth, `1 px of #0b131b stands outside the green line (the row reads ${lines.row})`).toBeGreaterThanOrEqual(1);

        const closeUp = card.getByRole('img', { name: closeUpName(time), exact: true });
        await expect(closeUp).toBeVisible();
        await expect(card.getByText('Close-up', { exact: true })).toBeVisible();
        if (width === 390) {
          const tile = (await card.locator('.alert-picture__tile', { has: closeUp }).boundingBox())!;
          expect(Math.round(tile.width)).toBe(112);
          expect(Math.round(tile.height)).toBe(84);
          const line = (await card.getByText(kindLine('Motion')).boundingBox())!;
          expect(line.x, 'the kind and time stand beside the close-up').toBeGreaterThanOrEqual(tile.x + tile.width);
        } else {
          // The newest card at 1280 px: one row of two pictures at the same height.
          const shown = (await picture.boundingBox())!;
          const cut = (await closeUp.boundingBox())!;
          expect(Math.abs(shown.y - cut.y)).toBeLessThanOrEqual(2);
          expect(Math.abs(shown.height - cut.height)).toBeLessThanOrEqual(2);
          expect(cut.x).toBeGreaterThanOrEqual(shown.x + shown.width);
        }
        await expect(card.getByText(/^Level 1$/)).toBeVisible();
        await expect(card.getByRole('button', { name: 'Acknowledge', exact: true })).toBeVisible();
      });
    });
  }
}

for (const look of ['dark', 'light'] as const) {
  test.describe(`The Sound card on the sample clip, 1280 px, ${look}`, () => {
    test.use({ colorScheme: look, viewport: { width: 1280, height: 900 } });
    test.beforeEach(() => requireSampleClip());

    test(`a Sound alert's card shows the picture with no box and says what the camera saw when the sound came, ${look}`, async ({ page, context }) => {
      test.setTimeout(180_000);
      await watchWith(page, context, { settings: clipSettings({ motion: false, sound: true }) });
      const card = cards(page).first();
      const time = await timeOf(card, 'Sound');
      await expect(card.getByRole('img', { name: pictureName(time, false), exact: true })).toBeVisible();
      await expect(card.getByText('What the camera saw when the sound came.', { exact: true })).toBeVisible();
      await expect(card.locator('.alert-picture__box')).toHaveCount(0);
      await expect(card.getByRole('img', { name: /^Close-up/ })).toHaveCount(0);
    });

    test(`two cards stand whole and the list scrolls with the page, ${look}`, async ({ page, context }) => {
      test.setTimeout(180_000);
      await watchWith(page, context, { settings: clipSettings({ motion: true, sound: true }) });
      await expect(cards(page).getByText(kindLine('Motion'))).toBeVisible({ timeout: 120_000 });
      await expect(cards(page).getByText(kindLine('Sound'))).toBeVisible({ timeout: 120_000 });
      await expect(cards(page)).toHaveCount(2);
      const scrolling = await cards(page).first().evaluate((card) => {
        const found: string[] = [];
        for (let node = card.parentElement; node && node !== document.body; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) found.push(node.className);
        }
        return found;
      });
      expect(scrolling, 'no box between a card and the page scrolls').toEqual([]);
    });
  });
}

test.describe('The card on a canvas camera, 1280 px', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('a repeat puts the newest picture and time on the card and keeps focus', async ({ page, context }) => {
    test.setTimeout(150_000);
    await watchWith(page, context, { settings: { ...MOTION_ONLY, timingSettings: cooldownPeriod(20) }, camera: LEFT_THIRD });
    const card = cards(page).first();
    const first = await timeOf(card, 'Motion');
    const picture = card.getByRole('img', { name: pictureName(first, true), exact: true });
    await expect(picture).toBeVisible();
    const firstSrc = await picture.getAttribute('src');
    const mute = page.getByRole('button', { name: /^(Mute|Unmute) alerts$/ });
    await mute.focus();
    await expect(card.getByText('Repeated 1 time', { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(cards(page)).toHaveCount(1);
    const later = await timeOf(card, 'Motion');
    expect(later).not.toBe(first);
    const newer = card.getByRole('img', { name: pictureName(later, true), exact: true });
    await expect(newer).toBeVisible();
    expect(await newer.getAttribute('src')).not.toBe(firstSrc);
    expect(await mute.evaluate((el) => el === document.activeElement), 'a repeat never moves focus').toBe(true);
  });

  test('Stop right after an alert keeps that alert\'s own picture', async ({ page, context }) => {
    test.setTimeout(120_000);
    await watchWith(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD });
    const card = cards(page).first();
    await expect(card).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Stop Monitoring', exact: true }).click();
    const time = await timeOf(card, 'Motion');
    const picture = card.getByRole('img', { name: pictureName(time, true), exact: true });
    await expect(picture).toBeVisible();
    const size = await naturalSize(picture);
    const src = (await picture.getAttribute('src'))!;
    // The left third is redrawn at grey levels 0 to 255 every 40 ms; the rest is a flat 128.
    const left = Array.from({ length: 24 }, (_, i) => [((i % 6) + 0.5) * size.width / 18, (Math.floor(i / 6) + 0.5) * size.height / 4] as [number, number]);
    const right = Array.from({ length: 6 }, (_, i) => [size.width * (0.6 + i * 0.06), size.height / 2] as [number, number]);
    const leftGreys = (await pixelsAt(page, src, left)).map(([r]) => r);
    const rightGreys = (await pixelsAt(page, src, right)).map(([r]) => r);
    const spread = Math.max(...leftGreys) - Math.min(...leftGreys);
    expect(spread, `the moving third shows its changing greys (${leftGreys})`).toBeGreaterThan(60);
    for (const grey of rightGreys) expect(Math.abs(grey - 128), `the still part is its flat grey (${rightGreys})`).toBeLessThanOrEqual(16);
  });

  test('an acknowledged card keeps its picture', async ({ page, context }) => {
    test.setTimeout(120_000);
    await watchWith(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD });
    const card = cards(page).first();
    const time = await timeOf(card, 'Motion');
    await card.getByRole('button', { name: 'Acknowledge', exact: true }).click();
    await page.getByRole('button', { name: /^Expand 1 acknowledged alert$/ }).click();
    const acknowledged = page.locator('[data-alert-card][data-acknowledged]').first();
    await expect(acknowledged.getByRole('img', { name: new RegExp(`^(${escape(closeUpName(time))}|${escape(pictureName(time, true))})$`) })).toBeVisible();
    await expect(acknowledged.getByText(kindLine('Motion'))).toBeVisible();
  });

  test('a repeat acknowledged in a second tab goes on a fresh card with its own picture', async ({ page, context }) => {
    test.setTimeout(150_000);
    await watchWith(page, context, {
      settings: { ...MOTION_ONLY, timingSettings: cooldownPeriod(10) },
      camera: { ...LEFT_THIRD, moving: { x: 0, y: 0, width: 1, height: 1 } },
    });
    const card = cards(page).first();
    const first = await timeOf(card, 'Motion');
    const other = await context.newPage();
    await other.goto('/about/', { waitUntil: 'domcontentloaded' });
    await expect.poll(async () => monitoringAlerts(await databaseNow(other)).length, { timeout: 15_000 }).toBe(1);
    const [saved] = monitoringAlerts(await readDatabase(other));
    await other.evaluate((id) => new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('safeos-guardian');
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('alert_cache', 'readwrite');
        const store = tx.objectStore('alert_cache');
        const read = store.get(id);
        read.onsuccess = () => { store.put({ ...read.result, acknowledged: true, acknowledgementOrder: 0 }); };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
      open.onerror = () => reject(open.error);
    }), saved.id as string);
    // The event's next alert finds its card acknowledged and goes on a fresh card.
    await expect.poll(async () => monitoringAlerts(await databaseNow(other)).length, { timeout: 40_000 }).toBe(2);
    await other.close();
    const fresh = page.locator('[data-alert-card]:not([data-acknowledged])').first();
    const later = await timeOf(fresh, 'Motion');
    await expect(fresh.getByRole('img', { name: pictureName(later, true), exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Expand \d+ acknowledged alerts?$/ }).click();
    const kept = page.locator('[data-alert-card][data-acknowledged]').first();
    await expect(kept.getByText(`Motion at ${first}`, { exact: true })).toBeVisible();
    await expect(kept.getByRole('img', { name: new RegExp(`at ${escape(first)}`) })).toBeVisible();
  });

  test('a Picture change alert in instant mode shows the picture alone', async ({ page, context }) => {
    test.setTimeout(120_000);
    await watchWith(page, context, { settings: { activePresetId: 'infant_sleep' }, camera: LEFT_THIRD });
    const card = cards(page).filter({ has: page.getByText(kindLine('Picture change')) }).first();
    const time = await timeOf(card, 'Picture change');
    await expect(card.getByRole('img', { name: pictureName(time, false), exact: true })).toBeVisible();
    await expect(card.locator('.alert-picture__box')).toHaveCount(0);
    await expect(card.getByRole('img', { name: /^Close-up/ })).toHaveCount(0);
  });

  test('a Picture change close-up with no reading says light or a shadow can set it off', async ({ page, context }) => {
    test.setTimeout(120_000);
    await watchWith(page, context, {
      settings: { activePresetId: 'custom', globalSettings: { ...CUSTOM_PRESET, pixelDetectionEnabled: true, motionDetectionEnabled: false } },
      camera: LEFT_THIRD,
    });
    const card = cards(page).first();
    const time = await timeOf(card, 'Picture change');
    await expect(card.getByRole('img', { name: closeUpName(time), exact: true })).toBeVisible();
    const line = card.getByText('Light or a shadow can set off a Picture change alert.', { exact: true });
    await expect(line).toBeVisible();
    expect(await line.evaluate((el) => el.classList.contains('alert-picture__quiet'))).toBe(true);
  });

  test('a portrait camera\'s picture stands whole in a 4:3 tile with its box on the change', async ({ page, context }) => {
    test.setTimeout(120_000);
    // The moving part is five whole rows of the motion check's 16 by 12 grid (cells 45 by 106 px),
    // across the picture: two fifths of the frame, over the watch's line and under half.
    const moving = { x: 0, y: 318 / 1280, width: 1, height: 530 / 1280 };
    await watchWith(page, context, { settings: MOTION_ONLY, camera: { width: 720, height: 1280, background: 128, moving, levels: [0, 85, 170, 255] } });
    const card = cards(page).first();
    const time = await timeOf(card, 'Motion');
    const picture = card.getByRole('img', { name: pictureName(time, true), exact: true });
    await expect(picture).toBeVisible();
    const frame = card.locator('.alert-picture__frame').first();
    const tile = (await frame.boundingBox())!;
    expect(Math.abs(tile.width / tile.height - 4 / 3), 'the tile is 4:3').toBeLessThanOrEqual(0.02);
    expect(await picture.evaluate((img) => getComputedStyle(img).objectFit)).toBe('contain');
    // The picture stands whole: its height fills the tile and its width is 720/1280 of that.
    const shownWidth = tile.height * 720 / 1280;
    const left = tile.x + (tile.width - shownWidth) / 2;
    const scale = tile.height / 1280;
    const want = { x: left, y: tile.y + 318 * scale, width: 720 * scale, height: 530 * scale };
    const drawn = (await frame.locator('.alert-picture__box').boundingBox())!;
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(drawn[key] - want[key]), `the box's ${key} (${drawn[key]} against ${want[key]})`).toBeLessThanOrEqual(2);
    }
  });

  test('a box over half of the frame has no close-up', async ({ page, context }) => {
    test.setTimeout(120_000);
    await watchWith(page, context, { settings: MOTION_ONLY, camera: { ...LEFT_THIRD, moving: { x: 0, y: 0, width: 0.75, height: 1 } } });
    const card = cards(page).first();
    const time = await timeOf(card, 'Motion');
    await expect(card.getByRole('img', { name: pictureName(time, true), exact: true })).toBeVisible();
    await expect(card.locator('.alert-picture__box')).toHaveCount(1);
    await expect(card.getByRole('img', { name: /^Close-up/ })).toHaveCount(0);
    await expect(card.getByText('Close-up', { exact: true })).toHaveCount(0);
  });

  test('a dark picture carries the night light line', async ({ page, context }) => {
    test.setTimeout(120_000);
    await watchWith(page, context, { settings: MOTION_ONLY, camera: { ...LEFT_THIRD, background: 10, levels: [0, 40, 80] } });
    const card = cards(page).first();
    const time = await timeOf(card, 'Motion');
    await expect(card.getByRole('img', { name: pictureName(time, true), exact: true })).toBeVisible();
    await expect(card.getByRole('img', { name: closeUpName(time), exact: true })).toBeVisible();
    const line = card.getByText('This picture is too dark to show much. With a night light in the room, the camera shows more.', { exact: true });
    await expect(line).toBeVisible();
    expect(await line.evaluate((el) => el.classList.contains('alert-picture__quiet'))).toBe(true);
  });
});

test.describe('The card for an alert of another kind or one saved before pictures', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('an inactivity alert keeps its message line and shows no picture', async ({ page, context }) => {
    await seedDevice(context, { pictures: { noticeAnswered: true } });
    await seedPictureRows(page, [{ alert: savedAlert('inactivity-1763500000000-abcdefg', Date.now() - 60_000, { message: 'Inactivity: no motion for 5 minutes' }) }]);
    await page.goto('/monitor/', { waitUntil: 'networkidle' });
    const card = cards(page).first();
    await expect(card.getByText('Inactivity: no motion for 5 minutes', { exact: true })).toBeVisible();
    await expect(card.locator('.alert-picture')).toHaveCount(0);
    await expect(card.getByRole('img')).toHaveCount(0);
  });

  test('an alert saved before pictures shows its card with no picture kept', async ({ page, context }) => {
    await seedDevice(context, { pictures: { noticeAnswered: true } });
    const at = Date.now() - 60_000;
    await seedPictureRows(page, [{ alert: savedAlert('motion-1763500000000-abcdefg', at) }]);
    await page.goto('/monitor/', { waitUntil: 'networkidle' });
    const card = cards(page).first();
    await expect(card.getByText(kindLine('Motion'))).toBeVisible();
    await expect(card.getByText('No picture was kept for this alert.', { exact: true })).toBeVisible();
    const glyph = card.locator('.alert-picture__empty');
    await expect(glyph).toHaveCount(1);
    await expect(glyph).toHaveAttribute('aria-hidden', 'true');
    await expect(card.getByText(/Motion detected/)).toHaveCount(0);
  });
});

for (const width of [390, 1280]) {
  test.describe(`Three events on a canvas camera, ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test(`the newest card shows its pictures large and older cards a thumbnail, ${width} px`, async ({ page, context }) => {
      test.setTimeout(150_000);
      await watchWith(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD });
      await raiseEvents(page, 3);
      const [newest, ...older] = await cards(page).all();
      for (const card of [newest, ...older]) await expect(card.locator('.alert-picture img').first()).toBeVisible();
      await expect(newest.locator('.alert-picture')).toHaveAttribute('data-form', 'large');
      const frame = (await newest.locator('.alert-picture__frame').boundingBox())!;
      const block = (await newest.locator('.alert-picture').boundingBox())!;
      if (width === 390) {
        expect(frame.width, 'the picture takes the card').toBeGreaterThanOrEqual(block.width - 24);
      } else {
        const cut = (await newest.locator('.alert-picture__tile').first().boundingBox())!;
        expect(Math.abs(frame.y - cut.y), 'the two pictures stand in one row').toBeLessThanOrEqual(2);
        expect(cut.x).toBeGreaterThanOrEqual(frame.x + frame.width);
      }
      for (const card of older) {
        await expect(card.locator('.alert-picture')).toHaveAttribute('data-form', 'small');
        const tile = (await card.locator('.alert-picture__tile').first().boundingBox())!;
        expect(Math.round(tile.width)).toBe(112);
        expect(Math.round(tile.height)).toBe(84);
        await expect(card.getByText(kindLine('Motion'))).toBeVisible();
      }
      if (width === 1280) {
        const top = (await cards(page).first().boundingBox())!.y;
        const last = (await cards(page).last().boundingBox())!;
        expect(last.y + last.height - top, 'the three cards together').toBeLessThanOrEqual(720);
      }
    });
  });
}

for (const look of ['dark', 'light'] as const) {
  for (const width of [320, 768, 1440]) {
    test.describe(`The card's layout at ${width} px, ${look}`, () => {
      test.use({ colorScheme: look, viewport: { width, height: 900 } });

      test(`the newest card at ${width} px${width === 320 ? ' and at 200 per cent text' : ''}, ${look}`, async ({ page, context }) => {
        test.setTimeout(120_000);
        await watchWith(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD });
        const card = cards(page).first();
        await timeOf(card, 'Motion');
        await expect(card.locator('.alert-picture__frame img')).toBeVisible();
        await expect(card.locator('.alert-picture__tile img')).toBeVisible();
        const blockOf = async () => (await card.locator('.alert-picture').boundingBox())!;
        const frameOf = async () => (await card.locator('.alert-picture__frame').boundingBox())!;
        const tileOf = async () => (await card.locator('.alert-picture__tile').first().boundingBox())!;
        if (width === 768) {
          const block = await blockOf();
          const middle = block.x + block.width / 2;
          expect((await frameOf()).x + (await frameOf()).width, 'the picture in the left half').toBeLessThanOrEqual(middle + 2);
          expect((await tileOf()).x, 'the close-up in the right half').toBeGreaterThanOrEqual(middle - 2);
        }
        if (width === 1440) {
          const frame = await frameOf();
          const tile = await tileOf();
          expect(Math.abs(frame.y - tile.y)).toBeLessThanOrEqual(2);
          expect(tile.x).toBeGreaterThanOrEqual(frame.x + frame.width);
        }
        expect(await scrollsSideways(page)).toBe(false);
        const block = card.locator('.alert-picture');
        expect(await block.evaluate((el) => Array.from(el.querySelectorAll('*')).filter((child) => {
          const style = getComputedStyle(child);
          return style.overflow === 'hidden' && child.scrollWidth > child.clientWidth + 1 && !(child instanceof HTMLImageElement);
        }).length), 'nothing in the block is cut').toBe(0);
        if (width === 320) {
          await doubleText(page);
          // The card adds no sideways scroll of its own: nothing in it reaches past its edge.
          // A key in a row that scrolls inside itself is reached by scrolling the row.
          expect(await card.evaluate((el) => {
            const edge = el.getBoundingClientRect().right;
            return Array.from(el.querySelectorAll('*'))
              .filter((child) => !child.closest('.alert-pictures-keys[data-overflows] .alert-pictures-keys__row'))
              .filter((child) => child.getBoundingClientRect().right > edge + 1)
              .map((child) => `${child.tagName.toLowerCase()}.${child.getAttribute('class') ?? ''}`);
          }), 'nothing in the card reaches past its edge at 200 per cent').toEqual([]);
          const acknowledge = card.getByRole('button', { name: 'Acknowledge', exact: true });
          await expect(acknowledge).toBeVisible();
          expect(await block.evaluate((el) => Array.from(el.querySelectorAll('p, span')).filter((child) => child.scrollWidth > child.clientWidth + 1).length), 'no line in the block is cut at 200 per cent').toBe(0);
        }
      });
    });
  }
}

for (const look of ['dark', 'light'] as const) {
  for (const width of [390, 1280]) {
    test.describe(`The card's words, ${width} px, ${look}`, () => {
      test.use({ colorScheme: look, viewport: { width, height: 900 } });

      test(`the card's words meet the sizes and contrast in both looks, ${width} px, ${look}`, async ({ page, context }) => {
        await seedDevice(context, { pictures: { noticeAnswered: true } });
        const now = Date.now();
        const severities = ['info', 'low', 'medium', 'high', 'critical'];
        await seedPictureRows(page, severities.map((severity, i) => {
          const at = now - (i + 1) * 30_000;
          return {
            alert: savedAlert(`motion-${at}-words${i}x`, at, { severity, kind: 'motion', pictureId: `picture-${at}-words${i}x` }),
            picture: keptPicture(`picture-${at}-words${i}x`, at),
          };
        }));
        await page.goto('/monitor/', { waitUntil: 'networkidle' });
        await expect(cards(page)).toHaveCount(5);
        for (const card of await cards(page).all()) {
          await expect(card.locator('.alert-picture img').first()).toBeVisible();
          const faults = await readable(card, BLOCK_READABILITY);
          expect(faults, `the card's words (${await card.innerText()})`).toEqual([]);
        }
      });
    });
  }
}

for (const reduced of [true, false]) {
  test.describe(`The fourth level's bar${reduced ? ' under reduced motion' : ''}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, contextOptions: { reducedMotion: reduced ? 'reduce' : 'no-preference' } });

    test(`a card's fourth-level bar holds its colour with no pulse under reduced motion${reduced ? '' : ': without it, it pulses until Acknowledge'}`, async ({ page, context }) => {
      test.setTimeout(60_000);
      await seedDevice(context, { pictures: { noticeAnswered: true } });
      await context.addInitScript(() => {
        const levels = [1, 2, 3, 4, 5].map((level) => ({
          level, name: `Level ${level}`, description: '', volumeMultiplier: 1, delaySeconds: level === 1 ? 0 : 1, soundType: 'notification',
        }));
        const saved = JSON.parse(localStorage.getItem('safeos-settings') || '{"state":{},"version":0}');
        saved.state.alertEscalationLevels = levels;
        saved.state.globalMute = true;
        localStorage.setItem('safeos-settings', JSON.stringify(saved));
      });
      const at = Date.now();
      await seedPictureRows(page, [{ alert: savedAlert(`motion-${at}-levelsx`, at, { kind: 'motion' }) }]);
      await page.goto('/monitor/', { waitUntil: 'networkidle' });
      const card = cards(page).first();
      await expect(card.getByText(/^Level [45]$/)).toBeVisible({ timeout: 20_000 });
      const bar = card.locator('[data-escalation-bar]');
      const animation = await bar.evaluate((el) => getComputedStyle(el).animationName);
      if (reduced) {
        expect(animation).toBe('none');
      } else {
        expect(animation).not.toBe('none');
        await card.getByRole('button', { name: 'Acknowledge', exact: true }).click();
        await expect(page.locator('[data-alert-card]:not([data-acknowledged]) [data-escalation-bar]')).toHaveCount(0);
      }
    });
  });
}

// =============================================================================
// Keep alert pictures
// =============================================================================

const FIRST_LINE = 'Each alert keeps the camera’s picture of the moment, a box round what changed and a close-up. A Sound alert keeps the picture alone.';
const STAY_LINE = 'Alert pictures stay on this device. Anyone who can open SafeOS in this browser can see them.';
const ASK_LINE = 'Ask before you watch or listen to another adult or the people you live with. Laws on recording sound differ by place.';
const STREET_LINE = 'If the camera sees a street, a shared path or a neighbour’s home, the law where you live may treat its pictures as more than a private matter. Point it at your own property where you can, put up a sign, keep pictures only as long as you need them, and give someone their picture or delete it if they ask.';
const ICO_LINK = 'Home CCTV guidance from the ICO, the UK’s regulator';
const PRIVATE_WINDOW_LINE = 'In a private window the browser usually deletes kept pictures when the window closes.';
const OFF_LINE = 'Off. Each alert’s picture shows on the watch until you reload, and nothing is saved.';
const SELECT_LINE = 'The alert’s words stay in History after its picture is deleted.';
const LIMIT_LINE = 'The watch keeps its newest 100 alerts. A picture is deleted with its alert.';
const NOT_KEPT_LINE = 'This picture is not kept. It goes when you reload or close the page.';
const SAVE_FAILED_LINE = 'This picture could not be saved on this device. It shows here until you reload.';
const RAN_OUT_LINE = 'This device ran out of room for pictures. The oldest were deleted to keep the newest.';
const OUT_OF_ROOM_LINE = 'This device is out of room, so new alert pictures are not kept. Free space on the device to keep them.';
const WINDOW_LINE = 'This window keeps no pictures. To keep them, open SafeOS in a normal browser window.';
const DELETE_FAILED_LINE = 'The pictures could not be deleted. Press Delete all pictures to try again.';
const AFTER_CHOICES = ['1 day', '3 days', '7 days', '30 days', 'Until I delete them'];
const DAY = 86_400_000;

const notice = (page: Page) => page.getByRole('dialog', { name: 'Each alert keeps a picture', exact: true });
const group = (page: Page) => page.getByRole('group', { name: 'Alert pictures', exact: true });
const keepSwitch = (root: Page | Locator) => root.getByRole('switch', { name: 'Keep alert pictures', exact: true });
const afterSelect = (root: Page | Locator) => root.getByLabel('Delete pictures after', { exact: true });
const countLine = (root: Page | Locator) => root.getByRole('status').filter({ hasText: /kept on this device$/ });
const deleteAll = (root: Page | Locator) => root.getByRole('button', { name: 'Delete all pictures', exact: true });
const startKey = (page: Page) => page.getByRole('button', { name: 'Start Monitoring', exact: true });
const live = (page: Page) => page.getByText('LIVE', { exact: true });
const listLine = (page: Page, line: string) => page.locator('.alert-list-line').filter({ hasText: line });

const keptRows = (reading: DatabaseReading | null) => (reading?.pictures ?? []).filter((row) => row.state === 'kept');
const keptCount = async (page: Page) => keptRows(await databaseNow(page)).length;

/** Opens the watch's settings group "Alert pictures" and answers it. */
async function openWatchGroup(page: Page): Promise<Locator> {
  const head = page.getByRole('button', { name: /^Alert pictures/ });
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
  const found = group(page);
  await expect(found).toBeVisible();
  return found;
}

/** A device with `count` saved alerts, each with a kept picture, newest first by a minute. */
async function seedKept(page: Page, count: number): Promise<string[]> {
  const now = Date.now();
  const ids: string[] = [];
  await seedPictureRows(page, Array.from({ length: count }, (_, i) => {
    const at = now - (i + 1) * 60_000;
    ids.push(`picture-${at}-seeded${i}`);
    return {
      alert: savedAlert(`motion-${at}-seeded${i}`, at, { kind: 'motion', pictureId: `picture-${at}-seeded${i}` }),
      picture: keptPicture(`picture-${at}-seeded${i}`, at),
    };
  }));
  return ids;
}

for (const width of [390, 1280]) {
  test.describe(`The notice before the first watch, ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test(`the first start opens the notice and nothing is kept before it is answered, ${width} px`, async ({ page, context }) => {
      test.setTimeout(120_000);
      // No alert pictures settings are saved: the device has not answered the notice.
      await seedDevice(context, { settings: MOTION_ONLY });
      await canvasCamera(page, LEFT_THIRD);
      await page.goto('/monitor/', { waitUntil: 'networkidle' });
      await startKey(page).click();

      const dialog = notice(page);
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('.alert-pictures-drawing')).toBeVisible();
      await expect(keepSwitch(dialog)).toHaveAttribute('aria-checked', 'true');
      await expect(afterSelect(dialog).locator('option:checked')).toHaveText('3 days');
      expect(await afterSelect(dialog).locator('option').allTextContents()).toEqual(AFTER_CHOICES);
      for (const line of [FIRST_LINE, STAY_LINE, ASK_LINE, STREET_LINE]) {
        await expect(dialog.getByText(line, { exact: true })).toBeVisible();
      }
      await expect(dialog.getByRole('link', { name: ICO_LINK })).toHaveAttribute('href', 'https://ico.org.uk/for-the-public/home-cctv-systems/');
      await expect(dialog.getByRole('button', { name: 'Go back', exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Start watching', exact: true })).toBeVisible();
      await expect(live(page)).toHaveCount(0);
      expect((await readDatabase(page)).pictures).toEqual([]);

      await dialog.getByRole('button', { name: 'Go back', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(startKey(page)).toBeVisible();
      await expect(live(page)).toHaveCount(0);

      await startKey(page).click();
      await notice(page).getByRole('button', { name: 'Start watching', exact: true }).click();
      await live(page).waitFor({ state: 'visible', timeout: 30_000 });
      await expect(notice(page)).toHaveCount(0);

      // The answer is kept: the next start opens no dialog.
      await page.reload({ waitUntil: 'networkidle' });
      await startKey(page).click();
      await live(page).waitFor({ state: 'visible', timeout: 30_000 });
      await expect(notice(page)).toHaveCount(0);
    });
  });
}

test.describe('Keeping pictures, 390 px', () => {
  test.use({ viewport: { width: 390, height: 900 } });

  test('keeping off writes nothing, and after a reload the card has no picture', async ({ page, context }) => {
    test.setTimeout(120_000);
    await seedDevice(context, { settings: MOTION_ONLY });
    await canvasCamera(page, LEFT_THIRD);
    await page.goto('/monitor/', { waitUntil: 'networkidle' });
    await startKey(page).click();
    await keepSwitch(notice(page)).click();
    await expect(keepSwitch(notice(page))).toHaveAttribute('aria-checked', 'false');
    await notice(page).getByRole('button', { name: 'Start watching', exact: true }).click();

    const card = cards(page).first();
    const time = await timeOf(card, 'Motion');
    await expect(card.getByRole('img', { name: pictureName(time, true), exact: true })).toBeVisible();
    await expect(card.getByText(NOT_KEPT_LINE, { exact: true })).toBeVisible();
    expect((await readDatabase(page)).pictures).toEqual([]);

    // The link opens the watch's group at its switch.
    await card.getByRole('link', { name: 'Keep alert pictures', exact: true }).click();
    const keep = page.locator('#keep-alert-pictures');
    await expect(keep).toBeVisible();
    await expect(keep).toBeFocused();
    await expect(keep).toHaveAttribute('aria-checked', 'false');
    await expect(group(page).getByText(OFF_LINE, { exact: true })).toBeVisible();
    expect((await readDatabase(page)).pictures).toEqual([]);

    await page.reload({ waitUntil: 'networkidle' });
    const saved = cards(page).first();
    await expect(saved.getByText(kindLine('Motion'))).toBeVisible();
    await expect(saved.getByText('No picture was kept for this alert.', { exact: true })).toBeVisible();
    await expect(saved.getByRole('button', { name: /^Open picture/ })).toHaveCount(0);
  });

  test('a held save shows a tile in each picture’s place, then the pictures; a failed save shows the picture with its error line, and no picture after a reload', async ({ page, context }) => {
    test.setTimeout(150_000);
    await seedDevice(context, { settings: MOTION_ONLY, pictures: { noticeAnswered: true } });
    await canvasCamera(page, LEFT_THIRD);
    await faultPictureStore(page, { holdSaveMs: 3_000 });
    await page.goto('/monitor/', { waitUntil: 'networkidle' });
    await startWatching(page);

    // The card and its words come at once, with a tile where the picture goes.
    const card = cards(page).first();
    await timeOf(card, 'Motion');
    await expect(card.locator('.alert-picture__wait')).toBeVisible();
    await expect(card.getByRole('img')).toHaveCount(0);
    await expect(card.locator('.alert-picture__wait')).toHaveAttribute('aria-hidden', 'true');
    await expect(card.locator('.alert-picture__frame img')).toBeVisible({ timeout: 15_000 });
    await expect(card.locator('.alert-picture__wait')).toHaveCount(0);
    await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBe(1);

    // From here every save fails: the next alert's picture shows from memory with its error line.
    await setFault(page, { writes: 'error' });
    await raiseEvents(page, 2, 2);
    const failed = cards(page).first();
    await expect(failed.locator('.alert-picture__frame img')).toBeVisible({ timeout: 15_000 });
    const line = failed.getByText(SAVE_FAILED_LINE, { exact: true });
    await expect(line).toBeVisible();
    await expect(failed.locator('.alert-picture__problem')).toHaveCount(1);
    expect(await keptCount(page)).toBe(1);

    await setFault(page, {});
    await page.reload({ waitUntil: 'networkidle' });
    await expect(cards(page)).toHaveCount(2);
    await expect(cards(page).first().getByText('No picture was kept for this alert.', { exact: true })).toBeVisible();
    await expect(cards(page).nth(1).locator('.alert-picture img').first()).toBeVisible();
  });

  test('out of room: the oldest picture goes with the new one’s save, or nothing goes', async ({ page, context }) => {
    test.setTimeout(240_000);
    await seedDevice(context, { settings: MOTION_ONLY, pictures: { noticeAnswered: true } });
    await canvasCamera(page, LEFT_THIRD);
    await faultPictureStore(page);
    await page.goto('/monitor/', { waitUntil: 'networkidle' });
    await startWatching(page);
    await raiseEvents(page, 3);
    await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBe(3);
    const before = keptRows(await readDatabase(page)).sort((a, b) => a.takenAt - b.takenAt).map((row) => row.id as string);

    // The next write fails for lack of room until its transaction has deleted one picture.
    await setFault(page, { quotaUntilDeletes: 1 });
    await raiseEvents(page, 4, 4);
    await expect.poll(async () => keptRows(await databaseNow(page)).map((row) => row.id).includes(before[0]), { timeout: 15_000 }).toBe(false);
    const after = keptRows(await readDatabase(page)).map((row) => row.id as string);
    expect(after).toHaveLength(3);
    expect(after).toEqual(expect.arrayContaining([before[1], before[2]]));
    await expect(cards(page).first().locator('.alert-picture__frame img')).toBeVisible();
    await expect(cards(page).last().getByText('No picture was kept for this alert.', { exact: true })).toBeVisible();
    await expect(listLine(page, RAN_OUT_LINE)).toHaveCount(1);
    await expect(page.getByRole('status').filter({ hasText: RAN_OUT_LINE })).toHaveCount(1);

    // Every write fails for lack of room: nothing kept is deleted, and the new picture shows from memory.
    await setFault(page, { writes: 'quota' });
    await raiseEvents(page, 5, 5);
    const newest = cards(page).first();
    await expect(newest.locator('.alert-picture__frame img')).toBeVisible({ timeout: 15_000 });
    await expect(newest.getByText(SAVE_FAILED_LINE, { exact: true })).toBeVisible();
    expect(keptRows(await readDatabase(page)).map((row) => row.id as string).sort()).toEqual([...after].sort());
    const outOfRoom = listLine(page, OUT_OF_ROOM_LINE);
    await expect(outOfRoom).toHaveCount(1);
    await expect(outOfRoom.locator('.alert-picture__problem')).toHaveCount(1);
    await expect(outOfRoom.getByRole('link')).toHaveCount(0);
  });

  test('a window that keeps nothing says so once and shows each picture', async ({ page, context }) => {
    test.setTimeout(120_000);
    await seedDevice(context, { settings: MOTION_ONLY, pictures: { noticeAnswered: true } });
    await canvasCamera(page, LEFT_THIRD);
    await faultPictureStore(page, { writes: 'error' });
    await page.goto('/monitor/', { waitUntil: 'networkidle' });
    await startWatching(page);
    const card = cards(page).first();
    const time = await timeOf(card, 'Motion');
    await expect(card.getByRole('img', { name: pictureName(time, true), exact: true })).toBeVisible();
    // The list says it once, with no problem glyph; the card carries no line of its own.
    const line = listLine(page, WINDOW_LINE);
    await expect(line).toHaveCount(1);
    await expect(line.locator('.alert-picture__problem')).toHaveCount(0);
    await expect(card.getByText(SAVE_FAILED_LINE, { exact: true })).toHaveCount(0);
    await expect(card.getByText(NOT_KEPT_LINE, { exact: true })).toHaveCount(0);
    const found = await openWatchGroup(page);
    await expect(found.getByText(WINDOW_LINE, { exact: true })).toBeVisible();
    expect(await keptCount(page)).toBe(0);
  });

  test('the pictures and their store work offline', async ({ page, context }) => {
    test.setTimeout(120_000);
    await seedDevice(context, { settings: MOTION_ONLY, pictures: { noticeAnswered: true } });
    await canvasCamera(page, LEFT_THIRD);
    await page.goto('/monitor/', { waitUntil: 'networkidle' });
    await context.setOffline(true);
    await startWatching(page);
    const card = cards(page).first();
    const time = await timeOf(card, 'Motion');
    await expect(card.getByRole('img', { name: pictureName(time, true), exact: true })).toBeVisible();
    await expect(card.getByRole('img', { name: closeUpName(time), exact: true })).toBeVisible();
    await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBe(1);
    // The group and the notice's link row say what the link needs.
    const found = await openWatchGroup(page);
    await expect(found.getByText('Opens ico.org.uk', { exact: true })).toBeVisible();
    await expect(countLine(found)).toHaveText('1 picture kept on this device');
    await context.setOffline(false);
  });
});

test.describe('Keeping pictures on the sample clip, 1280 px', () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test.beforeEach(() => requireSampleClip());

  test('the frame and the close-up are kept at their sizes as JPEG files', async ({ page, context }) => {
    test.setTimeout(180_000);
    await watchWith(page, context, { settings: clipSettings({ motion: true, sound: false }) });
    const card = cards(page).first();
    const time = await timeOf(card, 'Motion');
    await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    const reading = await readDatabase(page);
    const [alert] = monitoringAlerts(reading);
    const row = keptRows(reading).find((picture) => picture.id === alert.pictureId)!;
    expect(row, 'the alert names its kept picture').toBeTruthy();
    expect(row.frame.type).toBe('image/jpeg');
    expect([row.frameWidth, row.frameHeight]).toEqual([640, 480]);
    expect(row.closeUp.type).toBe('image/jpeg');
    expect(Math.max(row.closeUpWidth, row.closeUpHeight)).toBeLessThanOrEqual(480);
    expect(await naturalSize(card.getByRole('img', { name: pictureName(time, true), exact: true }))).toEqual({ width: 640, height: 480 });
    expect(await naturalSize(card.getByRole('img', { name: closeUpName(time), exact: true }))).toEqual({ width: row.closeUpWidth, height: row.closeUpHeight });
    // No picture stands as a data URL in an alert's record or in local storage.
    expect(JSON.stringify(reading.alerts)).not.toContain('data:image');
    expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage)))).not.toContain('data:image');
  });
});

for (const width of [390, 1280]) {
  test.describe(`The group "Alert pictures", ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test(`the group counts the kept pictures, and Delete all pictures empties the store, ${width} px`, async ({ page, context }) => {
      test.setTimeout(180_000);
      await watchWith(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD });
      await raiseEvents(page, 3);
      await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBe(3);

      const checkGroup = async (found: Locator) => {
        for (const line of [FIRST_LINE, STAY_LINE, ASK_LINE, STREET_LINE, PRIVATE_WINDOW_LINE, SELECT_LINE, LIMIT_LINE]) {
          await expect(found.getByText(line, { exact: true })).toBeVisible();
        }
        await expect(found.locator('.alert-pictures-drawing')).toBeVisible();
        await expect(keepSwitch(found)).toHaveAttribute('aria-checked', 'true');
        await expect(afterSelect(found).locator('option:checked')).toHaveText('3 days');
        await expect(countLine(found)).toHaveText('3 pictures kept on this device');
        await expect(deleteAll(found)).toBeVisible();
      };
      const onWatch = await openWatchGroup(page);
      await checkGroup(onWatch);
      const settings = await context.newPage();
      await settings.goto('/settings/detection/', { waitUntil: 'networkidle' });
      await checkGroup(group(settings));

      await deleteAll(onWatch).click();
      const question = page.getByRole('alertdialog', { name: 'Delete all 3 alert pictures from this device? The alerts’ words stay.', exact: true });
      await expect(question).toBeVisible();
      await expect(question.getByRole('button', { name: 'Keep them', exact: true })).toBeFocused();
      await question.getByRole('button', { name: 'Delete all pictures', exact: true }).click();
      await expect(question).toHaveCount(0);
      await expect(countLine(onWatch)).toHaveText('No pictures kept on this device');
      await expect(deleteAll(onWatch)).toHaveCount(0);
      await expect(cards(page)).toHaveCount(3);
      for (const card of await cards(page).all()) {
        await expect(card.getByText('You deleted its picture.', { exact: true })).toBeVisible();
        await expect(card.getByText(kindLine('Motion'))).toBeVisible();
      }
      expect(await keptCount(page)).toBe(0);
      // The other tab's group follows with no reload.
      await expect(countLine(group(settings))).toHaveText('No pictures kept on this device');
      await settings.close();
    });
  });
}

test.describe('Keeping pictures, 1280 px', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('a picture past its age is deleted while the watch runs, and the card says after how long', async ({ page, context }) => {
    test.setTimeout(300_000);
    await watchWith(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD, pictures: { noticeAnswered: true, deleteAfterDays: 1 } });
    const card = cards(page).first();
    await timeOf(card, 'Motion');
    await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBe(1);
    const [first] = keptRows(await readDatabase(page));
    await redatePicture(page, first.id, Date.now() - 2 * DAY);
    await expect(card.getByText('Its picture was deleted after 1 day.', { exact: true })).toBeVisible({ timeout: 90_000 });
    await expect(card.getByText(kindLine('Motion'))).toBeVisible();
    const gone = (await readDatabase(page)).pictures.find((row) => row.id === first.id)!;
    expect(gone).toMatchObject({ state: 'gone', gone: 'age', goneAfterDays: 1 });
    expect(gone.frame).toBeUndefined();
    expect(gone.closeUp).toBeUndefined();

    // Until I delete them: nothing is deleted at any age.
    const found = await openWatchGroup(page);
    await afterSelect(found).selectOption({ label: 'Until I delete them' });
    await raiseEvents(page, 2, 2);
    await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBe(1);
    const [second] = keptRows(await readDatabase(page));
    await redatePicture(page, second.id, Date.now() - 400 * DAY);
    await page.waitForTimeout(75_000);
    expect(keptRows(await readDatabase(page)).map((row) => row.id)).toEqual([second.id]);
    await expect(cards(page).first().locator('.alert-picture img').first()).toBeVisible();
  });

  test('a repeat leaves one picture set in the store for its card', async ({ page, context }) => {
    test.setTimeout(150_000);
    await watchWith(page, context, { settings: { ...MOTION_ONLY, timingSettings: cooldownPeriod(20) }, camera: LEFT_THIRD });
    const card = cards(page).first();
    await timeOf(card, 'Motion');
    await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBe(1);
    const [first] = keptRows(await readDatabase(page));
    await expect(card.getByText('Repeated 1 time', { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect.poll(async () => {
      const reading = await databaseNow(page);
      const [alert] = monitoringAlerts(reading);
      const kept = keptRows(reading).map((row) => row.id);
      return alert && kept.length === 1 && kept[0] === alert.pictureId && kept[0] !== first.id;
    }, { timeout: 15_000, message: 'the card’s one kept picture is the repeat’s' }).toBe(true);
    expect((await readDatabase(page)).pictures.map((row) => row.id)).not.toContain(first.id);
  });

  test('a second tab shows the kept pictures and another profile shows none', async ({ page, context, browser }) => {
    test.setTimeout(150_000);
    await watchWith(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD });
    const time = await timeOf(cards(page).first(), 'Motion');
    await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBe(1);

    const second = await context.newPage();
    await second.goto('/monitor/', { waitUntil: 'networkidle' });
    const shown = cards(second).first();
    await expect(shown.getByText(`Motion at ${time}`, { exact: true })).toBeVisible();
    await expect(shown.getByRole('img', { name: pictureName(time, true), exact: true })).toBeVisible();
    await second.close();

    const other = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await seedDevice(other, { settings: MOTION_ONLY, pictures: { noticeAnswered: true } });
    const stranger = await other.newPage();
    await stranger.goto('/monitor/', { waitUntil: 'networkidle' });
    await expect(startKey(stranger)).toBeVisible();
    await expect(cards(stranger)).toHaveCount(0);
    expect((await readDatabase(stranger)).pictures).toEqual([]);
    await other.close();
  });

  test('turning keeping off in a second tab stops the next save in the first', async ({ page, context }) => {
    test.setTimeout(150_000);
    await watchWith(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD });
    await timeOf(cards(page).first(), 'Motion');
    await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBe(1);

    const settings = await context.newPage();
    await settings.goto('/settings/detection/', { waitUntil: 'networkidle' });
    await keepSwitch(group(settings)).click();
    await expect(keepSwitch(group(settings))).toHaveAttribute('aria-checked', 'false');
    await settings.close();

    // The watch follows at its next alert, with no reload.
    await raiseEvents(page, 2, 2);
    const next = cards(page).first();
    await expect(next.locator('.alert-picture__frame img')).toBeVisible({ timeout: 15_000 });
    await expect(next.getByText(NOT_KEPT_LINE, { exact: true })).toBeVisible();
    expect(await keptCount(page)).toBe(1);
  });

  test('a tab whose database waits for a reload keeps pictures in memory and names no window', async ({ page, context }) => {
    test.setTimeout(150_000);
    await seedDevice(context, { settings: MOTION_ONLY, pictures: { noticeAnswered: true } });
    await canvasCamera(page, LEFT_THIRD);
    // A tab of a later release holds the database at a version this release cannot open.
    const later = await context.newPage();
    await later.goto('/about/', { waitUntil: 'domcontentloaded' });
    await expect.poll(async () => (await databaseNow(later))?.version ?? 0, { timeout: 15_000 }).toBeGreaterThanOrEqual(8);
    await later.evaluate(() => new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('safeos-guardian', 99);
      open.onupgradeneeded = () => undefined;
      open.onsuccess = () => { (window as unknown as { __held: IDBDatabase }).__held = open.result; resolve(); };
      open.onerror = () => reject(open.error);
      open.onblocked = () => reject(new Error('the later tab could not take the database'));
    }));

    await page.goto('/monitor/', { waitUntil: 'networkidle' });
    await startWatching(page);
    const card = cards(page).first();
    const time = await timeOf(card, 'Motion');
    await expect(card.getByRole('img', { name: pictureName(time, true), exact: true })).toBeVisible();
    await expect(page.getByText(WINDOW_LINE, { exact: true })).toHaveCount(0);
    await expect(card.getByText(NOT_KEPT_LINE, { exact: true })).toHaveCount(0);
    await expect(card.getByText(SAVE_FAILED_LINE, { exact: true })).toHaveCount(0);
    await later.close();
  });

  // A save is running from the alert until its picture is written. A delete
  // or a clear that comes in between, in any tab, leaves it unwritten.
  for (const way of ['Delete all pictures', 'Clear All Local Data', 'Clear all'] as const) {
    test(`a save running when ${way} comes in another tab is never written`, async ({ page, context }) => {
      test.setTimeout(180_000);
      await seedDevice(context, { settings: MOTION_ONLY, pictures: { noticeAnswered: true } });
      await canvasCamera(page, LEFT_THIRD);
      await faultPictureStore(page);
      await page.goto('/monitor/', { waitUntil: 'networkidle' });
      await startWatching(page);
      await timeOf(cards(page).first(), 'Motion');
      await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBe(1);

      const other = await context.newPage();
      if (way === 'Delete all pictures') await other.goto('/settings/detection/', { waitUntil: 'networkidle' });
      else if (way === 'Clear All Local Data') {
        await other.goto('/settings/', { waitUntil: 'networkidle' });
        await other.getByRole('button', { name: 'Privacy' }).click();
      } else await other.goto('/history/', { waitUntil: 'networkidle' });

      // The next alert's picture is handed back five seconds after it is drawn: its save waits.
      await setFault(page, { holdDrawMs: 5_000 });
      await raiseEvents(page, 2, 2);
      const held = cards(page).first();
      await expect(held.locator('.alert-picture__wait')).toBeVisible();

      if (way === 'Delete all pictures') {
        await deleteAll(group(other)).click();
        await other.getByRole('alertdialog').getByRole('button', { name: 'Delete all pictures', exact: true }).click();
        await expect(countLine(group(other))).toHaveText('No pictures kept on this device');
      } else if (way === 'Clear All Local Data') {
        other.once('dialog', (dialog) => void dialog.accept());
        await other.getByRole('button', { name: 'Clear All Local Data' }).click();
        await expect.poll(async () => monitoringAlerts(await databaseNow(other)).length, { timeout: 15_000 }).toBe(0);
      } else {
        await other.getByRole('button', { name: /Notifications/ }).first().click();
        await other.getByRole('button', { name: 'Clear all', exact: true }).click();
        await expect.poll(async () => monitoringAlerts(await databaseNow(other)).length, { timeout: 15_000 }).toBe(0);
      }

      // The held save goes on now, and writes nothing.
      await page.waitForTimeout(7_000);
      const reading = await readDatabase(page);
      expect(keptRows(reading)).toEqual([]);
      if (way === 'Delete all pictures') {
        await expect(held.getByText('You deleted its picture.', { exact: true })).toBeVisible();
        await expect(cards(page).last().getByText('You deleted its picture.', { exact: true })).toBeVisible();
      } else {
        expect(reading.pictures).toEqual([]);
        expect(monitoringAlerts(reading)).toEqual([]);
      }
      await other.close();
    });
  }

  test('a connected server receives its frames and no kept picture, box or close-up', async ({ page, context }) => {
    test.setTimeout(150_000);
    const wsUrl = 'ws://127.0.0.1:4174/ws';
    await seedDevice(context, { settings: MOTION_ONLY, pictures: { noticeAnswered: true }, backend: { wsUrl } });
    await canvasCamera(page, LEFT_THIRD);
    // The walk's own server: it gives the page a session, answers every request and takes the socket.
    const server = await routedServer(page, /^ws:\/\/127\.0\.0\.1:4174\//);
    const bodies: string[] = [];
    await page.route('http://127.0.0.1:4174/**', (route) => {
      const session = route.request().url().endsWith('/api/auth/session');
      return route.fulfill({ json: {
        success: true,
        data: session
          ? { sessionId: 'walk-session', token: 'walk-token', isGuest: true, profile: null, expiresAt: new Date(Date.now() + DAY).toISOString() }
          : null,
      } });
    });
    page.on('request', (request) => { bodies.push(`${request.method()} ${request.url()} ${request.postData() ?? ''}`); });
    await page.goto('/monitor/', { waitUntil: 'networkidle' });
    await startWatching(page);
    await timeOf(cards(page).first(), 'Motion');
    await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBe(1);
    await expect.poll(() => server.messages.filter((message) => /"type":\s*"frame"/.test(message)).length, {
      timeout: 60_000, message: 'the page’s ordinary frames reach the server',
    }).toBeGreaterThanOrEqual(1);

    // The kept picture's bytes, its id and its box, as the page holds them.
    const kept = await page.evaluate(() => new Promise<{ id: string; frame: string; closeUp: string; box: string }>((resolve, reject) => {
      const base64 = async (blob: Blob) => {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let text = '';
        for (const byte of bytes) text += String.fromCharCode(byte);
        return btoa(text);
      };
      const open = indexedDB.open('safeos-guardian');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const read = db.transaction('alert_picture', 'readonly').objectStore('alert_picture').getAll();
        read.onerror = () => { db.close(); reject(read.error); };
        read.onsuccess = () => {
          db.close();
          const row = read.result.find((picture) => picture.state === 'kept');
          void (async () => resolve({
            id: row.id,
            frame: await base64(row.frame),
            closeUp: row.closeUp ? await base64(row.closeUp) : '',
            box: JSON.stringify(row.box),
          }))().catch(reject);
        };
      };
    }));
    const sent = [...server.messages, ...bodies].join('\n');
    expect(sent).not.toContain(kept.id);
    expect(sent).not.toContain(kept.frame.slice(0, 400));
    if (kept.closeUp) expect(sent).not.toContain(kept.closeUp.slice(0, 400));
    expect(sent).not.toContain(kept.box);
    expect(sent).not.toMatch(/pictureId|sourceBox|closeUp|alert_picture/);
  });
});

test.describe('The group and the notice: order, sizes and faults', () => {
  test('the group and the notice in keyboard order', async ({ page, context }) => {
    test.setTimeout(120_000);
    await seedDevice(context, { settings: MOTION_ONLY });
    await canvasCamera(page, LEFT_THIRD);
    await seedKept(page, 2);
    await page.goto('/monitor/', { waitUntil: 'networkidle' });
    await startKey(page).click();
    const dialog = notice(page);
    await expect(dialog).toBeVisible();
    // Focus starts on the dialog's panel and stays inside it.
    await expect(dialog).toBeFocused();
    const order = [
      keepSwitch(dialog),
      afterSelect(dialog),
      dialog.getByRole('link', { name: ICO_LINK }),
      dialog.getByRole('button', { name: 'Go back', exact: true }),
      dialog.getByRole('button', { name: 'Start watching', exact: true }),
    ];
    for (const stop of order) {
      await page.keyboard.press('Tab');
      await expect(stop).toBeFocused();
      const ring = await stop.evaluate((el) => getComputedStyle(el).outlineStyle);
      expect(ring, 'each stop shows its ring').not.toBe('none');
    }
    await page.keyboard.press('Tab');
    await expect(order[0]).toBeFocused();
    // Escape is Go back: the dialog closes and the watch has not started.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(live(page)).toHaveCount(0);
    await expect(startKey(page)).toBeFocused();

    const found = await openWatchGroup(page);
    await keepSwitch(found).focus();
    for (const stop of [afterSelect(found), deleteAll(found), found.getByRole('link', { name: ICO_LINK })]) {
      await page.keyboard.press('Tab');
      await expect(stop).toBeFocused();
    }
    // The delete question starts on Keep them and gives focus back to Delete all pictures.
    await deleteAll(found).click();
    const question = page.getByRole('alertdialog');
    await expect(question.getByRole('button', { name: 'Keep them', exact: true })).toBeFocused();
    await question.getByRole('button', { name: 'Keep them', exact: true }).click();
    await expect(deleteAll(found)).toBeFocused();
    expect(await keptCount(page)).toBe(2);
  });

  for (const look of ['dark', 'light'] as const) {
    test.describe(`in the ${look} look`, () => {
      test.use({ colorScheme: look });

      test(`the group and the notice at 320 px and 200 per cent text, ${look}`, async ({ page, context }) => {
        test.setTimeout(120_000);
        await page.setViewportSize({ width: 320, height: 700 });
        await seedDevice(context, { settings: MOTION_ONLY });
        await canvasCamera(page, LEFT_THIRD);
        await seedKept(page, 2);
        await page.goto('/monitor/', { waitUntil: 'networkidle' });
        await startKey(page).click();
        const dialog = notice(page);
        await expect(dialog).toBeVisible();
        const sameRow = async (a: Locator, b: Locator) => {
          const [first, second] = [(await a.boundingBox())!, (await b.boundingBox())!];
          return first.y < second.y + second.height && second.y < first.y + first.height;
        };
        // Nothing reaches past the root's edges and no line is cut. Keys in a row that scrolls
        // inside itself are reached by scrolling the row, and a select shows its chosen words.
        const fits = async (root: Locator) => root.evaluate((el) => {
          const edge = el.getBoundingClientRect();
          return Array.from(el.querySelectorAll('p, span, label, button, select, a, h2, h3')).filter((child) => {
            if (child.closest('.alert-pictures-keys[data-overflows] .alert-pictures-keys__row')) return false;
            const box = child.getBoundingClientRect();
            if (box.width <= 1) return false;
            const cut = !(child instanceof HTMLSelectElement) && child.scrollWidth > child.clientWidth + 1;
            return box.right > edge.right + 1 || box.left < edge.left - 1 || cut;
          }).map((child) => (child.textContent || '').slice(0, 40));
        });
        const goBack = dialog.getByRole('button', { name: 'Go back', exact: true });
        const start = dialog.getByRole('button', { name: 'Start watching', exact: true });
        for (const text of [100, 200]) {
          if (text === 200) await doubleText(page);
          expect(await sameRow(goBack, start), `the notice's two keys keep one row at ${text} per cent`).toBe(true);
          // Where the keys do not fit, the row scrolls inside itself between its two arrow keys.
          const keys = dialog.locator('.alert-pictures-keys');
          if (await keys.locator('.alert-pictures-keys__row').evaluate((row) => row.scrollWidth > row.clientWidth + 1)) {
            await expect(keys.getByRole('button', { name: 'Previous keys', exact: true })).toBeDisabled();
            await keys.getByRole('button', { name: 'Next keys', exact: true }).click();
            await expect(start).toBeInViewport({ ratio: 0.9 });
            await expect(keys.getByRole('button', { name: 'Previous keys', exact: true })).toBeEnabled();
          }
          expect(await fits(dialog), `nothing in the notice is cut at ${text} per cent`).toEqual([]);
          // The notice scrolls inside itself, not the page behind it.
          expect(await dialog.evaluate((el) => {
            const scroller = el.querySelector('.alert-pictures-notice__body') ?? el;
            return scroller.scrollHeight > scroller.clientHeight ? getComputedStyle(scroller).overflowY : 'fits';
          })).toMatch(/^(auto|scroll|fits)$/);
        }
        expect((await start.boundingBox())!.height).toBeGreaterThanOrEqual(52);
        expect((await goBack.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await start.click();
        await live(page).waitFor({ state: 'visible', timeout: 30_000 });

        await page.reload({ waitUntil: 'networkidle' });
        const found = await openWatchGroup(page);
        for (const text of [100, 200]) {
          if (text === 200) await doubleText(page);
          expect(await sameRow(found.getByText('Keep alert pictures', { exact: true }).first(), keepSwitch(found)), `the switch's row keeps one row at ${text} per cent`).toBe(true);
          expect(await fits(found), `nothing in the group is cut at ${text} per cent`).toEqual([]);
        }
        for (const control of [keepSwitch(found), afterSelect(found), deleteAll(found)]) {
          expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        }
      });

      for (const width of [390, 1280]) {
        test(`the group’s and the notice’s words meet the sizes and contrast, ${width} px, ${look}`, async ({ page, context }) => {
          test.setTimeout(120_000);
          await page.setViewportSize({ width, height: 900 });
          await seedDevice(context, { settings: MOTION_ONLY });
          await canvasCamera(page, LEFT_THIRD);
          await seedKept(page, 2);
          await page.goto('/monitor/', { waitUntil: 'networkidle' });
          await startKey(page).click();
          const dialog = notice(page);
          await expect(dialog).toBeVisible();
          expect(await readable(dialog, BLOCK_READABILITY), 'the notice’s words').toEqual([]);
          await dialog.getByRole('button', { name: 'Go back', exact: true }).click();
          const found = await openWatchGroup(page);
          await expect(countLine(found)).toHaveText('2 pictures kept on this device');
          expect(await readable(found, BLOCK_READABILITY), 'the group’s words').toEqual([]);
        });
      }
    });
  }

  test('the count loads in place', async ({ page, context }) => {
    test.setTimeout(60_000);
    await seedDevice(context, { pictures: { noticeAnswered: true } });
    await seedKept(page, 3);
    await faultPictureStore(page, { holdReadMs: 3_000 });
    await page.goto('/settings/detection/', { waitUntil: 'domcontentloaded' });
    const found = group(page);
    await expect(found).toBeVisible();
    // A track-coloured bar stands in the count's place until the store is read.
    const bar = found.locator('.alert-pictures-group__count-wait');
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute('aria-hidden', 'true');
    await expect(countLine(found)).toHaveCount(0);
    await expect(countLine(found)).toHaveText('3 pictures kept on this device', { timeout: 15_000 });
    await expect(bar).toHaveCount(0);
  });

  test('a failed Delete all pictures says so and keeps the count', async ({ page, context }) => {
    test.setTimeout(60_000);
    await seedDevice(context, { pictures: { noticeAnswered: true } });
    await seedKept(page, 3);
    await faultPictureStore(page, { deletes: 'error' });
    await page.goto('/settings/detection/', { waitUntil: 'networkidle' });
    const found = group(page);
    await expect(countLine(found)).toHaveText('3 pictures kept on this device');
    await deleteAll(found).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete all pictures', exact: true }).click();
    const failed = found.getByText(DELETE_FAILED_LINE, { exact: true });
    await expect(failed).toBeVisible();
    await expect(found.locator('.alert-picture__problem')).toHaveCount(1);
    await expect(countLine(found)).toHaveText('3 pictures kept on this device');
    expect(await keptCount(page)).toBe(3);

    // With the store restored the same key deletes them.
    await setFault(page, {});
    await deleteAll(found).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete all pictures', exact: true }).click();
    await expect(countLine(found)).toHaveText('No pictures kept on this device');
    await expect(failed).toHaveCount(0);
    expect(await keptCount(page)).toBe(0);
  });

  test('another profile keeps its own choice and notice', async ({ page, context, browser }) => {
    test.setTimeout(120_000);
    await seedDevice(context, { settings: MOTION_ONLY, pictures: { noticeAnswered: true } });
    await page.goto('/settings/detection/', { waitUntil: 'networkidle' });
    const found = group(page);
    await keepSwitch(found).click();
    await afterSelect(found).selectOption({ label: '30 days' });
    await expect(keepSwitch(found)).toHaveAttribute('aria-checked', 'false');
    await page.reload({ waitUntil: 'networkidle' });
    await expect(keepSwitch(group(page))).toHaveAttribute('aria-checked', 'false');
    await expect(afterSelect(group(page)).locator('option:checked')).toHaveText('30 days');

    const other = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await seedDevice(other, { settings: MOTION_ONLY });
    const stranger = await other.newPage();
    await canvasCamera(stranger, LEFT_THIRD);
    await stranger.goto('/settings/detection/', { waitUntil: 'networkidle' });
    await expect(keepSwitch(group(stranger))).toHaveAttribute('aria-checked', 'true');
    await expect(afterSelect(group(stranger)).locator('option:checked')).toHaveText('3 days');
    await stranger.goto('/monitor/', { waitUntil: 'networkidle' });
    await startKey(stranger).click();
    await expect(notice(stranger)).toBeVisible();
    await other.close();
  });

  for (const width of [768, 1024, 1440]) {
    test(`the group at ${width} px`, async ({ page, context }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width, height: 900 });
      await seedDevice(context, { pictures: { noticeAnswered: true } });
      await seedKept(page, 2);
      await page.goto('/monitor/', { waitUntil: 'networkidle' });
      const found = await openWatchGroup(page);
      await expect(countLine(found)).toHaveText('2 pictures kept on this device');
      const keep = (await keepSwitch(found).boundingBox())!;
      const select = (await afterSelect(found).boundingBox())!;
      const line = (await found.getByText(STAY_LINE, { exact: true }).boundingBox())!;
      const lines = found.locator('.alert-pictures-group__lines');
      const controls = found.locator('.alert-pictures-group__controls');
      const [left, right] = [(await lines.boundingBox())!, (await controls.boundingBox())!];
      if (width === 768) {
        expect(keep.y < select.y + select.height && select.y < keep.y + keep.height, 'the switch and the select on one row').toBe(true);
      } else {
        expect(right.x, 'the controls’ column stands beside the lines').toBeGreaterThanOrEqual(left.x + left.width);
        expect(line.width, 'the lines are held to 640 px').toBeLessThanOrEqual(width === 1024 ? 640 : 900);
      }
      if (width === 1440) {
        expect(Math.abs(left.width / right.width - 7 / 5), 'the lines and the controls stand 7 to 5').toBeLessThanOrEqual(0.2);
        expect(await found.getByText(STAY_LINE, { exact: true }).evaluate((el) => getComputedStyle(el).fontSize)).toBe('20px');
      }
      expect(await scrollsSideways(page)).toBe(false);
    });
  }
});
