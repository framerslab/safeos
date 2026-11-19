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
  keptPicture,
  naturalSize,
  near,
  pixelsAt,
  pngUrl,
  readDatabase,
  readable,
  requireSampleClip,
  sampleClipLaunch,
  savedAlert,
  scrollsSideways,
  seedDevice,
  seedPictureRows,
  seedVersion7,
  startWatching,
  type CanvasCamera,
  type DatabaseReading,
  type PicturesSeed,
} from './helpers/alert-pictures';

test.use({
  permissions: ['camera', 'microphone'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
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

/** The picture block's box: its place on screen and the colours of its two lines, sampled on a screenshot. */
async function boxLines(page: Page, frame: Locator): Promise<{ green: [number, number, number]; dark: [number, number, number] }> {
  const box = frame.locator('.alert-picture__box');
  await expect(box).toHaveCount(1);
  const frameRect = (await frame.boundingBox())!;
  const boxRect = (await box.boundingBox())!;
  const shot = await frame.screenshot({ animations: 'disabled' });
  const left = boxRect.x - frameRect.x;
  const midY = boxRect.y - frameRect.y + boxRect.height / 2;
  // The green line lies on the box's own edge, 2 px wide; the dark line 1 px outside it.
  const [green, dark] = await pixelsAt(page, pngUrl(shot), [[left + 1, midY], [left - 1, midY]]);
  return { green, dark };
}

for (const look of ['dark', 'light'] as const) {
  for (const width of [390, 1280]) {
    test.describe(`The card on the sample clip, ${width} px, ${look}`, () => {
      test.use({ colorScheme: look, viewport: { width, height: 900 }, launchOptions: { args: sampleClipLaunch() } });
      test.beforeEach(() => requireSampleClip());

      test(`a Motion alert's card shows the camera's picture with one box and its close-up, with no line reading Motion detected, ${width} px, ${look}`, async ({ page, context }) => {
        test.setTimeout(180_000);
        await watchWith(page, context, { settings: clipSettings({ motion: true, sound: false }) });
        const card = cards(page).first();
        const time = await timeOf(card, 'Motion');

        const picture = card.getByRole('img', { name: pictureName(time, true), exact: true });
        await expect(picture).toBeVisible();
        const frame = card.locator('.alert-picture__frame').first();
        const { green, dark } = await boxLines(page, frame);
        expect(near(green, '#4ade80'), `the box's line is #4ade80 (read ${green})`).toBe(true);
        expect(near(dark, '#0b131b'), `the box's outer line is #0b131b (read ${dark})`).toBe(true);

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
        expect(await page.locator('body').innerText()).not.toMatch(/Motion detected/);
        await expect(page.getByRole('status').filter({ hasText: new RegExp(`^New alert: Motion, (Low|Medium|High|Critical), at ${escape(time)}\\.`) })).toHaveCount(1);
      });
    });
  }
}

for (const look of ['dark', 'light'] as const) {
  test.describe(`The Sound card on the sample clip, 1280 px, ${look}`, () => {
    test.use({ colorScheme: look, viewport: { width: 1280, height: 900 }, launchOptions: { args: sampleClipLaunch() } });
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
    const card = cards(page).filter({ hasText: kindLine('Picture change') }).first();
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
    // The moving part lies on whole cells of the motion check's 16 by 12 grid (45 by 106 px).
    const moving = { x: 270 / 720, y: 530 / 1280, width: 180 / 720, height: 212 / 1280 };
    await watchWith(page, context, { settings: MOTION_ONLY, camera: { width: 720, height: 1280, background: 128, moving, levels: [0, 85, 170, 255] } });
    const card = cards(page).first();
    const time = await timeOf(card, 'Motion');
    const picture = card.getByRole('img', { name: pictureName(time, true), exact: true });
    const frame = card.locator('.alert-picture__frame').first();
    const tile = (await frame.boundingBox())!;
    expect(Math.abs(tile.width / tile.height - 4 / 3), 'the tile is 4:3').toBeLessThanOrEqual(0.02);
    expect(await picture.evaluate((img) => getComputedStyle(img).objectFit)).toBe('contain');
    // The picture stands whole: its height fills the tile and its width is 720/1280 of that.
    const shownWidth = tile.height * 720 / 1280;
    const left = tile.x + (tile.width - shownWidth) / 2;
    const scale = tile.height / 1280;
    const want = { x: left + 270 * scale, y: tile.y + 530 * scale, width: 180 * scale, height: 212 * scale };
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
      for (let count = 1; count <= 3; count++) {
        await expect(cards(page)).toHaveCount(count, { timeout: 40_000 });
        if (count === 3) break;
        // The picture holds still, so the event ends; then it moves again: a new event.
        await page.evaluate(() => { window.__camera!.moving.width = 0; });
        await page.waitForTimeout(3_000);
        await page.evaluate(() => { window.__camera!.moving.width = 1 / 3; });
      }
      const [newest, ...older] = await cards(page).all();
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
          expect(await scrollsSideways(page)).toBe(false);
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
    test.use({ viewport: { width: 1280, height: 900 }, ...(reduced ? { reducedMotion: 'reduce' as const } : {}) });

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
