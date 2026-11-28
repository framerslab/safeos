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

import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { test, expect, type BrowserContext, type Locator, type Page } from '@playwright/test';

import { mapLiveBox } from '../src/lib/alert-pictures/rules';
import {
  BLOCK_READABILITY,
  CUSTOM_PRESET,
  EDGE,
  LEFT_THIRD,
  MOTION_ONLY,
  brightestIn,
  canvasCamera,
  clipSettings,
  controlEdges,
  cooldownPeriod,
  doubleText,
  faultPictureStore,
  heldDraws,
  keptPicture,
  liveCameras,
  naturalSize,
  near,
  notesOf,
  partsPastEdge,
  pixelsAt,
  pngUrl,
  readDatabase,
  readable,
  recordNotifications,
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
  sidewaysParts,
  startWatching,
  wordsOn,
  type CanvasCamera,
  type DatabaseReading,
  type NotificationStandIn,
  type PicturesSeed,
} from './helpers/alert-pictures';
import { clearAllDataOnThisDevice } from './helpers/clear-all-data';

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

function describeInBothLooks(title: string, defineTests: () => void) {
  for (const look of ['dark', 'light'] as const) {
    test.describe(`${title}, ${look}`, () => {
      test.use({ colorScheme: look });
      defineTests();
    });
  }
}

/** The database, or null while the page holds it mid-reload. */
async function databaseNow(page: Page): Promise<DatabaseReading | null> {
  try {
    return await readDatabase(page);
  } catch {
    return null;
  }
}

const monitoringAlerts = (reading: DatabaseReading | null) => (reading?.alerts ?? []).filter((row) => row.monitoring === true);

/**
 * The page hears each change another tab makes to local storage `ms` late,
 * as a browser may tell a tab of it after the news on the pictures' channel.
 */
async function lateStorageEvents(page: Page, ms: number): Promise<void> {
  await page.addInitScript((wait: number) => {
    const listen = window.addEventListener.bind(window);
    window.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
      if (type !== 'storage') return listen(type, listener, options);
      const late = (event: Event) => {
        setTimeout(() => (typeof listener === 'function' ? listener.call(window, event) : listener.handleEvent(event)), wait);
      };
      return listen(type, late, options);
    } as typeof window.addEventListener;
  }, ms);
}

/**
 * The page hears the other tabs' news on their channel `ms` late, as a busy
 * tab may handle a message well after another tab sent it.
 */
async function lateChannelNews(page: Page, ms: number): Promise<void> {
  await page.addInitScript((wait: number) => {
    const Native = window.BroadcastChannel;
    class Late extends Native {
      set onmessage(handler: ((this: BroadcastChannel, event: MessageEvent) => unknown) | null) {
        super.onmessage = handler ? (event: MessageEvent) => { setTimeout(() => handler.call(this, event), wait); } : null;
      }
      get onmessage(): ((this: BroadcastChannel, event: MessageEvent) => unknown) | null {
        return super.onmessage;
      }
    }
    window.BroadcastChannel = Late;
  }, ms);
}

/** How many watch alerts the database holds, or -1 while it cannot be read: a failed read is never an empty store. */
async function savedAlertCount(page: Page): Promise<number> {
  const reading = await databaseNow(page);
  return reading ? monitoringAlerts(reading).length : -1;
}

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

  describeInBothLooks('Clearing data with kept pictures, 1280 px', () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test('Clear all data on this device leaves no alert picture', async ({ page, context }) => {
      await seedDevice(context, { pictures: { noticeAnswered: true } });
      const at = Date.now() - 60_000;
      await seedPictureRows(page, [
        { alert: savedAlert('motion-1-aaaaaaa', at, { pictureId: 'picture-1-aaaaaaa', kind: 'motion' }), picture: keptPicture('picture-1-aaaaaaa', at) },
        { alert: savedAlert('motion-2-bbbbbbb', at + 1_000, { pictureId: 'picture-2-bbbbbbb', kind: 'motion' }), picture: keptPicture('picture-2-bbbbbbb', at + 1_000) },
      ]);
      expect((await readDatabase(page)).pictures).toHaveLength(2);

      await clearAllDataOnThisDevice(page);

      await expect.poll(async () => {
        const reading = await databaseNow(page);
        return reading ? { pictures: reading.pictures.length, alerts: monitoringAlerts(reading).length } : null;
      }, { timeout: 15_000 }).toEqual({ pictures: 0, alerts: 0 });
    });
  });

  test('the 101st alert takes the oldest alert\'s picture with it', async ({ page, context }) => {
    test.setTimeout(120_000);
    await seedDevice(context, { settings: { ...MOTION_ONLY, timingSettings: cooldownPeriod(20) }, pictures: { noticeAnswered: true } });
    await canvasCamera(page, LEFT_THIRD);
    // Within the 3 days a picture is kept at first: the age deletes none of them as the watch starts.
    const oldest = Date.now() - 2 * 60 * 60_000;
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

    const first = rows[0].picture!.id as string;
    await expect.poll(async () => {
      const reading = await databaseNow(page);
      return reading ? monitoringAlerts(reading).some((row) => row.id === rows[0].alert.id) : true;
    }, { timeout: 60_000, message: 'the oldest alert leaves when the 101st is saved' }).toBe(false);
    // The 101st alert's picture is written after its alert, in its own write: the reading waits for it.
    const seeded = new Set(rows.map((row) => row.picture!.id as string));
    await expect.poll(async () => keptRows(await readDatabase(page)).some((row) => !seeded.has(row.id as string)), {
      timeout: 15_000, message: 'the 101st alert’s picture is kept',
    }).toBe(true);
    const reading = (await readDatabase(page))!;
    expect(monitoringAlerts(reading)).toHaveLength(100);
    expect(reading.pictures.map((row) => row.id)).not.toContain(first);
    // The other 99 are kept, with the 101st alert's own picture.
    const kept = keptRows(reading).map((row) => row.id as string);
    expect(kept).toEqual(expect.arrayContaining(rows.slice(1).map((row) => row.picture!.id as string)));
    expect(kept).toHaveLength(100);
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
          const tile = (await card.locator('.alert-picture__tile', { has: page.getByRole('img', { name: closeUpName(time), exact: true }) }).boundingBox())!;
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
  for (const width of [390, 1280]) {
    test.describe(`The Sound card on the sample clip, ${width} px, ${look}`, () => {
      test.use({ colorScheme: look, viewport: { width, height: 900 } });
      test.beforeEach(() => requireSampleClip());

      test(`a Sound alert's card shows the picture with no box and says what the camera saw when the sound came, ${width} px, ${look}`, async ({ page, context }) => {
        test.setTimeout(180_000);
        await watchWith(page, context, { settings: clipSettings({ motion: false, sound: true }) });
        const card = cards(page).first();
        const time = await timeOf(card, 'Sound');
        await expect(card.getByRole('img', { name: pictureName(time, false), exact: true })).toBeVisible();
        await expect(card.getByText('What the camera saw when the sound came.', { exact: true })).toBeVisible();
        await expect(card.locator('.alert-picture__box')).toHaveCount(0);
        await expect(card.getByRole('img', { name: /^Close-up/ })).toHaveCount(0);
        await expect(liveBox(page)).toHaveCount(0);
        await expect(livePlate(page)).toHaveCount(0);
      });
    });
  }

  test.describe(`Two cards on the sample clip, 1280 px, ${look}`, () => {
    test.use({ colorScheme: look, viewport: { width: 1280, height: 900 } });
    test.beforeEach(() => requireSampleClip());

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

for (const look of ['light', 'dark'] as const) {
  test.describe(`The card on a canvas camera, 1280 px, ${look}`, () => {
    test.use({ colorScheme: look, viewport: { width: 1280, height: 900 } });

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
      await page.getByRole('button', { name: 'Stop watching', exact: true }).click();
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
  });
}

for (const look of ['light', 'dark'] as const) {
  test.describe(`The card on a canvas camera, 390 px, ${look}`, () => {
    test.use({ colorScheme: look, viewport: { width: 390, height: 900 } });

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
}

describeInBothLooks('The card for an alert of another kind or one saved before pictures', () => {
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

for (const look of ['dark', 'light'] as const) {
  for (const width of [390, 1280]) {
    test.describe(`Three events on a canvas camera, ${width} px, ${look}`, () => {
      test.use({ colorScheme: look, viewport: { width, height: 900 } });

      test(`the newest card shows its pictures large and older cards a thumbnail, ${width} px, ${look}`, async ({ page, context }) => {
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
        if (width === 390) {
          const keys = cards(page).locator('.alert-pictures-keys');
          await expect(keys).toHaveCount(3);
          const largeText = await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
          const overflowing = cards(page).locator('.alert-pictures-keys[data-overflows]');
          await expect(overflowing).toHaveCount(3);
          await largeText.evaluate((style) => {
            style.parentNode?.removeChild(style);
          });
          await expect(overflowing, 'the arrows leave when the keys fit again').toHaveCount(0);
          for (const keyRow of await keys.all()) {
            await keyRow.scrollIntoViewIfNeeded();
            await expect(openKey(keyRow)).toBeInViewport({ ratio: 1 });
            await expect(keyRow.getByRole('button', { name: 'Acknowledge', exact: true })).toBeInViewport({ ratio: 1 });
          }
        }
        if (width === 1280) {
          const top = (await cards(page).first().boundingBox())!.y;
          const last = (await cards(page).last().boundingBox())!;
          expect(last.y + last.height - top, 'the three cards together').toBeLessThanOrEqual(720);
        }
      });
    });
  }
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
        expect(await scrollsSideways(page), await sidewaysParts(page)).toBe(false);
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
  describeInBothLooks(`The fourth level's bar${reduced ? ' under reduced motion' : ''}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, contextOptions: { reducedMotion: reduced ? 'reduce' : 'no-preference' } });

    test(`a card's fourth-level bar holds its colour with no pulse under reduced motion${reduced ? '' : ': without it, it pulses until Acknowledge'}`, async ({ page, context }) => {
      test.setTimeout(150_000);
      // The five levels a second apart, and the sound muted, seeded with the settings in one write.
      const levels = [1, 2, 3, 4, 5].map((level) => ({
        level, name: `Level ${level}`, description: '', volumeMultiplier: 1, delaySeconds: level === 1 ? 0 : 1, soundType: 'notification',
      }));
      await seedDevice(context, { settings: { ...MOTION_ONLY, alertEscalationLevels: levels, globalMute: true }, pictures: { noticeAnswered: true } });
      // Only an alert the running watch raised grows louder: the watch raises it.
      await canvasCamera(page, LEFT_THIRD);
      await page.goto('/monitor/', { waitUntil: 'networkidle' });
      await startWatching(page);
      const card = cards(page).first();
      await expect(card.getByText(/^Level [45]$/)).toBeVisible({ timeout: 60_000 });
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
const startKey = (page: Page) => page.locator('.watch-frame').getByRole('button', { name: 'Start watching', exact: true });
const live = (page: Page) => page.locator('.watch-frame[data-phase="live"]');
const listLine = (page: Page, line: string) => page.locator('.alert-list-line').filter({ hasText: line });

const keptRows = (reading: DatabaseReading | null) => (reading?.pictures ?? []).filter((row) => row.state === 'kept');
/** How many pictures the store keeps, or -1 while it cannot be read. */
const keptCount = async (page: Page) => {
  const reading = await databaseNow(page);
  return reading ? keptRows(reading).length : -1;
};

/** True when the two parts stand on one row: their boxes share some height. */
const onOneRow = async (a: Locator, b: Locator) => {
  const [first, second] = [(await a.boundingBox())!, (await b.boundingBox())!];
  return first.y < second.y + second.height && second.y < first.y + first.height;
};

/** Opens the watch's settings group "Alert pictures" and answers it. */
async function openWatchGroup(page: Page): Promise<Locator> {
  const settings = page.getByRole('button', { name: 'Show settings', exact: true });
  if (await settings.isVisible()) await settings.click();
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
  describeInBothLooks(`The notice before the first watch, ${width} px`, () => {
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

test.describe('The dashboard’s start before the notice is answered, 390 px', () => {
  test.use({ viewport: { width: 390, height: 900 } });

  test('the dashboard’s start opens the notice before the watch, and Go back closes the camera it opened', async ({ page, context }) => {
    test.setTimeout(150_000);
    // No alert pictures settings are saved: the device has not answered the notice.
    await seedDevice(context, { settings: MOTION_ONLY });
    await canvasCamera(page, LEFT_THIRD);
    await page.goto('/dashboard/', { waitUntil: 'networkidle' });
    const dashKey = page.locator('.dash-key-place .dash-key');
    await expect(dashKey).toBeVisible({ timeout: 20_000 });
    await dashKey.click();
    await page.waitForURL(/\/monitor\/?$/, { timeout: 30_000 });

    const dialog = notice(page);
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(live(page)).toHaveCount(0);
    expect((await readDatabase(page)).pictures).toEqual([]);

    await dialog.getByRole('button', { name: 'Go back', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(startKey(page)).toBeVisible();
    await expect(live(page)).toHaveCount(0);
    // The camera the dashboard opened for this start is closed with it.
    await expect.poll(() => liveCameras(page), { timeout: 5_000 }).toBe(0);

    // The page's own key asks again, and Start watching starts the watch.
    await startKey(page).click();
    await notice(page).getByRole('button', { name: 'Start watching', exact: true }).click();
    await live(page).waitFor({ state: 'visible', timeout: 30_000 });
    await expect(notice(page)).toHaveCount(0);
  });
});

/** The choice of what an alert keeps, as a group; neither of setup's steps holds it. */
const keepsGroup = (page: Page) => page.getByRole('group', { name: 'Each alert keeps a picture', exact: true });

for (const look of ['dark', 'light'] as const) {
  test.describe(`Setup's two steps, 390 px, ${look}`, () => {
    test.use({ colorScheme: look, viewport: { width: 390, height: 844 } });

    test(`a device set up through setup's two steps gets the notice before its first watch, ${look}`, async ({ page, context }) => {
      test.setTimeout(150_000);
      // A first visit: setup not finished and no alert pictures settings saved.
      await context.grantPermissions(['camera', 'microphone']);
      await context.addInitScript(() => {
        localStorage.setItem('safeos-notification-prompt-dismissed', String(Date.now()));
        localStorage.setItem('safeos-pwa-prompt-dismissed', String(Date.now()));
      });
      await canvasCamera(page, LEFT_THIRD);
      await page.goto('/setup/', { waitUntil: 'networkidle' });
      await expect(page.getByRole('heading', { level: 1, name: 'Use this device to watch a place' })).toBeVisible();
      await expect(keepsGroup(page)).toHaveCount(0);
      await page.getByRole('button', { name: 'Turn on the camera', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'What is it watching?' })).toBeVisible({ timeout: 30_000 });
      await expect(keepsGroup(page)).toHaveCount(0);
      await page.getByRole('radio', { name: 'A pet', exact: true }).check();
      await page.getByRole('button', { name: 'Open dashboard', exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard\/?$/);
      expect((await storedPictures(page)).noticeAnswered ?? false).toBe(false);

      // The first watch asks what an alert keeps before it starts.
      await page.goto('/monitor/', { waitUntil: 'networkidle' });
      await startKey(page).click();
      await expect(notice(page)).toBeVisible();
      await expect(live(page)).toHaveCount(0);
      await notice(page).getByRole('button', { name: 'Start watching', exact: true }).click();
      await live(page).waitFor({ state: 'visible', timeout: 30_000 });
      expect((await storedPictures(page)).noticeAnswered).toBe(true);
    });
  });
}

for (const look of ['light', 'dark'] as const) {
  test.describe(`Keeping pictures, 390 px, ${look}`, () => {
    test.use({ colorScheme: look, viewport: { width: 390, height: 900 } });

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

      // A newer alert, saved, moves it down the list to the small form: its line goes with it.
      await setFault(page, {});
      await raiseEvents(page, 3, 3);
      const moved = cards(page).nth(1);
      await expect(moved.locator('.alert-picture').first()).toHaveAttribute('data-form', 'small');
      await expect(moved.locator('.alert-picture img').first()).toBeVisible();
      await expect(moved.getByText(SAVE_FAILED_LINE, { exact: true })).toBeVisible();
      await expect(moved.locator('.alert-picture__problem')).toHaveCount(1);
      await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBe(2);

      await page.reload({ waitUntil: 'networkidle' });
      await expect(cards(page)).toHaveCount(3);
      await expect(cards(page).nth(1).getByText('No picture was kept for this alert.', { exact: true })).toBeVisible();
      await expect(cards(page).first().locator('.alert-picture img').first()).toBeVisible();
      await expect(cards(page).nth(2).locator('.alert-picture img').first()).toBeVisible();
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
      // A read that fails proves nothing: it answers neither yes nor no.
      await expect.poll(async () => {
        const reading = await databaseNow(page);
        return reading ? keptRows(reading).map((row) => row.id).includes(before[0]) : 'unread';
      }, { timeout: 15_000 }).toBe(false);
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

      // Out of room for this visit: the dashboard says so, as it does for an alert the device refused.
      await page.locator('nav[aria-label="App"]:visible').getByRole('link', { name: 'Dashboard', exact: true }).click();
      await page.waitForURL(/\/dashboard\/?$/, { timeout: 60_000 });
      await expect(page.getByRole('status').filter({ hasText: 'This device is out of room, so new alerts and pictures cannot be saved.' }))
        .toBeVisible({ timeout: 15_000 });
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
}

for (const look of ['dark', 'light'] as const) {
  test.describe(`The kept files, 390 px, ${look}`, () => {
    test.use({ colorScheme: look, viewport: { width: 390, height: 900 } });

    test(`the frame and the close-up are kept at their sizes as JPEG files, 390 px, ${look}`, async ({ page, context }) => {
      test.setTimeout(180_000);
      // A 1280 by 720 camera whose left third changes: the kept frame is the frame at 640 px on its
      // long edge, and the close-up, cut from the full frame, is brought down to 480 px on its own.
      await watchWith(page, context, {
        settings: MOTION_ONLY,
        camera: { width: 1280, height: 720, background: 128, moving: { x: 0, y: 0, width: 1 / 3, height: 1 }, levels: [0, 85, 170, 255] },
      });
      const card = cards(page).first();
      const time = await timeOf(card, 'Motion');
      await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
      const reading = await readDatabase(page);
      const [alert] = monitoringAlerts(reading);
      const row = keptRows(reading).find((picture) => picture.id === alert.pictureId)!;
      expect(row, 'the alert names its kept picture').toBeTruthy();
      expect(row.frame.type).toBe('image/jpeg');
      expect([row.frameWidth, row.frameHeight]).toEqual([640, 360]);
      expect([row.sourceWidth, row.sourceHeight]).toEqual([1280, 720]);
      // The box is the six changed columns of the check's grid, 480 by 720 of the camera's frame;
      // widened by an eighth and kept inside the frame it is 540 by 720, kept at 360 by 480.
      expect(row.box).toEqual({ x: 0, y: 0, width: 240, height: 360 });
      expect(row.closeUp.type).toBe('image/jpeg');
      expect([row.closeUpWidth, row.closeUpHeight]).toEqual([360, 480]);
      expect(await naturalSize(card.getByRole('img', { name: pictureName(time, true), exact: true }))).toEqual({ width: 640, height: 360 });
      expect(await naturalSize(card.getByRole('img', { name: closeUpName(time), exact: true }))).toEqual({ width: 360, height: 480 });
      // No picture stands as a data URL in an alert's record or in local storage.
      expect(JSON.stringify(reading.alerts)).not.toContain('data:image');
      expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage)))).not.toContain('data:image');
    });
  });
}

describeInBothLooks('An expired picture on the watch, 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a card keeps its words after its picture expires', async ({ page, context }) => {
    await seedDevice(context, { settings: MOTION_ONLY, pictures: { noticeAnswered: true } });
    await canvasCamera(page, { ...LEFT_THIRD, moving: { ...LEFT_THIRD.moving, width: 0 } });
    const [pictureId] = await seedKept(page, 1);
    await redatePicture(page, pictureId, Date.now() - 4 * DAY);
    await page.goto('/monitor/', { waitUntil: 'networkidle' });
    await startWatching(page);
    const card = cards(page).first();
    await expect(card.getByText(kindLine('Motion'))).toBeVisible();
    await expect(card.getByText('Its picture was deleted after 3 days.', { exact: true })).toBeVisible();
    await expect(openKey(card)).toHaveCount(0);
    expect(await keptCount(page)).toBe(0);
  });
});

for (const width of [390, 1280]) {
  describeInBothLooks(`The group "Alert pictures", ${width} px`, () => {
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
      // The key left with the pictures: focus moves to the control before it in the group.
      await expect(afterSelect(onWatch)).toBeFocused();
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

  describeInBothLooks('Changing the picture age', () => {
    test('a picture past its age is deleted while the watch runs, and the card says after how long', async ({ page, context }) => {
      test.setTimeout(300_000);
      await watchWith(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD, pictures: { noticeAnswered: true, deleteAfterDays: 1 } });
      const card = cards(page).first();
      await timeOf(card, 'Motion');
      // The picture holds still from here, so the event ends and no repeat puts a newer picture on the card.
      await page.evaluate(() => { window.__camera!.moving.width = 0; });
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
      await page.evaluate(() => { window.__camera!.moving.width = 0; });
      await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBe(1);
      const [second] = keptRows(await readDatabase(page));
      await redatePicture(page, second.id, Date.now() - 400 * DAY);
      await page.waitForTimeout(75_000);
      expect(keptRows(await readDatabase(page)).map((row) => row.id)).toEqual([second.id]);
      await expect(cards(page).first().locator('.alert-picture img').first()).toBeVisible();
    });
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

  describeInBothLooks('Keeping pictures in other tabs and profiles', () => {
    test('a second tab shows the kept pictures and another profile shows none', async ({ page, context, browser, colorScheme }) => {
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

      const other = await browser.newContext({ colorScheme, viewport: { width: 1280, height: 900 } });
      await seedDevice(other, { settings: MOTION_ONLY, pictures: { noticeAnswered: true } });
      const stranger = await other.newPage();
      await stranger.goto('/monitor/', { waitUntil: 'networkidle' });
      await expect(startKey(stranger)).toBeVisible();
      await expect(cards(stranger)).toHaveCount(0);
      expect((await readDatabase(stranger)).pictures).toEqual([]);
      await other.close();
    });
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
  describeInBothLooks('Clearing a picture while it is being saved', () => {
    for (const way of ['Delete all pictures', 'Clear all data on this device', 'Clear all'] as const) {
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
        else if (way === 'Clear all data on this device') await other.goto('/settings/data/', { waitUntil: 'networkidle' });
        else await other.goto('/settings/test-alerts/', { waitUntil: 'networkidle' });

        // The next alert's picture is handed back 30 seconds after it is drawn: its save waits.
        const HOLD_MS = 30_000;
        await setFault(page, { holdDrawMs: HOLD_MS });
        await raiseEvents(page, 2, 2);
        const held = cards(page).first();
        await expect(held.locator('.alert-picture__wait')).toBeVisible();
        const heldSince = Date.now();
        // The picture holds still: the event ends with no repeat, and no later alert comes.
        await page.evaluate(() => { window.__camera!.moving.width = 0; });

        if (way === 'Delete all pictures') {
          await deleteAll(group(other)).click();
          await other.getByRole('alertdialog').getByRole('button', { name: 'Delete all pictures', exact: true }).click();
          await expect(countLine(group(other))).toHaveText('No pictures kept on this device');
        } else if (way === 'Clear all data on this device') {
          await other.getByRole('button', { name: 'Clear all data on this device', exact: true }).click();
          await other.getByRole('button', { name: 'Clear all data', exact: true }).click();
          await expect.poll(() => savedAlertCount(other), { timeout: 15_000 }).toBe(0);
        } else {
          // The alert list's own clear, on Settings' test alerts.
          await other.getByRole('button', { name: 'Clear All', exact: true }).click();
          await expect.poll(() => savedAlertCount(other), { timeout: 15_000 }).toBe(0);
        }
        // The clear came while the save still waited. A clear of the alerts empties this tab's list
        // too, so the time tells it there.
        if (way === 'Delete all pictures') {
          await expect(held.locator('.alert-picture__wait'), 'the save waits until after the clear').toBeVisible();
        } else {
          const draws = await heldDraws(page);
          expect(draws.held, 'the save’s picture is held').toBeGreaterThan(0);
          expect(draws.handed, 'the clear came while the save still waited').toBe(0);
          await expect(cards(page)).toHaveCount(0);
        }

        // The held save goes on now, and writes nothing.
        await page.waitForTimeout(Math.max(0, HOLD_MS - (Date.now() - heldSince)) + 5_000);
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
  });

  test('a save running when Delete all pictures fails in another tab is written', async ({ page, context }) => {
    test.setTimeout(180_000);
    await seedDevice(context, { settings: MOTION_ONLY, pictures: { noticeAnswered: true } });
    await canvasCamera(page, LEFT_THIRD);
    await faultPictureStore(page);
    await page.goto('/monitor/', { waitUntil: 'networkidle' });
    await startWatching(page);
    await timeOf(cards(page).first(), 'Motion');
    await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBe(1);

    // In the other tab, Delete all pictures' transaction aborts as it commits, after its marker is written.
    const other = await context.newPage();
    await faultPictureStore(other);
    await other.goto('/settings/detection/', { waitUntil: 'networkidle' });
    await setFault(other, { deleteAllAborts: true });

    // The next alert's picture is handed back 30 seconds after it is drawn: its save waits.
    const HOLD_MS = 30_000;
    await setFault(page, { holdDrawMs: HOLD_MS });
    await raiseEvents(page, 2, 2);
    const held = cards(page).first();
    await expect(held.locator('.alert-picture__wait')).toBeVisible();
    const heldSince = Date.now();
    // The picture holds still: the event ends with no repeat, and no later alert comes.
    await page.evaluate(() => { window.__camera!.moving.width = 0; });

    await deleteAll(group(other)).click();
    await other.getByRole('alertdialog').getByRole('button', { name: 'Delete all pictures', exact: true }).click();
    await expect(group(other).getByText(DELETE_FAILED_LINE, { exact: true })).toBeVisible();
    await expect(held.locator('.alert-picture__wait'), 'the save waits until after the failed deletion').toBeVisible();

    // The held save goes on now. Nothing was deleted, so its picture is written beside the first.
    await page.waitForTimeout(Math.max(0, HOLD_MS - (Date.now() - heldSince)) + 5_000);
    await expect.poll(async () => keptRows(await readDatabase(page)).length, { timeout: 15_000 }).toBe(2);
    const time = await timeOf(held, 'Motion');
    await expect(held.getByRole('img', { name: pictureName(time, true), exact: true })).toBeVisible();
    await expect(held.getByText('You deleted its picture.', { exact: true })).toHaveCount(0);
    await other.close();
  });

  test('a picture taken while a Delete all pictures that then fails waits to commit is written', async ({ page, context }) => {
    test.setTimeout(180_000);
    await seedDevice(context, { settings: MOTION_ONLY, pictures: { noticeAnswered: true } });
    await canvasCamera(page, LEFT_THIRD);
    await faultPictureStore(page);
    await page.goto('/monitor/', { waitUntil: 'networkidle' });
    await startWatching(page);
    await timeOf(cards(page).first(), 'Motion');
    await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBe(1);
    // The picture holds still: the event ends.
    await page.evaluate(() => { window.__camera!.moving.width = 0; });
    await page.waitForTimeout(3_000);

    // In the other tab, Delete all pictures' transaction stays open 20 seconds after its marker is
    // written, then aborts.
    const WAIT_MS = 20_000;
    const other = await context.newPage();
    await faultPictureStore(other);
    await other.goto('/settings/detection/', { waitUntil: 'networkidle' });
    await setFault(other, { deleteAllAbortsAfterMs: WAIT_MS });
    await deleteAll(group(other)).click();
    await other.getByRole('alertdialog').getByRole('button', { name: 'Delete all pictures', exact: true }).click();
    const pressed = Date.now();
    // While it waits, the watch raises its next alert, and takes its picture.
    await page.evaluate(() => { window.__camera!.moving.width = 1 / 3; });
    await expect(cards(page)).toHaveCount(2, { timeout: 15_000 });
    expect(Date.now() - pressed, 'the alert came while the deletion waited').toBeLessThan(WAIT_MS - 2_000);
    await page.evaluate(() => { window.__camera!.moving.width = 0; });

    // The deletion fails. The new picture, taken after the press, is written beside the first.
    await expect(group(other).getByText(DELETE_FAILED_LINE, { exact: true })).toBeVisible({ timeout: WAIT_MS + 10_000 });
    await expect.poll(async () => keptRows(await readDatabase(page)).length, { timeout: 15_000 }).toBe(2);
    await other.close();
  });

  test('a picture another tab deletes while its save waits stays deleted', async ({ page, context }) => {
    test.setTimeout(180_000);
    await seedDevice(context, { settings: MOTION_ONLY, pictures: { noticeAnswered: true } });
    await canvasCamera(page, LEFT_THIRD);
    await faultPictureStore(page);
    // Another tab holds History open from before the watch: it reads each alert as the watch saves it.
    const other = await context.newPage();
    await faultPictureStore(other);
    await other.goto('/history/', { waitUntil: 'networkidle' });
    await page.goto('/monitor/', { waitUntil: 'networkidle' });
    await startWatching(page);
    await timeOf(cards(page).first(), 'Motion');
    await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBe(1);

    // The other tab's picture reads fail from now on, so it offers Delete picture without reading.
    await setFault(other, { reads: 'error' });
    // The next alert's picture is handed back 30 seconds after it is drawn: its save waits.
    const HOLD_MS = 30_000;
    await setFault(page, { holdDrawMs: HOLD_MS });
    await raiseEvents(page, 2, 2);
    const held = cards(page).first();
    await expect(held.locator('.alert-picture__wait')).toBeVisible();
    const heldSince = Date.now();
    // The picture holds still: the event ends with no repeat, so the card keeps this alert's time.
    await page.evaluate(() => { window.__camera!.moving.width = 0; });
    const time = await timeOf(held, 'Motion');

    // The other tab lists the alert while its picture waits, and the person deletes the picture there.
    await expect.poll(() => savedAlertCount(page), { timeout: 12_000 }).toBe(2);
    const row = historyRows(other).filter({ hasText: time }).filter({ hasText: 'Motion' });
    await expect(row.getByText(UNREADABLE_LINE, { exact: true })).toBeVisible({ timeout: 15_000 });
    await openKey(row).click();
    const dialog = opened(other);
    await deleteKey(dialog).click();
    await confirmDelete(other).click();
    await expect(dialog).toHaveCount(0);
    // No picture the hold took has been handed back: the save has not begun.
    const draws = await heldDraws(page);
    expect(draws.held, 'the save’s picture is held').toBeGreaterThan(0);
    expect(draws.handed, 'the delete came while the save waited').toBe(0);

    // The held save goes on now, and writes nothing over the delete.
    await page.waitForTimeout(Math.max(0, HOLD_MS - (Date.now() - heldSince)) + 5_000);
    const reading = await readDatabase(page);
    expect(keptRows(reading), 'only the first alert’s picture is kept').toHaveLength(1);
    await expect(held.getByText(DELETED_LINE, { exact: true })).toBeVisible();
    await other.close();
  });

  describeInBothLooks('Keeping pictures with a server connected', () => {
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
      // The device holds a session with that server, as a person who signed in to it does.
      await context.addInitScript(() => {
        localStorage.setItem('safeos-auth', JSON.stringify({ state: {
          sessionToken: 'walk-token', sessionId: 'walk-session', deviceId: 'walk-device', isGuest: true,
        }, version: 0 }));
      });
      await page.goto('/monitor/', { waitUntil: 'networkidle' });
      await startWatching(page);
      await timeOf(cards(page).first(), 'Motion');
      await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBe(1);
      const frames = () => server.messages.filter((message) => /"type":\s*"frame"/.test(message)).length;
      await expect.poll(frames, { timeout: 60_000 }).toBeGreaterThanOrEqual(1).catch(() => {
        // What the server did hear, so a missing frame says why.
        throw new Error(`the page's ordinary frames did not reach the server; it heard ${server.messages.length} messages: `
          + `${server.messages.map((message) => message.slice(0, 60)).join(' | ').slice(0, 600)}; requests: `
          + `${bodies.map((body) => body.slice(0, 90)).join(' | ').slice(0, 1200)}`);
      });

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
      // A JPEG opens with its encoder's header, the same in every file this browser writes, so the
      // kept picture is told by its own data: a stretch from its middle and its end.
      const own = (file: string) => [file.slice(Math.floor(file.length / 2), Math.floor(file.length / 2) + 400), file.slice(-400)];
      for (const stretch of own(kept.frame)) expect(sent.includes(stretch), 'no stretch of the kept frame reaches the server').toBe(false);
      if (kept.closeUp) {
        for (const stretch of own(kept.closeUp)) expect(sent.includes(stretch), 'no stretch of the close-up reaches the server').toBe(false);
      }
      expect(sent).not.toContain(kept.box);
      expect(sent).not.toMatch(/pictureId|sourceBox|closeUp|alert_picture/);
    });
  });
});

test.describe('The group and the notice: order, sizes and faults', () => {
  describeInBothLooks('Picture settings and notice keyboard order, 1280 px', () => {
    test.use({ viewport: { width: 1280, height: 900 } });

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
  });

  // The walks below double the text and then read one box after another, each in its own call.
  // Those boxes are of one page only when the page has stopped changing by the time the text
  // step returns. This reads the switch's row frame by frame from that moment.
  test('the 200 per cent text step returns with the page at rest, 320 px', async ({ page, context }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await seedDevice(context, { settings: MOTION_ONLY });
    await seedKept(page, 2);
    await page.goto('/monitor/', { waitUntil: 'networkidle' });
    const found = await openWatchGroup(page);
    await doubleText(page);
    const read = await keepSwitch(found).evaluate(async (key) => {
      const label = key.closest('.alert-pictures-row')!.querySelector('.alert-pictures-row__label')!;
      const fold = key.closest('[id$="-content"]') as HTMLElement;
      const running = () => document.getAnimations()
        .filter((animation): animation is CSSTransition => animation instanceof CSSTransition && animation.playState === 'running');
      const reading = () => {
        const counts: Record<string, number> = {};
        for (const { transitionProperty } of running()) counts[transitionProperty] = (counts[transitionProperty] ?? 0) + 1;
        const [labelBox, keyBox] = [label.getBoundingClientRect(), key.getBoundingClientRect()];
        return {
          labelTop: Math.round(labelBox.top),
          switchTop: Math.round(keyBox.top),
          rowHeight: Math.round(Math.max(labelBox.height, keyBox.height)),
          scrollY: Math.round(scrollY),
          pageHeight: document.documentElement.scrollHeight,
          labelSize: getComputedStyle(label).fontSize,
          transitions: Object.entries(counts).map(([property, count]) => `${property} x${count}`).sort().join(', '),
        };
      };
      const began = performance.now();
      const first = reading();
      const frames = [{ ms: 0, ...first }];
      let last = JSON.stringify(first);
      // Every frame that differs from the one before it, until twelve frames in a row are the same.
      for (let same = 0; same < 12 && frames.length < 240;) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const now = reading();
        if (JSON.stringify(now) === last) same += 1;
        else {
          same = 0;
          last = JSON.stringify(now);
          frames.push({ ms: Math.round(performance.now() - began), ...now });
        }
      }
      return {
        frames,
        // The fold round the group: the height it allows, and the height its content takes.
        fold: { maxHeight: fold.style.maxHeight, shown: fold.clientHeight, content: fold.scrollHeight },
      };
    });
    await test.info().attach('text-step-frames.json', { body: JSON.stringify(read, null, 2), contentType: 'application/json' });
    expect.soft(read.frames[0].transitions, 'transitions still running when the text step returned').toBe('');
    expect(read.frames.slice(1), 'what the page changed after the text step returned').toEqual([]);
  });

  // The measure of one row reads two boxes, and they are of one page only when nothing moves
  // between the two reads. Here the page moves on every task: the row steps down by more than
  // its own height each time, as a page does while the sizes above the row are changing.
  test('the measure of one row holds while the page moves under it, 320 px', async ({ page, context }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await seedDevice(context, { settings: MOTION_ONLY });
    await seedKept(page, 2);
    await page.goto('/monitor/', { waitUntil: 'networkidle' });
    const found = await openWatchGroup(page);
    const label = found.getByText('Keep alert pictures', { exact: true }).first();
    expect(await onOneRow(label, keepSwitch(found)), 'at rest the switch stands beside its label').toBe(true);
    await keepSwitch(found).evaluate((key) => {
      const row = key.closest<HTMLElement>('.alert-pictures-row')!;
      const channel = new MessageChannel();
      let step = 0;
      channel.port1.onmessage = () => {
        if (row.dataset.moving === 'over') {
          row.style.marginTop = '';
          return;
        }
        step = (step + 1) % 2000;
        row.style.marginTop = `${step * 400}px`;
        channel.port2.postMessage(null);
      };
      row.dataset.moving = 'yes';
      channel.port2.postMessage(null);
    });
    const reads: boolean[] = [];
    for (let read = 0; read < 5; read++) reads.push(await onOneRow(label, keepSwitch(found)));
    await keepSwitch(found).evaluate((key) => { key.closest<HTMLElement>('.alert-pictures-row')!.dataset.moving = 'over'; });
    expect(reads, 'the switch stands beside its label in every read of the moving page').toEqual([true, true, true, true, true]);
  });

  // What the text step moves, from the moment the size changes: the switch's row frame by frame
  // for three seconds, the transitions the change starts and the folds round the row.
  for (const look of ['dark', 'light'] as const) {
    test(`what the 200 per cent text step moves, frame by frame, 320 px, ${look}`, async ({ page, context }) => {
      test.setTimeout(120_000);
      await page.emulateMedia({ colorScheme: look });
      await page.setViewportSize({ width: 320, height: 700 });
      await seedDevice(context, { settings: MOTION_ONLY });
      await canvasCamera(page, LEFT_THIRD);
      await seedKept(page, 2);
      await page.goto('/monitor/', { waitUntil: 'networkidle' });
      await startKey(page).click();
      await notice(page).getByRole('button', { name: 'Start watching', exact: true }).click();
      await live(page).waitFor({ state: 'visible', timeout: 30_000 });
      await page.reload({ waitUntil: 'networkidle' });
      const found = await openWatchGroup(page);
      const label = found.getByText('Keep alert pictures', { exact: true }).first();
      // How long the measure's second read takes to land after its first.
      const gaps: number[] = [];
      for (let pair = 0; pair < 10; pair++) {
        await label.boundingBox();
        const between = performance.now();
        await keepSwitch(found).boundingBox();
        gaps.push(Math.round((performance.now() - between) * 10) / 10);
      }
      const read = await keepSwitch(found).evaluate(async (key) => {
        const row = key.closest('.alert-pictures-row')!;
        const words = row.querySelector('.alert-pictures-row__label')!;
        const before = (part: Element) => !part.contains(row) && (part.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
        const running = () => document.getAnimations()
          .filter((animation): animation is CSSTransition => animation instanceof CSSTransition && animation.playState !== 'finished' && animation.playState !== 'idle');
        const reading = () => {
          const [wordsBox, keyBox] = [words.getBoundingClientRect(), key.getBoundingClientRect()];
          const now = running();
          return {
            label: Math.round(wordsBox.top),
            labelHeight: Math.round(wordsBox.height),
            key: Math.round(keyBox.top),
            keyHeight: Math.round(keyBox.height),
            scroll: Math.round(scrollY),
            page: document.documentElement.scrollHeight,
            running: now.length,
            runningAbove: now.filter((transition) => {
              const target = (transition.effect as KeyframeEffect | null)?.target;
              return target ? before(target) : false;
            }).length,
          };
        };
        const folds = () => Array.from(document.querySelectorAll<HTMLElement>('[id$="-content"]')).map((fold) => ({
          id: fold.id,
          max: fold.style.maxHeight,
          shown: fold.clientHeight,
          content: fold.scrollHeight,
          place: fold.contains(row) ? 'holds the row' : before(fold) ? 'above the row' : 'below the row',
        }));
        const start = { ...reading(), folds: folds() };
        const style = document.createElement('style');
        style.textContent = 'html { font-size: 200% !important; }';
        document.head.appendChild(style);
        const began = performance.now();
        const frames = [{ ms: 0, ...reading() }];
        // The transitions the change started, by the part they run on.
        const started: Record<string, { parts: number; properties: string[]; ms: number }> = {};
        const seen = new Map<Element, string>();
        for (const transition of running()) {
          const effect = transition.effect as KeyframeEffect | null;
          const target = effect?.target;
          if (!target) continue;
          const name = `${before(target) ? 'above' : target.contains(row) ? 'round' : 'below'} ${target.tagName.toLowerCase()}.${String(target.getAttribute('class') ?? '').slice(0, 60)}`;
          started[name] ??= { parts: 0, properties: [], ms: Number(effect!.getTiming().duration) };
          if (seen.get(target) !== name) {
            seen.set(target, name);
            started[name].parts += 1;
          }
          if (!started[name].properties.includes(transition.transitionProperty)) started[name].properties.push(transition.transitionProperty);
        }
        while (performance.now() - began < 3000) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
          const now = { ms: Math.round(performance.now() - began), ...reading() };
          const last = frames[frames.length - 1];
          if (now.label !== last.label || now.key !== last.key || now.labelHeight !== last.labelHeight || now.scroll !== last.scroll
            || now.page !== last.page || now.running !== last.running || now.runningAbove !== last.runningAbove) frames.push(now);
        }
        return { start, started, frames, end: { ...reading(), folds: folds() } };
      });
      // The pairs of frames the two-read measure calls two rows, and the shortest time between such a pair.
      let apart = 0;
      let soonest = Infinity;
      for (let first = 0; first < read.frames.length; first++) {
        for (let second = first + 1; second < read.frames.length; second++) {
          const [a, b] = [read.frames[first], read.frames[second]];
          if (a.label < b.key + b.keyHeight && b.key < a.label + a.labelHeight) continue;
          apart += 1;
          soonest = Math.min(soonest, b.ms - a.ms);
        }
      }
      console.log(`TEXT-STEP ${look} ${JSON.stringify({ gaps, apart, soonest: apart ? soonest : null, ...read })}`);
    });
  }

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
          expect(await onOneRow(goBack, start), `the notice's two keys keep one row at ${text} per cent`).toBe(true);
          // Where the keys do not fit, the row scrolls inside itself between its two arrow keys.
          const keys = dialog.locator('.alert-pictures-keys');
          if (await keys.locator('.alert-pictures-keys__row').evaluate((row) => row.scrollWidth > row.clientWidth + 1)) {
            await expect(keys.getByRole('button', { name: 'Previous keys', exact: true })).toBeDisabled();
            // Next keys moves the row on until its last key's end shows, where it is inactive.
            const next = keys.getByRole('button', { name: 'Next keys', exact: true });
            for (let press = 0; press < 6 && await next.isEnabled(); press++) await next.click();
            await expect(next).toBeDisabled();
            await expect(start).toBeInViewport();
            const [row, last] = [(await keys.locator('.alert-pictures-keys__row').boundingBox())!, (await start.boundingBox())!];
            expect(last.x + last.width, 'the last key’s end shows inside the row').toBeLessThanOrEqual(row.x + row.width + 1);
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
          expect(await onOneRow(found.getByText('Keep alert pictures', { exact: true }).first(), keepSwitch(found)), `the switch's row keeps one row at ${text} per cent`).toBe(true);
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
          // The select's and the outlined keys' edges: the look's edge colour, at 3:1 or more on their ground.
          expect(await controlEdges(dialog, EDGE[look]), 'the notice’s control edges').toEqual([]);
          await dialog.getByRole('button', { name: 'Go back', exact: true }).click();
          const found = await openWatchGroup(page);
          await expect(countLine(found)).toHaveText('2 pictures kept on this device');
          expect(await readable(found, BLOCK_READABILITY), 'the group’s words').toEqual([]);
          expect(await controlEdges(found, EDGE[look]), 'the group’s control edges').toEqual([]);

          // The same group on Settings, Detection.
          await page.goto('/settings/detection/', { waitUntil: 'networkidle' });
          const settings = group(page);
          await expect(countLine(settings)).toHaveText('2 pictures kept on this device');
          expect(await readable(settings, BLOCK_READABILITY), 'the Settings group’s words').toEqual([]);
          expect(await controlEdges(settings, EDGE[look]), 'the Settings group’s control edges').toEqual([]);
        });
      }
    });
  }

  for (const look of ['light', 'dark'] as const) {
    test.describe(`Collapsed Alert pictures, ${look}`, () => {
      test.use({ colorScheme: look });
      for (const width of [390, 1440]) {
        test(`the collapsed Alert pictures row shows readable words and its full summary, ${width} px, ${look}`, async ({ page, context }) => {
          await page.setViewportSize({ width, height: 900 });
          await seedDevice(context, { pictures: { noticeAnswered: true } });
          await seedKept(page, 3);
          await page.goto('/monitor/', { waitUntil: 'networkidle' });
          await page.getByRole('button', { name: 'Show settings', exact: true }).click();
          const head = page.getByRole('button', { name: /^Alert pictures/ });
          await expect(head).toHaveAttribute('aria-expanded', 'false');
          const title = head.getByText('Alert pictures', { exact: true });
          await expect(title).toBeVisible();
          expect.soft(await readable(title, { ...BLOCK_READABILITY, other: 15 }), 'the title’s size and contrast').toEqual([]);
          const summary = head.getByText('Kept on this device · 3 pictures kept on this device', { exact: true });
          await expect(summary).toBeVisible();
          expect.soft(await readable(summary, BLOCK_READABILITY), 'the summary’s size and contrast').toEqual([]);
          const fits = await summary.evaluate((element) => {
            const row = element.closest('button')!;
            const range = document.createRange();
            range.selectNodeContents(element);
            const text = range.getBoundingClientRect();
            const bounds = row.getBoundingClientRect();
            const container = element.parentElement!;
            return container.scrollWidth <= container.clientWidth + 1 && text.right <= bounds.right && text.bottom <= bounds.bottom;
          });
          expect(fits, 'the full summary fits in the collapsed row').toBe(true);
        });
      }
    });
  }

  describeInBothLooks('Picture count and deletion failure, 390 px', () => {
    test.use({ viewport: { width: 390, height: 844 } });

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
  });

  test('focus moved to another setting while Delete all pictures runs stays there when it is done', async ({ page, context }) => {
    test.setTimeout(60_000);
    await seedDevice(context, { pictures: { noticeAnswered: true } });
    await seedKept(page, 3);
    // The app hears that the pictures went 3 seconds after the browser wrote it.
    await faultPictureStore(page, { holdDeleteMs: 3_000 });
    await page.goto('/settings/detection/', { waitUntil: 'networkidle' });
    const found = group(page);
    await expect(countLine(found)).toHaveText('3 pictures kept on this device');
    await deleteAll(found).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete all pictures', exact: true }).click();
    // While the store works, the person moves on to the Keep alert pictures switch.
    await keepSwitch(found).focus();
    await expect(countLine(found)).toHaveText('No pictures kept on this device', { timeout: 15_000 });
    await page.waitForTimeout(500);
    expect(await keepSwitch(found).evaluate((el) => el === document.activeElement), 'focus stays on the switch').toBe(true);
  });

  test('focus that stood on Delete all pictures goes to the age’s select when the key leaves with the pictures', async ({ page, context }) => {
    test.setTimeout(60_000);
    await seedDevice(context, { pictures: { noticeAnswered: true } });
    await seedKept(page, 3);
    await page.goto('/settings/detection/', { waitUntil: 'networkidle' });
    const found = group(page);
    await expect(countLine(found)).toHaveText('3 pictures kept on this device');
    await deleteAll(found).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete all pictures', exact: true }).click();
    await expect(countLine(found)).toHaveText('No pictures kept on this device', { timeout: 15_000 });
    await expect(deleteAll(found)).toHaveCount(0);
    await expect.poll(() => afterSelect(found).evaluate((el) => el === document.activeElement)).toBe(true);
  });

  describeInBothLooks('Picture settings in another profile, 1280 px', () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test('another profile keeps its own choice and notice', async ({ page, context, browser, colorScheme }) => {
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

      const other = await browser.newContext({ colorScheme, viewport: { width: 1280, height: 900 } });
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
  });

  describeInBothLooks('Picture settings on wider screens', () => {
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
        expect(await scrollsSideways(page), await sidewaysParts(page)).toBe(false);
      });
    }
  });
});

// =============================================================================
// The box on the live picture
// =============================================================================

const liveBox = (page: Page) => page.locator('.watch-frame__picture .alert-live__box');
const livePlate = (page: Page) => page.locator('.watch-frame__picture .alert-live__plate');
const livePicture = (page: Page) => page.locator('.watch-frame__picture .alert-live');

/** The browser lists two cameras, and each one the page asks for is the walk's camera. */
async function twoCameras(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const camera = (n: number) => ({ deviceId: `walk-camera-${n}`, groupId: 'walk', kind: 'videoinput', label: `Walk camera ${n}`, toJSON() { return this; } });
    const devices = [camera(1), camera(2)];
    navigator.mediaDevices.enumerateDevices = async () => devices as unknown as MediaDeviceInfo[];
  });
}

/** A sound alone: a tone on the microphone over a 5 % line, with the motion check off. */
const SOUND_ONLY = {
  activePresetId: 'custom',
  globalSettings: { ...CUSTOM_PRESET, motionDetectionEnabled: false, audioDetectionEnabled: true, audioSensitivity: 95 },
};

/** A 640 by 480 camera whose middle band changes: six whole rows of the motion check's grid, across the picture. */
const MIDDLE_BAND: CanvasCamera = { width: 640, height: 480, background: 128, moving: { x: 0, y: 0.25, width: 1, height: 0.5 }, levels: [0, 85, 170, 255] };
/** A 1280 by 720 camera whose top third changes: four whole rows of the grid, across the picture. */
const TOP_BAND: CanvasCamera = { width: 1280, height: 720, background: 128, moving: { x: 0, y: 0, width: 1, height: 1 / 3 }, levels: [0, 85, 170, 255] };

/** True when `inner` stands inside `outer`, within a pixel. */
const inside = (inner: { x: number; y: number; width: number; height: number }, outer: { x: number; y: number; width: number; height: number }) =>
  inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.x + inner.width <= outer.x + outer.width + 1 && inner.y + inner.height <= outer.y + outer.height + 1;

for (const look of ['dark', 'light'] as const) {
  for (const width of [390, 1280]) {
    test.describe(`The live picture's box, ${width} px, ${look}`, () => {
      test.use({ colorScheme: look, viewport: { width, height: 900 } });

      test(`a Motion alert boxes the change on the live picture, ${width} px, ${look}`, async ({ page, context }) => {
        test.setTimeout(180_000);
        requireSampleClip();
        await watchWith(page, context, { settings: clipSettings({ motion: true, sound: false }) });
        const time = await timeOf(cards(page).first(), 'Motion');
        // Within a second of the alert: one box, and the plate with the alert's kind and time.
        await expect(livePlate(page)).toHaveText(`Motion here at ${time}`, { timeout: 1_000 });
        await expect(liveBox(page)).toHaveCount(1);
        expect(inside((await livePlate(page).boundingBox())!, (await livePicture(page).boundingBox())!), 'the plate stands inside the picture').toBe(true);
        const plate = await wordsOn(livePlate(page), livePlate(page).locator('p').first());
        expect(plate.size, 'the plate’s words are 16 px').toBe(16);
        expect(plate.solid, 'the plate carries its own ground').toBe(true);
        expect(plate.ratio).toBeGreaterThanOrEqual(12);
      });

      test(`the live box stays aligned on the full camera image, ${width} px, ${look}`, async ({ page, context }) => {
        test.setTimeout(120_000);
        await watchWith(page, context, { settings: MOTION_ONLY, camera: MIDDLE_BAND });
        await timeOf(cards(page).first(), 'Motion');
        await expect(liveBox(page)).toHaveCount(1);
        const view = (await livePicture(page).boundingBox())!;
        const drawn = (await liveBox(page).boundingBox())!;
        // The frame's numbers: rows 3 to 8 of the grid, 640 by 240 at (0, 120) of a 640 by 480 frame.
        await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBe(1);
        const [row] = keptRows(await readDatabase(page));
        expect([row.sourceWidth, row.sourceHeight, row.box]).toEqual([640, 480, { x: 0, y: 120, width: 640, height: 240 }]);
        const want = mapLiveBox(row.box, 640, 480, view.width, view.height, 'contain')!;
        expect(want, 'the box falls inside the full camera image').not.toBeNull();
        for (const key of ['x', 'y'] as const) {
          expect(Math.abs(drawn[key] - (view[key] + want[key])), `the box's ${key} (${drawn[key]} against ${view[key] + want[key]})`).toBeLessThanOrEqual(2);
        }
        for (const key of ['width', 'height'] as const) {
          expect(Math.abs(drawn[key] - want[key]), `the box's ${key} (${drawn[key]} against ${want[key]})`).toBeLessThanOrEqual(2);
        }
        expect(drawn.x - view.x, 'the box starts at the camera image inside the 16:9 frame').toBeGreaterThan(4);
      });
    });
  }
}

for (const reduced of [false, true]) {
  describeInBothLooks(`The live box's 10 seconds${reduced ? ' under reduced motion' : ''}`, () => {
    test.use({ viewport: { width: 390, height: 900 }, contextOptions: { reducedMotion: reduced ? 'reduce' : 'no-preference' } });

    test(`the box and its plate stand for 10 seconds from the alert and leave, with no slide and no fade${reduced ? ', under reduced motion' : ''}`, async ({ page, context }) => {
      test.setTimeout(120_000);
      await watchWith(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD });
      await timeOf(cards(page).first(), 'Motion');
      await expect(liveBox(page)).toHaveCount(1);
      const seen = Date.now();
      for (const part of [liveBox(page), livePlate(page)]) {
        const moves = await part.evaluate((el) => {
          const style = getComputedStyle(el);
          return { transition: style.transitionDuration, animation: style.animationName };
        });
        expect(moves.animation).toBe('none');
        // The page's own reduced-motion rule sets every transition to a hundredth of a millisecond.
        expect(moves.transition.split(',').every((time) => parseFloat(time) <= 0.001), `no transition (${moves.transition})`).toBe(true);
      }
      // Up at 7 seconds, gone by 11 from when it was seen (it came up to a second before that).
      await page.waitForTimeout(Math.max(0, 7_000 - (Date.now() - seen)));
      await expect(liveBox(page)).toHaveCount(1);
      await expect(livePlate(page)).toHaveCount(1);
      await expect(liveBox(page)).toHaveCount(0, { timeout: 4_500 });
      await expect(livePlate(page)).toHaveCount(0);
    });
  });
}

describeInBothLooks('The live box: one at a time, never for a sound, clear of the picture’s top', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('a second alert inside the 10 seconds replaces the box', async ({ page, context }) => {
    test.setTimeout(120_000);
    // The motion goes on: with the Cooldown Period and each level's cooldown at 4 seconds, the
    // event's next alert comes 4 seconds after its first.
    const quick = { info: 4, low: 4, medium: 4, high: 4, critical: 0 };
    await watchWith(page, context, { settings: { ...MOTION_ONLY, timingSettings: cooldownPeriod(4), severityCooldowns: quick }, camera: LEFT_THIRD });
    const card = cards(page).first();
    const first = await timeOf(card, 'Motion');
    await expect(livePlate(page)).toHaveText(`Motion here at ${first}`);
    const seen = Date.now();
    await expect(card.getByText('Repeated 1 time', { exact: true })).toBeVisible({ timeout: 8_000 });
    expect(Date.now() - seen, 'the second alert came inside the first box’s 10 seconds').toBeLessThan(9_000);
    const second = await timeOf(card, 'Motion');
    expect(second).not.toBe(first);
    await expect(livePlate(page)).toHaveText(`Motion here at ${second}`);
    await expect(liveBox(page)).toHaveCount(1);
    await expect(livePlate(page)).toHaveCount(1);
  });

  test('a box leaves the live picture when another camera is chosen', async ({ page, context }) => {
    test.setTimeout(120_000);
    await twoCameras(page);
    await watchWith(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD });
    await timeOf(cards(page).first(), 'Motion');
    await expect(liveBox(page)).toHaveCount(1);
    const seen = Date.now();
    await holdStill(page);
    await page.getByRole('combobox', { name: 'Camera', exact: true }).selectOption({ label: 'Walk camera 2' });
    await expect(page.getByRole('combobox', { name: 'Camera', exact: true })).toHaveValue('walk-camera-2');
    // The second camera shows, inside the first box's 10 seconds, with no box over it.
    await expect(live(page)).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(800);
    expect(Date.now() - seen, 'the first box’s 10 seconds have not run out').toBeLessThan(8_000);
    await expect(liveBox(page)).toHaveCount(0);
    await expect(livePlate(page)).toHaveCount(0);
  });

  for (const width of [390, 1280]) {
    test(`a Sound alert draws no box, ${width} px`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 900 });
      test.setTimeout(120_000);
      await watchWith(page, context, { settings: SOUND_ONLY, camera: { ...LEFT_THIRD, moving: { x: 0, y: 0, width: 0, height: 0 }, tone: true } });
      const card = cards(page).first();
      const time = await timeOf(card, 'Sound');
      await expect(card.getByRole('img', { name: pictureName(time, false), exact: true })).toBeVisible();
      await expect(liveBox(page)).toHaveCount(0);
      await expect(livePlate(page)).toHaveCount(0);
    });
  }

  for (const width of [390, 1280]) {
    test(`a box touching the picture’s top puts its plate under it; a press reaches the picture; neither is read, ${width} px`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 900 });
      test.setTimeout(120_000);
      await watchWith(page, context, { settings: MOTION_ONLY, camera: TOP_BAND });
      const time = await timeOf(cards(page).first(), 'Motion');
      await expect(livePlate(page)).toHaveText(`Motion here at ${time}`);
      await livePicture(page).scrollIntoViewIfNeeded();
      const view = (await livePicture(page).boundingBox())!;
      const box = (await liveBox(page).boundingBox())!;
      const plate = (await livePlate(page).boundingBox())!;
      expect(Math.abs(box.y - view.y), 'the box touches the picture’s top').toBeLessThanOrEqual(1);
      expect(plate.y, 'the plate stands under the box').toBeGreaterThanOrEqual(box.y + box.height);
      expect(Math.abs(plate.x - Math.max(box.x, view.x + 8)), 'at the box’s bottom left').toBeLessThanOrEqual(12);
      expect(inside(plate, view), 'the plate stands inside the picture').toBe(true);

      // A press on the box reaches the picture under it, and nothing opens.
      const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      expect(await page.evaluate(({ x, y }) => {
        const under = document.elementFromPoint(x, y);
        // The camera's own box, round the live box: the press lands in it, under the live box.
        const camera = document.querySelector('.alert-live')?.parentElement ?? null;
        return Boolean(under && camera && camera.contains(under) && !under.closest('.alert-live'));
      }, point), 'the press reaches the camera picture, not the box').toBe(true);
      await page.mouse.click(point.x, point.y);
      await expect(page.getByRole('dialog')).toHaveCount(0);

      // Neither is read: the alert is read once from the list's status.
      await expect(livePicture(page)).toHaveAttribute('aria-hidden', 'true');
      await expect(page.getByRole('status').filter({ hasText: new RegExp(`^New alert: Motion, (Low|Medium|High|Critical), at ${timePattern(time)}\\.`) })).toHaveCount(1);
    });
  }

  for (const width of [390, 1280]) {
    test(`a change along the top of a 4:3 camera shows on the full live image and its saved picture, ${width} px`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 900 });
      test.setTimeout(120_000);
      // One zone over the top tenth of a 640 by 480 frame.
      await watchWith(page, context, {
        settings: { ...MOTION_ONLY, detectionZones: [{ id: 'top', name: 'Top', enabled: true, x: 0, y: 0, width: 100, height: 10 }] },
        camera: { width: 640, height: 480, background: 128, moving: { x: 0, y: 0, width: 1, height: 0.1 }, levels: [0, 85, 170, 255] },
      });
      const card = cards(page).first();
      const time = await timeOf(card, 'Motion');
      await expect(card.getByRole('img', { name: pictureName(time, true), exact: true })).toBeVisible();
      await expect(card.locator('.alert-picture__box')).toHaveCount(1);
      await expect(card.getByText('in Top', { exact: true })).toBeVisible();
      await expect(liveBox(page)).toBeVisible();
      await expect(livePlate(page)).toBeVisible();
      const view = (await livePicture(page).boundingBox())!;
      const drawn = (await liveBox(page).boundingBox())!;
      const imageWidth = view.height * 4 / 3;
      expect(imageWidth).toBeLessThan(view.width);
      expect(Math.abs(drawn.y - view.y)).toBeLessThanOrEqual(2);
      expect(Math.abs(drawn.x - (view.x + (view.width - imageWidth) / 2))).toBeLessThanOrEqual(2);
    });
  }

  test('another profile’s live picture carries no box', async ({ page, context, browser, colorScheme }) => {
    test.setTimeout(120_000);
    await watchWith(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD });
    await timeOf(cards(page).first(), 'Motion');
    await expect(liveBox(page)).toHaveCount(1);
    const other = await browser.newContext({ colorScheme, viewport: { width: 1280, height: 900 } });
    await seedDevice(other, { settings: MOTION_ONLY, pictures: { noticeAnswered: true } });
    const stranger = await other.newPage();
    await canvasCamera(stranger, { ...LEFT_THIRD, moving: { x: 0, y: 0, width: 0, height: 0 } });
    await stranger.goto('/monitor/', { waitUntil: 'networkidle' });
    await startWatching(stranger);
    await expect(liveBox(stranger)).toHaveCount(0);
    await expect(cards(stranger)).toHaveCount(0);
    await other.close();
  });
});

for (const look of ['dark', 'light'] as const) {
  test.describe(`The live box on a narrow picture, ${look}`, () => {
    test.use({ colorScheme: look, viewport: { width: 320, height: 800 } });

    test(`a one-cell change on a 1280 by 720 camera at 320 px draws a box 24 px a side or more, ${look}`, async ({ page, context }) => {
      test.setTimeout(120_000);
      // One zone round one cell of the grid (80 by 60 px at 640, 360), which is 18 by 13.5 px on a 288 px picture.
      await watchWith(page, context, {
        settings: { ...MOTION_ONLY, detectionZones: [{ id: 'cell', name: 'Cell', enabled: true, x: 50, y: 50, width: 6.25, height: 100 / 12 }] },
        camera: { width: 1280, height: 720, background: 128, moving: { x: 0.5, y: 0.5, width: 0.0625, height: 1 / 12 }, levels: [0, 85, 170, 255] },
      });
      await timeOf(cards(page).first(), 'Motion');
      await expect(liveBox(page)).toHaveCount(1);
      const box = (await liveBox(page).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(24);
      expect(box.height).toBeGreaterThanOrEqual(24);
      expect(inside(box, (await livePicture(page).boundingBox())!)).toBe(true);
    });

    test(`the plate at 320 px and at 200 per cent text wraps inside the picture, ${look}`, async ({ page, context }) => {
      test.setTimeout(120_000);
      await watchWith(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD });
      await timeOf(cards(page).first(), 'Motion');
      await expect(livePlate(page)).toHaveCount(1);
      const view = (await livePicture(page).boundingBox())!;
      const plate = (await livePlate(page).boundingBox())!;
      expect(inside(plate, view), 'the plate stands inside the picture').toBe(true);
      expect(plate.width).toBeLessThanOrEqual(view.width - 16 + 1);
      expect(plate.height, 'one line covers no more than a third of the picture').toBeLessThanOrEqual(view.height / 3);
      await doubleText(page);
      // The line wraps inside the plate, the plate grows down, and nothing is cut.
      await expect.poll(async () => (await livePlate(page).locator('p').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize)))).toBe(32);
      const grown = await livePlate(page).boundingBox();
      if (grown) {
        expect(grown.width).toBeLessThanOrEqual(view.width - 16 + 1);
        expect(grown.x).toBeGreaterThanOrEqual(view.x - 1);
        expect(await livePlate(page).locator('p').first().evaluate((el) => el.scrollWidth <= el.clientWidth + 1), 'the line is not cut').toBe(true);
      }
    });
  });
}

describeInBothLooks('The live box offline and on wider pictures', () => {
  test('the live box offline', async ({ page, context }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 900 });
    await seedDevice(context, { settings: MOTION_ONLY, pictures: { noticeAnswered: true } });
    await canvasCamera(page, LEFT_THIRD);
    await page.goto('/monitor/', { waitUntil: 'networkidle' });
    await context.setOffline(true);
    await startWatching(page);
    const time = await timeOf(cards(page).first(), 'Motion');
    await expect(livePlate(page)).toHaveText(`Motion here at ${time}`);
    await expect(liveBox(page)).toHaveCount(1);
    await context.setOffline(false);
  });

  for (const width of [768, 1440]) {
    test(`the plate at ${width} px stands on one line inside the picture`, async ({ page, context }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 900 });
      await watchWith(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD });
      const time = await timeOf(cards(page).first(), 'Motion');
      await expect(livePlate(page)).toHaveText(`Motion here at ${time}`);
      const view = (await livePicture(page).boundingBox())!;
      const plate = (await livePlate(page).boundingBox())!;
      expect(inside(plate, view)).toBe(true);
      expect(plate.width).toBeLessThanOrEqual(420);
      // The plate's words stay 16 px while the page's lead lines grow on the wide page.
      expect(await livePlate(page).locator('p').first().evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');
      expect(plate.height, 'one line').toBeLessThanOrEqual(32);
      // 12 px clear of the picture's edges.
      expect(plate.x - view.x).toBeGreaterThanOrEqual(11);
    });
  }
});

// =============================================================================
// The picture, opened
// =============================================================================

const LOADING_LINE = 'Loading the picture…';
const READ_FAILED_LINE = 'This picture could not be read on this device. Delete it to clear it; the alert’s words stay.';
const DELETE_QUESTION = 'Delete this picture? The alert’s words stay.';
const PICTURE_DELETE_FAILED_LINE = 'The picture could not be deleted. Press Delete picture to try again.';
const DELETED_LINE = 'You deleted its picture.';
const SOUND_CAME_LINE = 'What the camera saw when the sound came.';
const TOO_DARK_LINE = 'This picture is too dark to show much. With a night light in the room, the camera shows more.';

const openKey = (root: Page | Locator) => root.getByRole('button', { name: /^Open picture: / });
/** The opened picture, whatever its alert: a dialog named by the kind and the time. */
const opened = (page: Page) => page.getByRole('dialog', { name: /^(Motion|Sound|Picture change)(,| at) / });
const closeKey = (dialog: Locator) => dialog.getByRole('button', { name: 'Close', exact: true });
const boxSwitch = (dialog: Locator) => dialog.getByRole('switch', { name: 'Show the box', exact: true });
const brightenSwitch = (dialog: Locator) => dialog.getByRole('switch', { name: 'Brighten the picture', exact: true });
const saveKey = (dialog: Locator) => dialog.getByRole('button', { name: 'Save picture', exact: true });
const deleteKey = (dialog: Locator) => dialog.getByRole('button', { name: 'Delete picture', exact: true });
const question = (page: Page) => page.getByRole('alertdialog', { name: DELETE_QUESTION, exact: true });
const confirmDelete = (page: Page) => question(page).getByRole('button', { name: 'Delete picture', exact: true });
const keepIt = (page: Page) => question(page).getByRole('button', { name: 'Keep it', exact: true });

/** The camera holds still: the event ends, and no repeat changes the card under the walk. */
const holdStill = (page: Page) => page.evaluate(() => { window.__camera!.moving.width = 0; });

/** A kept picture's frame as the store holds it, in base64, read on the walk's own connection. */
function keptFrame(page: Page, id: string): Promise<string> {
  return page.evaluate((pictureId) => new Promise<string>((resolve, reject) => {
    const open = indexedDB.open('safeos-guardian');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const read = db.transaction('alert_picture', 'readonly').objectStore('alert_picture').getAll();
      read.onerror = () => { db.close(); reject(read.error); };
      read.onsuccess = () => {
        db.close();
        const row = read.result.find((picture) => picture.id === pictureId);
        if (!row?.frame) { reject(new Error('the store holds no frame for that picture')); return; }
        void (row.frame as Blob).arrayBuffer().then((buffer) => {
          let text = '';
          for (const byte of new Uint8Array(buffer)) text += String.fromCharCode(byte);
          resolve(btoa(text));
        }, reject);
      };
    };
  }), id);
}

/** A 640 by 480 kept picture with its box and a 320 by 240 close-up. */
const LARGE_PICTURE = {
  frameWidth: 640, frameHeight: 480, sourceWidth: 640, sourceHeight: 480,
  box: { x: 160, y: 120, width: 160, height: 120 }, closeUpWidth: 320, closeUpHeight: 240,
};

/** A device with one saved Motion alert and its kept picture, a minute old. */
async function seedOne(page: Page, extra: Record<string, unknown> = {}, at = Date.now() - 60_000): Promise<{ alertId: string; pictureId: string; at: number }> {
  const alertId = `motion-${at}-opened1`;
  const pictureId = `picture-${at}-opened1`;
  await seedPictureRows(page, [{
    alert: savedAlert(alertId, at, { kind: 'motion', pictureId }),
    picture: keptPicture(pictureId, at, { ...LARGE_PICTURE, ...extra }),
  }]);
  return { alertId, pictureId, at };
}

/** Opens the watch and the saved alert's picture. */
async function openSaved(page: Page): Promise<{ card: Locator; dialog: Locator; time: string }> {
  await page.goto('/monitor/', { waitUntil: 'networkidle' });
  const card = cards(page).first();
  const time = await timeOf(card, 'Motion');
  await openKey(card).click();
  const dialog = opened(page);
  await expect(dialog).toBeVisible();
  return { card, dialog, time };
}

/** The words under `root` that reach past its edges or are cut. */
const cutWords = (root: Locator) => root.evaluate((el) => {
  const edge = el.getBoundingClientRect();
  return Array.from(el.querySelectorAll('p, span, label, button, a, h2, h3')).filter((child) => {
    // A key in a row that scrolls inside itself is reached by scrolling the row.
    if (child.closest('.alert-pictures-keys[data-overflows] .alert-pictures-keys__row')) return false;
    const box = child.getBoundingClientRect();
    if (box.width <= 1) return false;
    return box.right > edge.right + 1 || box.left < edge.left - 1 || child.scrollWidth > child.clientWidth + 1;
  }).map((child) => (child.textContent || '').slice(0, 40));
});

for (const look of ['dark', 'light'] as const) {
  test.describe(`The opened picture, 390 px, ${look}`, () => {
    test.use({ colorScheme: look, viewport: { width: 390, height: 844 } });

    test(`Open picture opens the picture with its box, its close-up and its keys, ${look}`, async ({ page, context }) => {
      test.setTimeout(150_000);
      await watchWith(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD });
      const card = cards(page).first();
      const time = await timeOf(card, 'Motion');
      await holdStill(page);
      const onCard = card.getByRole('img', { name: pictureName(time, true), exact: true });
      await expect(onCard).toBeVisible();

      // The card's last row: Open picture, then Acknowledge.
      const key = card.getByRole('button', { name: `Open picture: Motion, ${time}`, exact: true });
      await expect(key).toHaveText('Open picture');
      const acknowledge = card.getByRole('button', { name: 'Acknowledge', exact: true });
      const [open, ack] = [(await key.boundingBox())!, (await acknowledge.boundingBox())!];
      expect(open.height).toBeGreaterThanOrEqual(44);
      expect(open.width).toBeGreaterThanOrEqual(120);
      expect(await onOneRow(key, acknowledge), 'Open picture and Acknowledge share the card’s last row').toBe(true);
      expect(open.x + open.width, 'Open picture stands before Acknowledge').toBeLessThanOrEqual(ack.x);

      await key.click();
      const dialog = page.getByRole('dialog', { name: `Motion at ${time}`, exact: true });
      await expect(dialog).toBeVisible();
      await expect(closeKey(dialog)).toBeFocused();
      const picture = dialog.getByRole('img', { name: pictureName(time, true), exact: true });
      await expect(picture).toBeVisible();
      await expect(dialog.locator('.alert-picture__box')).toHaveCount(1);
      const closeUp = dialog.getByRole('img', { name: closeUpName(time), exact: true });
      await expect(closeUp).toBeVisible();
      const label = dialog.getByText('Close-up', { exact: true });
      expect((await label.boundingBox())!.y, '“Close-up” stands over the close-up').toBeLessThan((await closeUp.boundingBox())!.y);
      await expect(boxSwitch(dialog)).toHaveAttribute('aria-checked', 'true');
      // A picture that is not dark has no switch to brighten it.
      await expect(brightenSwitch(dialog)).toHaveCount(0);

      // The panel is the screen; the picture and Save picture span its column, and Delete picture
      // stands on its own row 24 px under Save picture.
      const panel = (await dialog.boundingBox())!;
      expect([Math.round(panel.x), Math.round(panel.width)]).toEqual([0, 390]);
      const [shown, save, remove] = [(await picture.boundingBox())!, (await saveKey(dialog).boundingBox())!, (await deleteKey(dialog).boundingBox())!];
      expect(Math.round(shown.width)).toBe(358);
      expect(Math.round(save.width)).toBe(358);
      expect(Math.round(remove.width)).toBe(358);
      expect(Math.round(remove.y - (save.y + save.height)), 'Delete picture stands 24 px under Save picture').toBe(24);
      for (const control of [closeKey(dialog), boxSwitch(dialog), saveKey(dialog), deleteKey(dialog)]) {
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      // Delete picture is an outlined key at full strength, as Save picture is.
      expect(await deleteKey(dialog).evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
      // The watch runs under the panel.
      await expect(live(page)).toHaveCount(1);

      // Close gives focus back to the key that opened it; a press on the picture opens the same dialog.
      await closeKey(dialog).click();
      await expect(dialog).toHaveCount(0);
      await expect(key).toBeFocused();
      await onCard.click();
      await expect(dialog).toBeVisible();
      await expect(closeKey(dialog)).toBeFocused();
    });

    test(`the dialog’s words meet the sizes and contrast, 390 px, ${look}`, async ({ page, context }) => {
      await seedDevice(context, { pictures: { noticeAnswered: true } });
      await seedOne(page);
      const { dialog } = await openSaved(page);
      await expect(dialog.getByRole('img')).toHaveCount(2);
      expect(await readable(dialog, BLOCK_READABILITY), 'the dialog’s words').toEqual([]);
      await deleteKey(dialog).click();
      expect(await readable(question(page), BLOCK_READABILITY), 'the question’s words').toEqual([]);
    });
  });

  test.describe(`The opened picture, 1280 px, ${look}`, () => {
    test.use({ colorScheme: look, viewport: { width: 1280, height: 900 } });

    test(`the dialog’s words meet the sizes and contrast, 1280 px, ${look}`, async ({ page, context }) => {
      await seedDevice(context, { pictures: { noticeAnswered: true } });
      await seedOne(page);
      const { dialog } = await openSaved(page);
      await expect(dialog.getByRole('img')).toHaveCount(2);
      expect(await readable(dialog, BLOCK_READABILITY), 'the dialog’s words').toEqual([]);
      await deleteKey(dialog).click();
      expect(await readable(question(page), BLOCK_READABILITY), 'the question’s words').toEqual([]);
    });
  });
}

describeInBothLooks('The opened picture on the watch, 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a new alert leaves the opened picture open; Show the box hides and shows the box at once; Delete picture asks first, then deletes the frame, the box and the close-up', async ({ page, context }) => {
    test.setTimeout(180_000);
    await watchWith(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD });
    const time = await timeOf(cards(page).first(), 'Motion');
    await holdStill(page);
    await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBe(1);
    const [row] = keptRows(await readDatabase(page));
    await openKey(cards(page).first()).click();
    const dialog = page.getByRole('dialog', { name: `Motion at ${time}`, exact: true });
    await expect(dialog).toBeVisible();

    // Show the box: off shows the clean picture under its plain name; on brings the box back; nothing fades.
    const box = dialog.locator('.alert-picture__box');
    await expect(box).toHaveCount(1);
    expect(await box.evaluate((el) => getComputedStyle(el).transitionDuration.split(',').every((t) => parseFloat(t) <= 0.001)), 'the box has no transition').toBe(true);
    await boxSwitch(dialog).click();
    await expect(boxSwitch(dialog)).toHaveAttribute('aria-checked', 'false');
    await expect(box).toHaveCount(0);
    await expect(dialog.getByRole('img', { name: pictureName(time, false), exact: true })).toBeVisible();
    await expect(dialog.getByRole('img', { name: pictureName(time, true), exact: true })).toHaveCount(0);
    await boxSwitch(dialog).click();
    await expect(boxSwitch(dialog)).toHaveAttribute('aria-checked', 'true');
    await expect(box).toHaveCount(1);
    await expect(dialog.getByRole('img', { name: pictureName(time, true), exact: true })).toBeVisible();

    // A new alert comes while the picture is open: its card joins the list and the dialog stays as it was.
    await page.waitForTimeout(3_000);
    await page.evaluate(() => { window.__camera!.moving.width = 1 / 3; });
    await expect(cards(page)).toHaveCount(2, { timeout: 40_000 });
    await holdStill(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('img', { name: pictureName(time, true), exact: true })).toBeVisible();
    await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBe(2);

    // Delete picture asks first, with focus on Keep it; Keep it gives focus back to Delete picture.
    await deleteKey(dialog).click();
    await expect(question(page)).toBeVisible();
    await expect(keepIt(page)).toBeFocused();
    await keepIt(page).click();
    await expect(question(page)).toHaveCount(0);
    await expect(deleteKey(dialog)).toBeFocused();
    expect(await keptCount(page)).toBe(2);

    await deleteKey(dialog).click();
    await confirmDelete(page).click();
    await expect(dialog).toHaveCount(0);
    const card = cards(page).filter({ hasText: `Motion at ${time}` });
    await expect(card.getByText(DELETED_LINE, { exact: true })).toBeVisible();
    await expect(openKey(card)).toHaveCount(0);
    await expect(card.getByRole('img')).toHaveCount(0);
    // Focus stands on the card whose picture went.
    expect(await card.evaluate((el) => el.contains(document.activeElement)), 'focus stands on the alert’s card').toBe(true);
    const gone = (await readDatabase(page)).pictures.find((picture) => picture.id === row.id)!;
    expect(gone).toMatchObject({ id: row.id, state: 'gone', gone: 'person' });
    expect(Object.keys(gone).filter((name) => ['frame', 'closeUp', 'box'].includes(name)), 'no frame, box or close-up is left').toEqual([]);
    expect(await keptCount(page)).toBe(1);
  });

  test('a Sound alert’s picture opens with no Show the box', async ({ page, context }) => {
    test.setTimeout(120_000);
    await watchWith(page, context, { settings: SOUND_ONLY, camera: { ...LEFT_THIRD, moving: { x: 0, y: 0, width: 0, height: 0 }, tone: true } });
    const card = cards(page).first();
    const time = await timeOf(card, 'Sound');
    await card.getByRole('button', { name: `Open picture: Sound, ${time}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Sound at ${time}`, exact: true });
    await expect(dialog.getByRole('img', { name: pictureName(time, false), exact: true })).toBeVisible();
    await expect(dialog.getByText(SOUND_CAME_LINE, { exact: true })).toBeVisible();
    await expect(boxSwitch(dialog)).toHaveCount(0);
    await expect(dialog.locator('.alert-picture__box')).toHaveCount(0);
    await expect(dialog.getByText('Close-up', { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('img')).toHaveCount(1);
    await expect(saveKey(dialog)).toBeVisible();
    await expect(deleteKey(dialog)).toBeVisible();
  });

  test('a picture not kept opens from memory, saves and deletes', async ({ page, context }) => {
    test.setTimeout(120_000);
    await watchWith(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD, pictures: { noticeAnswered: true, keep: false } });
    const card = cards(page).first();
    const time = await timeOf(card, 'Motion');
    await holdStill(page);
    await openKey(card).click();
    const dialog = page.getByRole('dialog', { name: `Motion at ${time}`, exact: true });
    const picture = dialog.getByRole('img', { name: pictureName(time, true), exact: true });
    await expect(picture).toBeVisible();
    // Its line stands under the title, over the picture.
    const line = dialog.getByText(NOT_KEPT_LINE, { exact: true });
    await expect(line).toBeVisible();
    expect((await line.boundingBox())!.y).toBeLessThan((await picture.boundingBox())!.y);
    const [saved] = await Promise.all([page.waitForEvent('download'), saveKey(dialog).click()]);
    expect(saved.suggestedFilename()).toMatch(/^safeos-motion-\d{4}-\d{2}-\d{2}-\d{6}\.jpg$/);
    const bytes = await readFile((await saved.path())!);
    expect([bytes[0], bytes[1]], 'a JPEG file').toEqual([0xff, 0xd8]);
    expect((await readDatabase(page)).pictures).toEqual([]);

    await deleteKey(dialog).click();
    await confirmDelete(page).click();
    await expect(dialog).toHaveCount(0);
    await expect(card.getByText(DELETED_LINE, { exact: true })).toBeVisible();
    await expect(openKey(card)).toHaveCount(0);
    expect((await readDatabase(page)).pictures).toEqual([]);
  });

  test('a dark picture offers Brighten the picture, for the view alone', async ({ page, context }) => {
    test.setTimeout(150_000);
    await watchWith(page, context, { settings: MOTION_ONLY, camera: { ...LEFT_THIRD, background: 10, levels: [0, 40, 80] } });
    const card = cards(page).first();
    const time = await timeOf(card, 'Motion');
    await holdStill(page);
    await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBe(1);
    const [row] = keptRows(await readDatabase(page));
    await openKey(card).click();
    const dialog = page.getByRole('dialog', { name: `Motion at ${time}`, exact: true });
    const picture = dialog.getByRole('img', { name: pictureName(time, true), exact: true });
    const closeUp = dialog.getByRole('img', { name: closeUpName(time), exact: true });
    await expect(picture).toBeVisible();
    await expect(dialog.getByText(TOO_DARK_LINE, { exact: true })).toBeVisible();
    await expect(brightenSwitch(dialog)).toHaveAttribute('aria-checked', 'false');
    const plate = dialog.getByText('Brightened view', { exact: true });
    await expect(plate).toHaveCount(0);

    // The still part of the picture, right of the moving third: a flat grey of 10.
    const keptSrc = (await picture.getAttribute('src'))!;
    const keptCloseUp = (await closeUp.getAttribute('src'))!;
    const size = await naturalSize(picture);
    const still: Array<[number, number]> = [[size.width * 0.7, size.height / 2], [size.width * 0.9, size.height / 4]];
    const before = await pixelsAt(page, keptSrc, still);
    // The view stretches the levels so the picture's brightest part reaches full white.
    const most = await brightestIn(page, keptSrc);

    await brightenSwitch(dialog).click();
    await expect(brightenSwitch(dialog)).toHaveAttribute('aria-checked', 'true');
    await expect(plate).toBeVisible();
    await expect.poll(() => picture.getAttribute('src')).not.toBe(keptSrc);
    await expect.poll(() => closeUp.getAttribute('src')).not.toBe(keptCloseUp);
    const after = await pixelsAt(page, (await picture.getAttribute('src'))!, still);
    after.forEach(([grey], i) => {
      const stretched = Math.min(255, Math.round((before[i][0] * 255) / most));
      expect(grey, `the still part shows brighter (${before[i][0]} to ${grey}, brightest ${most})`).toBeGreaterThan(before[i][0]);
      expect(Math.abs(grey - stretched), `the still part is stretched by 255 / ${most} (${before[i][0]} to ${grey}, expected ${stretched})`)
        .toBeLessThanOrEqual(3);
    });
    // The label stands at the picture's top left, on its own plate.
    const [where, shown] = [(await plate.boundingBox())!, (await picture.boundingBox())!];
    expect(where.x - shown.x).toBeLessThanOrEqual(16);
    expect(where.y - shown.y).toBeLessThanOrEqual(16);
    expect(inside(where, shown), 'the label stands inside the picture').toBe(true);

    // Save picture saves the kept picture, never the brightened one.
    await boxSwitch(dialog).click();
    const [saved] = await Promise.all([page.waitForEvent('download'), saveKey(dialog).click()]);
    expect((await readFile((await saved.path())!)).toString('base64')).toBe(await keptFrame(page, row.id));

    // Show the box is off since the save, so the picture's name has no box sentence.
    await brightenSwitch(dialog).click();
    await expect(plate).toHaveCount(0);
    const clean = dialog.getByRole('img', { name: pictureName(time, false), exact: true });
    await expect.poll(() => clean.getAttribute('src')).toBe(keptSrc);
  });
});

describeInBothLooks('The opened picture on the watch, 1280 px', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('Save picture saves the picture as it shows; Escape and a press outside close it and focus returns to Open picture', async ({ page, context }) => {
    test.setTimeout(150_000);
    await watchWith(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD });
    const card = cards(page).first();
    const time = await timeOf(card, 'Motion');
    await holdStill(page);
    await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBe(1);
    const [row] = keptRows(await readDatabase(page));
    const key = openKey(card);
    await key.click();
    const dialog = page.getByRole('dialog', { name: `Motion at ${time}`, exact: true });
    await expect(saveKey(dialog)).toBeVisible();

    // With the box on: a JPEG named for the kind and the time, with the box drawn in.
    const [boxed] = await Promise.all([page.waitForEvent('download'), saveKey(dialog).click()]);
    expect(boxed.suggestedFilename()).toMatch(/^safeos-motion-\d{4}-\d{2}-\d{2}-\d{6}\.jpg$/);
    const boxedBytes = await readFile((await boxed.path())!);
    expect([boxedBytes[0], boxedBytes[1]], 'a JPEG file').toEqual([0xff, 0xd8]);
    // The box's right edge stands inside the picture: its green line is the two pixels inside it.
    const edge = Math.round(row.box.x + row.box.width);
    const middle = Math.round(row.box.y + row.box.height / 2);
    expect(edge, 'the box’s right edge stands inside the frame').toBeLessThan(row.frameWidth - 2);
    const across = await pixelsAt(page, `data:image/jpeg;base64,${boxedBytes.toString('base64')}`, [[edge - 2, middle], [edge - 1, middle]]);
    expect(across.some((rgb) => near(rgb, '#4ade80', 60)), `the box’s green line is drawn in (${JSON.stringify(across)})`).toBe(true);

    // With the box off: the kept frame itself, byte for byte, under the same name.
    await boxSwitch(dialog).click();
    const [clean] = await Promise.all([page.waitForEvent('download'), saveKey(dialog).click()]);
    expect(clean.suggestedFilename()).toBe(boxed.suggestedFilename());
    const kept = await keptFrame(page, row.id);
    expect((await readFile((await clean.path())!)).toString('base64')).toBe(kept);
    expect(boxedBytes.toString('base64')).not.toBe(kept);

    // Escape closes it and focus returns to the key that opened it; so does a press outside the panel.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(key).toBeFocused();
    await key.click();
    await expect(dialog).toBeVisible();
    const panel = (await dialog.boundingBox())!;
    expect(Math.round(panel.width), 'a 960 px panel at 1280 px').toBe(960);
    await page.mouse.click(Math.max(4, panel.x / 2), panel.y + panel.height / 2);
    await expect(dialog).toHaveCount(0);
    await expect(key).toBeFocused();
  });

  test('the dialog in keyboard order', async ({ page, context }) => {
    await seedDevice(context, { pictures: { noticeAnswered: true } });
    await seedOne(page);
    const { dialog } = await openSaved(page);
    await expect(closeKey(dialog)).toBeFocused();
    for (const stop of [boxSwitch(dialog), saveKey(dialog), deleteKey(dialog), closeKey(dialog)]) {
      await page.keyboard.press('Tab');
      await expect(stop).toBeFocused();
      expect(await stop.evaluate((el) => getComputedStyle(el).outlineStyle), 'each stop shows its ring').not.toBe('none');
    }
    await page.keyboard.press('Shift+Tab');
    await expect(deleteKey(dialog)).toBeFocused();
    // The delete question holds focus on its two keys, and Escape is Keep it.
    await page.keyboard.press('Enter');
    await expect(keepIt(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(confirmDelete(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(keepIt(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(question(page)).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(deleteKey(dialog)).toBeFocused();
    expect(await keptCount(page)).toBe(1);
  });

  test('another profile can open no picture of this one', async ({ page, context, browser, colorScheme }) => {
    await seedDevice(context, { pictures: { noticeAnswered: true } });
    await seedOne(page);
    const { dialog } = await openSaved(page);
    await expect(dialog.getByRole('img')).toHaveCount(2);
    const other = await browser.newContext({ colorScheme, viewport: { width: 1280, height: 900 } });
    await seedDevice(other, { pictures: { noticeAnswered: true } });
    const stranger = await other.newPage();
    await stranger.goto('/monitor/', { waitUntil: 'networkidle' });
    await expect(startKey(stranger)).toBeVisible();
    await expect(cards(stranger)).toHaveCount(0);
    await expect(openKey(stranger)).toHaveCount(0);
    expect((await readDatabase(stranger)).pictures).toEqual([]);
    await other.close();
  });
});

describeInBothLooks('The opened picture of a saved alert, 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a held read shows a tile and inactive keys, then the picture', async ({ page, context }) => {
    test.setTimeout(90_000);
    await seedDevice(context, { pictures: { noticeAnswered: true } });
    await seedOne(page);
    await faultPictureStore(page, { holdReadMs: 6_000 });
    await page.goto('/monitor/', { waitUntil: 'domcontentloaded' });
    await openKey(cards(page).first()).click();
    const dialog = opened(page);
    await expect(dialog).toBeVisible();
    const tile = dialog.locator('.alert-picture-dialog__wait');
    await expect(tile).toBeVisible();
    await expect(tile).toHaveAttribute('aria-hidden', 'true');
    await expect(dialog.getByText(LOADING_LINE, { exact: true })).toBeVisible();
    await expect(dialog.getByRole('img')).toHaveCount(0);
    await expect(closeKey(dialog)).toBeFocused();
    for (const control of [boxSwitch(dialog), saveKey(dialog), deleteKey(dialog)]) {
      await expect(control).toHaveAttribute('aria-disabled', 'true');
    }
    for (const control of [saveKey(dialog), deleteKey(dialog)]) {
      expect(await control.evaluate((el) => getComputedStyle(el).borderTopStyle), 'an inactive key has a dashed edge').toBe('dashed');
    }
    // An inactive Delete picture asks nothing.
    await deleteKey(dialog).click({ force: true });
    await expect(question(page)).toHaveCount(0);

    await expect(dialog.getByRole('img')).toHaveCount(2, { timeout: 20_000 });
    await expect(tile).toHaveCount(0);
    await expect(dialog.getByText(LOADING_LINE, { exact: true })).toHaveCount(0);
    for (const control of [boxSwitch(dialog), saveKey(dialog), deleteKey(dialog)]) {
      await expect(control).not.toHaveAttribute('aria-disabled', 'true');
    }
    expect(await saveKey(dialog).evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('solid');
  });

  test('a picture that cannot be read offers Delete picture, which clears it', async ({ page, context }) => {
    await seedDevice(context, { pictures: { noticeAnswered: true } });
    const { pictureId } = await seedOne(page);
    await faultPictureStore(page, { reads: 'error' });
    await page.goto('/monitor/', { waitUntil: 'networkidle' });
    const card = cards(page).first();
    await expect(card.getByText('This picture could not be read on this device.', { exact: true })).toBeVisible();
    await openKey(card).click();
    const dialog = opened(page);
    await expect(dialog.getByText(READ_FAILED_LINE, { exact: true })).toBeVisible();
    await expect(dialog.locator('.alert-picture__problem')).toHaveCount(1);
    await expect(dialog.getByRole('img')).toHaveCount(0);
    await expect(saveKey(dialog)).toHaveCount(0);
    await expect(boxSwitch(dialog)).toHaveCount(0);
    await expect(closeKey(dialog)).toBeVisible();

    await deleteKey(dialog).click();
    await confirmDelete(page).click();
    await expect(dialog).toHaveCount(0);
    await expect(card.getByText(DELETED_LINE, { exact: true })).toBeVisible();
    await expect(openKey(card)).toHaveCount(0);
    expect((await readDatabase(page)).pictures.find((row) => row.id === pictureId)).toMatchObject({ state: 'gone', gone: 'person' });
    expect(await keptCount(page)).toBe(0);
  });

  test('a failed delete says so and the dialog stays; with the store restored the same key deletes it', async ({ page, context }) => {
    await seedDevice(context, { pictures: { noticeAnswered: true } });
    await seedOne(page);
    await faultPictureStore(page, { deletes: 'error' });
    const { card, dialog } = await openSaved(page);
    await expect(dialog.getByRole('img')).toHaveCount(2);
    await deleteKey(dialog).click();
    await confirmDelete(page).click();
    const failed = dialog.getByText(PICTURE_DELETE_FAILED_LINE, { exact: true });
    await expect(failed).toBeVisible();
    await expect(dialog.locator('.alert-picture__problem')).toHaveCount(1);
    await expect(dialog.getByRole('img')).toHaveCount(2);
    await expect(deleteKey(dialog)).toBeFocused();
    // The line stands over the keys it names.
    expect((await failed.boundingBox())!.y).toBeLessThan((await saveKey(dialog).boundingBox())!.y);
    expect(await keptCount(page)).toBe(1);

    await setFault(page, {});
    await deleteKey(dialog).click();
    await confirmDelete(page).click();
    await expect(dialog).toHaveCount(0);
    await expect(card.getByText(DELETED_LINE, { exact: true })).toBeVisible();
    expect(await keptCount(page)).toBe(0);
  });

  test('a picture deleted in another tab leaves the open dialog and its card at once, and cannot be opened', async ({ page, context }) => {
    test.setTimeout(90_000);
    await seedDevice(context, { pictures: { noticeAnswered: true } });
    await seedOne(page);
    const { card, dialog } = await openSaved(page);
    await expect(dialog.getByRole('img')).toHaveCount(2);

    const second = await context.newPage();
    await second.goto('/monitor/', { waitUntil: 'networkidle' });
    await openKey(cards(second).first()).click();
    await deleteKey(opened(second)).click();
    await confirmDelete(second).click();
    await expect(opened(second)).toHaveCount(0);
    await second.close();

    // The first tab's dialog says that it went: the line beside the empty frame's glyph, with Close alone.
    await expect(dialog.getByText(DELETED_LINE, { exact: true })).toBeVisible();
    await expect(dialog.locator('.alert-picture__empty')).toHaveCount(1);
    await expect(dialog.getByRole('img')).toHaveCount(0);
    for (const left of [saveKey(dialog), deleteKey(dialog), boxSwitch(dialog)]) await expect(left).toHaveCount(0);
    await expect(closeKey(dialog)).toBeFocused();
    await closeKey(dialog).click();
    await expect(dialog).toHaveCount(0);
    // Its card says so too, and offers no Open picture: a picture deleted elsewhere cannot be opened here.
    await expect(card.getByText(DELETED_LINE, { exact: true })).toBeVisible();
    await expect(openKey(card)).toHaveCount(0);
    await expect(card.getByRole('img')).toHaveCount(0);
  });

  test('Clear all data on this device in another tab closes the open picture and leaves no picture on the page', async ({ page, context }) => {
    test.setTimeout(90_000);
    await seedDevice(context, { pictures: { noticeAnswered: true } });
    await seedOne(page);
    const { dialog } = await openSaved(page);
    await expect(dialog.getByRole('img')).toHaveCount(2);

    const second = await context.newPage();
    await clearAllDataOnThisDevice(second);
    await expect.poll(() => savedAlertCount(second), { timeout: 15_000 }).toBe(0);
    await second.close();

    // This tab lets go of every picture it showed, the open one too.
    await expect(dialog).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByRole('img', { name: /^(What the camera saw at|Close-up of the boxed part at) / })).toHaveCount(0);
  });

  test('the dialog works offline', async ({ page, context }) => {
    await seedDevice(context, { pictures: { noticeAnswered: true } });
    const { pictureId } = await seedOne(page);
    await page.goto('/monitor/', { waitUntil: 'networkidle' });
    await context.setOffline(true);
    const card = cards(page).first();
    await openKey(card).click();
    const dialog = opened(page);
    await expect(dialog.getByRole('img')).toHaveCount(2);
    await boxSwitch(dialog).click();
    await expect(dialog.locator('.alert-picture__box')).toHaveCount(0);
    const [saved] = await Promise.all([page.waitForEvent('download'), saveKey(dialog).click()]);
    expect((await readFile((await saved.path())!)).toString('base64')).toBe(await keptFrame(page, pictureId));
    await deleteKey(dialog).click();
    await confirmDelete(page).click();
    await expect(dialog).toHaveCount(0);
    await expect(card.getByText(DELETED_LINE, { exact: true })).toBeVisible();
    expect(await keptCount(page)).toBe(0);
    await context.setOffline(false);
  });

  test('the dialog at 200 per cent text', async ({ page, context }) => {
    await seedDevice(context, { pictures: { noticeAnswered: true } });
    await seedOne(page);
    const { dialog } = await openSaved(page);
    await expect(dialog.getByRole('img')).toHaveCount(2);
    await doubleText(page);
    const title = dialog.getByRole('heading', { level: 2 });
    await expect.poll(() => title.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(36);
    // The title wraps beside Close; each key holds its words on its own row; nothing is cut.
    expect(await onOneRow(title, closeKey(dialog)), 'the title stands beside Close').toBe(true);
    expect((await title.boundingBox())!.height, 'the title wraps').toBeGreaterThan(60);
    const [save, remove] = [(await saveKey(dialog).boundingBox())!, (await deleteKey(dialog).boundingBox())!];
    expect(remove.y).toBeGreaterThanOrEqual(save.y + save.height);
    expect(await cutWords(dialog), 'nothing in the dialog is cut at 200 per cent').toEqual([]);
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), 'the panel does not scroll sideways').toBe(true);
    // The panel fits the window. History's own head behind it is wider than a phone at 200 per
    // cent, which is History's matter.
    expect(await partsPastEdge(dialog), 'nothing in the panel reaches past the window').toEqual([]);
  });
});

describeInBothLooks('The opened picture at each width', () => {
  for (const width of [320, 768, 1024, 1440]) {
    test(`the dialog at ${width} px`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 900 });
      await seedDevice(context, { pictures: { noticeAnswered: true } });
      await seedOne(page);
      const { dialog } = await openSaved(page);
      await expect(dialog.getByRole('img')).toHaveCount(2);
      const panel = (await dialog.boundingBox())!;
      const picture = (await dialog.getByRole('img', { name: /^What the camera saw at / }).boundingBox())!;
      const closeUp = (await dialog.getByRole('img', { name: /^Close-up of the boxed part at / }).boundingBox())!;
      const [save, remove] = [(await saveKey(dialog).boundingBox())!, (await deleteKey(dialog).boundingBox())!];
      expect(Math.round(remove.y - (save.y + save.height)), 'Delete picture stands 24 px under Save picture').toBe(24);
      expect(closeUp.width, 'the close-up shows at its own size at most').toBeLessThanOrEqual(320 + 1);
      if (width === 320) {
        // The panel is the screen; the picture and each key span its column.
        expect([Math.round(panel.x), Math.round(panel.width)]).toEqual([0, 320]);
        expect(Math.round(picture.width)).toBe(288);
        expect(Math.round(save.width)).toBe(288);
        expect(Math.round(remove.width)).toBe(288);
        // It scrolls down inside itself where its content is taller than the screen.
        expect(await dialog.evaluate((el) => {
          const scroller = el.querySelector('.alert-picture-dialog__body') ?? el;
          return scroller.scrollHeight > scroller.clientHeight ? getComputedStyle(scroller).overflowY : 'fits';
        })).toMatch(/^(auto|scroll|fits)$/);
      } else if (width === 768) {
        // A 640 px panel in the middle of the screen; Save picture at the row's right, Delete picture under it.
        expect(Math.round(panel.width)).toBe(640);
        expect(Math.abs(panel.x - (768 - 640) / 2)).toBeLessThanOrEqual(1);
        expect(Math.abs(save.x + save.width - (picture.x + picture.width)), 'Save picture stands at the row’s right').toBeLessThanOrEqual(2);
        expect(Math.abs(remove.x + remove.width - (save.x + save.width))).toBeLessThanOrEqual(2);
        expect(save.width).toBeLessThan(picture.width);
      } else if (width === 1024) {
        // A 960 px panel: the picture in its left two thirds, the words and the keys in one column at its right.
        expect(Math.round(panel.width)).toBe(960);
        const title = (await dialog.getByRole('heading', { level: 2 }).boundingBox())!;
        expect(picture.width / (panel.width - 48)).toBeGreaterThan(0.6);
        expect(picture.width / (panel.width - 48)).toBeLessThan(0.7);
        for (const part of [title, closeUp, save, remove]) expect(part.x, 'the column stands beside the picture').toBeGreaterThanOrEqual(picture.x + picture.width);
      } else {
        // A 1120 px panel: the picture 720 px wide, Save picture and Delete picture stacked beside it.
        expect(Math.round(panel.width)).toBe(1120);
        expect(Math.round(picture.width)).toBe(720);
        expect(save.x).toBeGreaterThanOrEqual(picture.x + picture.width);
        expect(Math.abs(save.x - remove.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(save.width - remove.width)).toBeLessThanOrEqual(1);
        expect(closeUp.x).toBeGreaterThanOrEqual(picture.x + picture.width);
      }
      // Close stands at the panel's top right.
      const close = (await closeKey(dialog).boundingBox())!;
      expect(panel.x + panel.width - (close.x + close.width)).toBeLessThanOrEqual(26);
      expect(close.y - panel.y).toBeLessThanOrEqual(26);
      expect(await scrollsSideways(page), await sidewaysParts(page)).toBe(false);
    });
  }
});

// =============================================================================
// History's entries with their pictures
// =============================================================================

const UNREADABLE_LINE = 'This picture could not be read on this device.';
const historyRows = (page: Page) => page.locator('[data-history-row]');
/** The day as the device writes it: "Nov 18, 2026". */
const dayOf = (page: Page, at: number) => page.evaluate((time) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(time), at);
/** The time of day as the device writes it, with plain spaces: "9:42:40 PM". */
const clockOf = async (page: Page, at: number) =>
  (await page.evaluate((time) => new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(time), at)).replace(/\s+/g, ' ');

/** A History row's thumbnail tile at each width. */
const THUMBNAIL_SIZES: Record<number, [number, number]> = { 320: [112, 84], 768: [144, 108], 1024: [160, 120], 1440: [200, 150] };

/** Motion and Sound together on the canvas camera: its left third changes and its microphone carries a tone. */
const MOTION_AND_SOUND = {
  activePresetId: 'custom',
  globalSettings: { ...CUSTOM_PRESET, audioDetectionEnabled: true, audioSensitivity: 95 },
};

/** A device with `count` saved Motion alerts and their kept pictures, the newest a minute old; answers their times, newest first. */
async function seedHistory(page: Page, count: number, extra: Record<string, unknown> = {}): Promise<number[]> {
  const now = Date.now();
  const times = Array.from({ length: count }, (_, i) => now - (i + 1) * 60_000);
  await seedPictureRows(page, times.map((at, i) => ({
    alert: savedAlert(`motion-${at}-history${i}`, at, { kind: 'motion', pictureId: `picture-${at}-history${i}` }),
    picture: keptPicture(`picture-${at}-history${i}`, at, { ...LARGE_PICTURE, ...extra }),
  })));
  return times;
}

for (const look of ['dark', 'light'] as const) {
  for (const width of [390, 1280]) {
    test.describe(`History's rows, ${width} px, ${look}`, () => {
      test.use({ colorScheme: look, viewport: { width, height: 900 } });

      test(`History lists each watch alert with its picture, ${width} px, ${look}`, async ({ page, context }) => {
        test.setTimeout(180_000);
        await watchWith(page, context, { settings: MOTION_AND_SOUND, camera: { ...LEFT_THIRD, tone: true } });
        const motionTime = await timeOf(cards(page).filter({ hasText: new RegExp(`Motion at ${TIME}`) }).first(), 'Motion');
        const soundTime = await timeOf(cards(page).filter({ hasText: new RegExp(`Sound at ${TIME}`) }).first(), 'Sound');
        await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
        await page.getByRole('button', { name: 'Stop watching', exact: true }).click();
        const kept = keptRows(await readDatabase(page));
        const motionAt = kept.find((row) => row.kind === 'motion')!.takenAt as number;

        await page.goto('/history/', { waitUntil: 'networkidle' });
        const motion = historyRows(page).filter({ hasText: motionTime }).filter({ hasText: 'Motion' }).first();
        const sound = historyRows(page).filter({ hasText: soundTime }).filter({ hasText: 'Sound' }).first();
        await expect(motion).toBeVisible();

        // The Motion row: the close-up's thumbnail in its tile, the kind at 600 and its level at 400,
        // the date and time in the quiet tone, and Open picture named with the kind, the date and the time.
        const thumbnail = motion.getByRole('img', { name: closeUpName(motionTime), exact: true });
        await expect(thumbnail).toBeVisible();
        const tile = (await motion.locator('.alert-picture__tile').boundingBox())!;
        expect([Math.round(tile.width), Math.round(tile.height)]).toEqual(width === 390 ? [112, 84] : [160, 120]);
        const kind = motion.getByText('Motion', { exact: true });
        expect(await kind.evaluate((el) => getComputedStyle(el).fontWeight)).toBe('600');
        const level = motion.getByText(LEVELS);
        await expect(level).toBeVisible();
        expect(await level.evaluate((el) => getComputedStyle(el).fontWeight)).toBe('400');
        expect(await onOneRow(kind, level), 'the kind and its level share a line').toBe(true);
        const day = await dayOf(page, motionAt);
        const when = motion.getByText(`${day} at ${motionTime}`, { exact: true });
        await expect(when).toBeVisible();
        expect(await when.evaluate((el) => el.classList.contains('alert-picture__quiet'))).toBe(true);
        await expect(motion.getByText(/Motion detected/)).toHaveCount(0);
        await expect(page.getByText('Monitoring Alert', { exact: true })).toHaveCount(0);
        const key = motion.getByRole('button', { name: `Open picture: Motion, ${day}, ${motionTime}`, exact: true });
        await expect(key).toBeVisible();
        const keyBox = (await key.boundingBox())!;
        expect(keyBox.height).toBeGreaterThanOrEqual(44);
        expect(keyBox.width).toBeGreaterThanOrEqual(120);

        // The Sound row: the whole picture's thumbnail, with no box.
        await expect(sound.getByRole('img', { name: pictureName(soundTime, false), exact: true })).toBeVisible();
        await expect(sound.locator('.alert-picture__box')).toHaveCount(0);

        // Open picture, and a press on the thumbnail, open the picture over History.
        await key.click();
        const dialog = page.getByRole('dialog', { name: `Motion at ${motionTime}`, exact: true });
        await expect(dialog.getByRole('img', { name: pictureName(motionTime, true), exact: true })).toBeVisible();
        await expect(closeKey(dialog)).toBeFocused();
        await closeKey(dialog).click();
        await expect(key).toBeFocused();
        await thumbnail.click();
        await expect(dialog).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);

        // After a reload the thumbnails show again from the store.
        await page.reload({ waitUntil: 'networkidle' });
        await expect(historyRows(page).filter({ hasText: motionTime }).filter({ hasText: 'Motion' }).first().getByRole('img', { name: closeUpName(motionTime), exact: true })).toBeVisible();
      });

      test(`History’s words meet the sizes and contrast, ${width} px, ${look}`, async ({ page, context }) => {
        await seedDevice(context, { pictures: { noticeAnswered: true } });
        await seedHistory(page, 2);
        await page.goto('/history/', { waitUntil: 'networkidle' });
        const row = historyRows(page).first();
        await expect(row.getByRole('img')).toHaveCount(1);
        expect(await readable(row, BLOCK_READABILITY), 'a row’s words').toEqual([]);
      });
    });
  }
}

describeInBothLooks('Deleting a picture from History, 1280 px', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('an earlier day’s picture opens titled with its date, and a picture deleted in the dialog leaves its row', async ({ page, context }) => {
    await seedDevice(context, { pictures: { noticeAnswered: true, deleteAfterDays: 7 } });
    const { at, pictureId } = await seedOne(page, {}, Date.now() - 2 * DAY);
    await page.goto('/history/', { waitUntil: 'networkidle' });
    const row = historyRows(page).first();
    const [day, time] = [await dayOf(page, at), await clockOf(page, at)];
    await row.getByRole('button', { name: `Open picture: Motion, ${day}, ${time}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Motion, ${day} at ${time}`, exact: true });
    await expect(dialog.getByRole('img')).toHaveCount(2);

    await deleteKey(dialog).click();
    await confirmDelete(page).click();
    await expect(dialog).toHaveCount(0);
    await expect(row.getByText(DELETED_LINE, { exact: true })).toBeVisible();
    await expect(row.locator('.alert-picture__empty')).toHaveCount(1);
    await expect(row.getByRole('img')).toHaveCount(0);
    await expect(openKey(row)).toHaveCount(0);
    // The row keeps its words.
    await expect(row.getByText('Motion', { exact: true })).toBeVisible();
    expect((await readDatabase(page)).pictures.find((picture) => picture.id === pictureId)).toMatchObject({ state: 'gone', gone: 'person' });
  });
});

describeInBothLooks('History’s rows of saved alerts, 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a picture past its age is deleted before History shows its row', async ({ page, context }) => {
    await seedDevice(context, { pictures: { noticeAnswered: true } });
    const { pictureId } = await seedOne(page, {}, Date.now() - 4 * DAY);
    await page.goto('/history/', { waitUntil: 'networkidle' });
    const row = historyRows(page).first();
    await expect(row.getByText('Its picture was deleted after 3 days.', { exact: true })).toBeVisible();
    await expect(row.getByText('Motion', { exact: true })).toBeVisible();
    await expect(row.getByRole('img')).toHaveCount(0);
    await expect(openKey(row)).toHaveCount(0);
    const gone = (await readDatabase(page)).pictures.find((picture) => picture.id === pictureId)!;
    expect(gone).toMatchObject({ state: 'gone', gone: 'age', goneAfterDays: 3 });
    expect(Object.keys(gone).filter((name) => ['frame', 'closeUp', 'box'].includes(name))).toEqual([]);
  });

  test('a picture History cannot read keeps its row and offers the dialog’s Delete picture', async ({ page, context }) => {
    await seedDevice(context, { pictures: { noticeAnswered: true } });
    await seedOne(page);
    await faultPictureStore(page, { reads: 'error' });
    await page.goto('/history/', { waitUntil: 'networkidle' });
    const row = historyRows(page).first();
    await expect(row.getByText(UNREADABLE_LINE, { exact: true })).toBeVisible();
    await expect(row.locator('.alert-picture__problem')).toHaveCount(1);
    await expect(row.getByText('Motion', { exact: true })).toBeVisible();
    await expect(row.getByRole('img')).toHaveCount(0);
    await openKey(row).click();
    const dialog = opened(page);
    await expect(dialog.getByText(READ_FAILED_LINE, { exact: true })).toBeVisible();
    await deleteKey(dialog).click();
    await confirmDelete(page).click();
    await expect(dialog).toHaveCount(0);
    await expect(row.getByText(DELETED_LINE, { exact: true })).toBeVisible();
    await expect(openKey(row)).toHaveCount(0);
  });

  test('History’s held reads show tiles first', async ({ page, context }) => {
    test.setTimeout(90_000);
    await seedDevice(context, { pictures: { noticeAnswered: true } });
    await seedHistory(page, 2);
    await faultPictureStore(page, { holdReadMs: 5_000 });
    await page.goto('/history/', { waitUntil: 'domcontentloaded' });
    await expect(historyRows(page)).toHaveCount(2);
    for (const row of await historyRows(page).all()) {
      const tile = row.locator('.alert-picture__wait');
      await expect(tile).toBeVisible();
      await expect(tile).toHaveAttribute('aria-hidden', 'true');
      await expect(row.getByRole('img')).toHaveCount(0);
      await expect(row.getByText('Motion', { exact: true })).toBeVisible();
    }
    for (const row of await historyRows(page).all()) {
      await expect(row.getByRole('img')).toHaveCount(1, { timeout: 20_000 });
      await expect(row.locator('.alert-picture__wait')).toHaveCount(0);
    }
  });

  test('a picture read that answers after Clear all data on this device in another tab shows nothing', async ({ page, context }) => {
    test.setTimeout(90_000);
    await seedDevice(context, { pictures: { noticeAnswered: true } });
    await seedHistory(page, 2);
    // This tab hears its picture reads' answers 15 seconds after the browser gave them.
    const HOLD_MS = 15_000;
    await faultPictureStore(page, { holdReadMs: HOLD_MS });
    await page.goto('/history/', { waitUntil: 'domcontentloaded' });
    await expect(historyRows(page)).toHaveCount(2);
    await expect(historyRows(page).first().locator('.alert-picture__wait')).toBeVisible();
    const readSince = Date.now();

    // Another tab clears everything while the reads' answers wait.
    const second = await context.newPage();
    await clearAllDataOnThisDevice(second);
    await expect.poll(() => savedAlertCount(second), { timeout: 15_000 }).toBe(0);
    await second.close();
    expect(Date.now() - readSince, 'the clear came while the answers waited').toBeLessThan(HOLD_MS);

    // The answers come from before the clear: this tab shows none of their pictures.
    await page.waitForTimeout(Math.max(0, HOLD_MS - (Date.now() - readSince)) + 3_000);
    await expect(page.getByRole('img', { name: /^(What the camera saw at|Close-up of the boxed part at) / })).toHaveCount(0);
  });

  test('History offline', async ({ page, context }) => {
    await seedDevice(context, { pictures: { noticeAnswered: true } });
    await seedHistory(page, 2);
    await page.goto('/history/', { waitUntil: 'networkidle' });
    await context.setOffline(true);
    await expect(historyRows(page)).toHaveCount(2);
    for (const row of await historyRows(page).all()) await expect(row.getByRole('img')).toHaveCount(1);
    await openKey(historyRows(page).first()).click();
    const dialog = opened(page);
    await expect(dialog.getByRole('img')).toHaveCount(2);
    await closeKey(dialog).click();
    await expect(dialog).toHaveCount(0);
    await context.setOffline(false);
  });
});

describeInBothLooks('History’s rows at each width, in keyboard order and in another profile', () => {
  for (const width of [320, 768, 1024, 1440]) {
    test(`History at ${width} px`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 900 });
      await seedDevice(context, { pictures: { noticeAnswered: true } });
      await seedHistory(page, 2);
      await page.goto('/history/', { waitUntil: 'networkidle' });
      const row = historyRows(page).first();
      await expect(row.getByRole('img')).toHaveCount(1);
      const tile = (await row.locator('.alert-picture__tile').boundingBox())!;
      expect([Math.round(tile.width), Math.round(tile.height)]).toEqual(THUMBNAIL_SIZES[width]);
      const kind = (await row.getByText('Motion', { exact: true }).boundingBox())!;
      const key = (await openKey(row).boundingBox())!;
      const edge = (await row.boundingBox())!;
      // The words stand beside the thumbnail at every width.
      expect(kind.x).toBeGreaterThanOrEqual(tile.x + tile.width);
      expect(kind.y).toBeLessThan(tile.y + tile.height);
      if (width === 320) {
        // Open picture stands under the thumbnail and the words.
        expect(key.y).toBeGreaterThanOrEqual(tile.y + tile.height);
      } else {
        // Open picture stands at the row's right end, beside the words.
        expect(key.x).toBeGreaterThanOrEqual(kind.x);
        expect(key.y).toBeLessThan(tile.y + tile.height);
        expect(edge.x + edge.width - (key.x + key.width)).toBeLessThanOrEqual(32);
      }
      if (width === 1440) expect(edge.width, 'the rows keep to the left 8 columns of the 1320 px grid').toBeLessThanOrEqual(880);
      expect(key.height).toBeGreaterThanOrEqual(44);
      expect(await cutWords(row), 'nothing in the row is cut').toEqual([]);
      expect(await scrollsSideways(page), await sidewaysParts(page)).toBe(false);
      if (width === 320) {
        await doubleText(page);
        expect(await row.evaluate((el) => {
          const within = el.getBoundingClientRect().right;
          return Array.from(el.querySelectorAll('p, span, button'))
            .filter((child) => !child.closest('.alert-pictures-keys[data-overflows] .alert-pictures-keys__row'))
            .filter((child) => child.getBoundingClientRect().right > within + 1 || child.scrollWidth > child.clientWidth + 1)
            .map((child) => (child.textContent || '').slice(0, 40));
        }), 'nothing in the row is cut or overlaps at 200 per cent').toEqual([]);
        // History's own head is wider than a 320 px phone at 200 per cent: the rows fit the window.
        for (const each of await historyRows(page).all()) expect(await partsPastEdge(each), 'nothing in a row reaches past the window').toEqual([]);
      }
    });
  }

  test('History in keyboard order', async ({ page, context }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedDevice(context, { pictures: { noticeAnswered: true } });
    await seedHistory(page, 2);
    await page.goto('/history/', { waitUntil: 'networkidle' });
    await expect(historyRows(page)).toHaveCount(2);
    const [first, second] = [openKey(historyRows(page).nth(0)), openKey(historyRows(page).nth(1))];
    // The thumbnail takes no stop of its own.
    expect(await historyRows(page).first().locator('.alert-picture__tile').evaluate((el) => el.tabIndex)).toBe(-1);
    await first.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(first).toBeFocused();
    expect(await first.evaluate((el) => getComputedStyle(el).outlineStyle), 'the key shows its ring').not.toBe('none');
    // The second row's key comes after the first row's own keys, in the list's order.
    let reached = false;
    for (let presses = 0; presses < 6 && !reached; presses++) {
      await page.keyboard.press('Tab');
      reached = await second.evaluate((el) => el === document.activeElement);
      if (!reached) {
        expect(await historyRows(page).first().evaluate((el) => el.contains(document.activeElement)), 'focus stays in the first row until the second row’s key').toBe(true);
      }
    }
    expect(reached, 'the second row’s Open picture is reached in order').toBe(true);
    expect(await second.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
  });

  test('another profile’s History shows none of these', async ({ page, context, browser, colorScheme }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedDevice(context, { pictures: { noticeAnswered: true } });
    await seedHistory(page, 2);
    await page.goto('/history/', { waitUntil: 'networkidle' });
    await expect(historyRows(page)).toHaveCount(2);
    const other = await browser.newContext({ colorScheme, viewport: { width: 1280, height: 900 } });
    await seedDevice(other, { pictures: { noticeAnswered: true } });
    const stranger = await other.newPage();
    await stranger.goto('/history/', { waitUntil: 'networkidle' });
    await expect(historyRows(stranger)).toHaveCount(0);
    await expect(stranger.getByRole('img', { name: /^(Close-up of the boxed part|What the camera saw) at / })).toHaveCount(0);
    expect((await readDatabase(stranger)).pictures).toEqual([]);
    await other.close();
  });
});

// =============================================================================
// The notification's words and picture
// =============================================================================

const PICTURE_SWITCH = 'Show the picture in alert notifications';
const LOCK_SCREEN_LINE = 'The picture shows in the notification, and on some phones on the lock screen, to anyone who can see this device. The phone’s own settings decide what a locked screen shows.';
const THIS_DEVICE_LINE = 'A notification shows on this device, the one that watches.';
const WORDS_ALONE_LINE = 'This browser shows a notification’s words alone.';
const BLOCKED_LINE = 'To allow them, open the site settings from the address bar and set Notifications to Allow.';

const pictureRow = (page: Page) => page.locator('[data-notification-picture-row]');
const pictureSwitch = (page: Page) => page.getByRole('switch', { name: PICTURE_SWITCH, exact: true });
const allowKey = (page: Page) => page.getByRole('button', { name: 'Allow notifications', exact: true });
const storedPictures = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('safeos-alert-pictures') ?? '{}').state ?? {});

/** Opens Settings, Notifications on a seeded device with the browser's notifications stood in. */
async function openNotificationSettings(page: Page, context: BrowserContext, standIn: NotificationStandIn = {}, pictures: PicturesSeed = { noticeAnswered: true }): Promise<void> {
  await seedDevice(context, { pictures });
  await recordNotifications(context, standIn);
  await page.goto('/settings/notifications/', { waitUntil: 'networkidle' });
  await expect(pictureRow(page)).toBeVisible();
}

/** Starts a watch whose notifications are recorded. */
async function watchWithNotes(page: Page, context: BrowserContext, options: {
  settings: Record<string, unknown>;
  camera: CanvasCamera;
  pictures?: PicturesSeed;
  standIn?: NotificationStandIn;
}): Promise<void> {
  await recordNotifications(context, options.standIn ?? {});
  await watchWith(page, context, { settings: options.settings, camera: options.camera, pictures: options.pictures ?? { noticeAnswered: true } });
}

const noteBody = (time: string) => new RegExp(`^(Low|Medium|High|Critical), ${timePattern(time)}\\.$`);

for (const look of ['dark', 'light'] as const) {
  for (const width of [390, 1280]) {
    test.describe(`The notification's picture in Settings, ${width} px, ${look}`, () => {
      test.use({ colorScheme: look, viewport: { width, height: 900 } });

      test(`Settings, Notifications offers the notification's picture, off, ${width} px, ${look}`, async ({ page, context }) => {
        await openNotificationSettings(page, context);
        const row = pictureRow(page);
        const found = pictureSwitch(page);
        await expect(found).toHaveAttribute('aria-checked', 'false');
        await expect(found).not.toHaveAttribute('aria-disabled', 'true');
        const line = row.getByText(LOCK_SCREEN_LINE, { exact: true });
        const quiet = row.getByText(THIS_DEVICE_LINE, { exact: true });
        await expect(line).toBeVisible();
        await expect(quiet).toBeVisible();
        // The switch is described by its line, which stands under the label, with the quiet line under it.
        const described = (await found.getAttribute('aria-describedby')) ?? '';
        expect(described.split(/\s+/)).toContain(await line.getAttribute('id'));
        const label = row.getByText(PICTURE_SWITCH, { exact: true });
        const [labelBox, lineBox, quietBox, switchBox] = [(await label.boundingBox())!, (await line.boundingBox())!, (await quiet.boundingBox())!, (await found.boundingBox())!];
        expect(lineBox.y).toBeGreaterThanOrEqual(labelBox.y + labelBox.height - 1);
        expect(quietBox.y).toBeGreaterThanOrEqual(lineBox.y + lineBox.height - 1);
        expect(switchBox.x, 'the switch stands at the right of its label').toBeGreaterThanOrEqual(labelBox.x + labelBox.width - 1);
        expect(switchBox.height).toBeGreaterThanOrEqual(44);
        await expect(allowKey(page)).toHaveCount(0);
        expect(await readable(row, BLOCK_READABILITY), 'the row’s words').toEqual([]);
        expect(await label.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(18);
        expect(await line.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(18);

        // On: kept on this device, and on after a reload. A press on the label turns it too.
        await found.click();
        await expect(found).toHaveAttribute('aria-checked', 'true');
        expect((await storedPictures(page)).inNotifications).toBe(true);
        await page.reload({ waitUntil: 'networkidle' });
        await expect(pictureSwitch(page)).toHaveAttribute('aria-checked', 'true');
        await pictureRow(page).getByText(PICTURE_SWITCH, { exact: true }).click();
        await expect(pictureSwitch(page)).toHaveAttribute('aria-checked', 'false');
        expect((await storedPictures(page)).inNotifications).toBe(false);
      });
    });
  }
}

test.describe('The notification’s picture in Settings: a browser that shows words alone, permission, widths and another profile', () => {
  test('Settings, Notifications in a browser that shows words alone', async ({ page, context }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openNotificationSettings(page, context, { wordsAlone: true });
    const found = pictureSwitch(page);
    await expect(found).toHaveAttribute('aria-disabled', 'true');
    await expect(found).toHaveAttribute('aria-checked', 'false');
    const why = pictureRow(page).getByText(WORDS_ALONE_LINE, { exact: true });
    await expect(why).toBeVisible();
    expect(((await found.getAttribute('aria-describedby')) ?? '').split(/\s+/), 'the reason is in the switch’s description').toContain(await why.getAttribute('id'));
    // It stays in the page's order, and a press changes nothing.
    await found.focus();
    await expect(found).toBeFocused();
    await found.click({ force: true });
    await expect(found).toHaveAttribute('aria-checked', 'false');
    expect((await storedPictures(page)).inNotifications).toBe(false);
  });

  describeInBothLooks('Notification permissions, 390 px', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('with notifications not allowed the switch waits beside Allow notifications, and an alert sends none', async ({ page, context }) => {
      test.setTimeout(150_000);
      await seedDevice(context, { settings: MOTION_ONLY, pictures: { noticeAnswered: true, inNotifications: true } });
      await recordNotifications(context, { permission: 'default' });
      await canvasCamera(page, LEFT_THIRD);

      // An alert on the watch asks the browser for nothing.
      await page.goto('/monitor/', { waitUntil: 'networkidle' });
      await startWatching(page);
      await timeOf(cards(page).first(), 'Motion');
      await page.waitForTimeout(1_500);
      expect(await notesOf(page)).toEqual([]);
      expect(await page.evaluate(() => window.__notificationAsks), 'the watch asks the browser for nothing').toBe(0);
      await page.getByRole('button', { name: 'Stop watching', exact: true }).click();

      await page.goto('/settings/notifications/', { waitUntil: 'networkidle' });
      const found = pictureSwitch(page);
      await expect(found).toHaveAttribute('aria-disabled', 'true');
      const allow = allowKey(page);
      await expect(allow).toBeVisible();
      expect((await allow.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => window.__notificationAsks)).toBe(0);
      // A press on the inactive switch changes nothing. It is sent to the switch itself: the page
      // scrolls smoothly, so a forced press at the switch's place can land on whatever passes there.
      await found.dispatchEvent('click');
      await expect(found).toHaveAttribute('aria-checked', 'true');
      // The key asks the browser; once allowed, the switch is active and the key has gone.
      await allow.click();
      await expect.poll(() => page.evaluate(() => window.__notificationAsks)).toBe(1);
      await expect(found).not.toHaveAttribute('aria-disabled', 'true');
      await expect(allow).toHaveCount(0);
      await found.click();
      await expect(found).toHaveAttribute('aria-checked', 'false');
    });

    test('notifications allowed in the site settings make the switch usable with no reload', async ({ page, context }) => {
      await openNotificationSettings(page, context, { permission: 'denied' });
      const found = pictureSwitch(page);
      await expect(found).toHaveAttribute('aria-disabled', 'true');
      // The person allows notifications in the site settings and comes back to the page.
      await page.evaluate(() => {
        window.__setNotificationPermission!('granted');
        window.dispatchEvent(new Event('focus'));
      });
      await expect(pictureRow(page).getByText(BLOCKED_LINE, { exact: true })).toHaveCount(0);
      await expect(found).not.toHaveAttribute('aria-disabled', 'true');
      await found.click();
      await expect(found).toHaveAttribute('aria-checked', 'true');
    });

    test('blocked notifications say how to allow them', async ({ page, context }) => {
      await openNotificationSettings(page, context, { permission: 'denied' });
      const found = pictureSwitch(page);
      await expect(found).toHaveAttribute('aria-disabled', 'true');
      const how = pictureRow(page).getByText(BLOCKED_LINE, { exact: true });
      await expect(how).toBeVisible();
      expect(((await found.getAttribute('aria-describedby')) ?? '').split(/\s+/)).toContain(await how.getAttribute('id'));
      expect((await how.boundingBox())!.y, 'the line stands under the switch').toBeGreaterThan((await found.boundingBox())!.y);
      await expect(allowKey(page)).toHaveCount(0);
    });
  });

  for (const look of ['dark', 'light'] as const) {
    test(`the row at 320 px and 200 per cent text, ${look}`, async ({ page, context }) => {
      await page.emulateMedia({ colorScheme: look });
      await page.setViewportSize({ width: 320, height: 800 });
      await openNotificationSettings(page, context);
      const row = pictureRow(page);
      const label = row.getByText(PICTURE_SWITCH, { exact: true });
      for (const text of [100, 200]) {
        if (text === 200) await doubleText(page);
        const [labelBox, switchBox, rowBox] = [(await label.boundingBox())!, (await pictureSwitch(page).boundingBox())!, (await row.boundingBox())!];
        expect(await onOneRow(label, pictureSwitch(page)), `the label wraps beside the switch at ${text} per cent`).toBe(true);
        expect(switchBox.x, `the switch keeps its place at the row's right at ${text} per cent`).toBeGreaterThanOrEqual(labelBox.x + labelBox.width - 1);
        expect(rowBox.x + rowBox.width - (switchBox.x + switchBox.width)).toBeLessThanOrEqual(24);
        expect(await cutWords(row), `nothing in the row is cut at ${text} per cent`).toEqual([]);
        // At 200 per cent the page's own heading is wider than a 320 px phone: the row fits the window.
        if (text === 100) expect(await scrollsSideways(page), await sidewaysParts(page)).toBe(false);
        else expect(await partsPastEdge(row), 'nothing in the row reaches past the window').toEqual([]);
      }
      expect((await label.boundingBox())!.height, 'the label wraps').toBeGreaterThan(40);
    });
  }

  describeInBothLooks('Notification picture layout and profile isolation', () => {
    for (const width of [768, 1440]) {
      test(`the row at ${width} px`, async ({ page, context }) => {
        await page.setViewportSize({ width, height: 900 });
        await openNotificationSettings(page, context);
        const row = pictureRow(page);
        const label = row.getByText(PICTURE_SWITCH, { exact: true });
        const line = row.getByText(LOCK_SCREEN_LINE, { exact: true });
        const [labelBox, lineBox, switchBox, rowBox] = [(await label.boundingBox())!, (await line.boundingBox())!, (await pictureSwitch(page).boundingBox())!, (await row.boundingBox())!];
        // The switch at the row's right end, beside the label's first line.
        expect(rowBox.x + rowBox.width - (switchBox.x + switchBox.width)).toBeLessThanOrEqual(24);
        expect(Math.abs(switchBox.y + switchBox.height / 2 - (labelBox.y + 14))).toBeLessThanOrEqual(22);
        expect(lineBox.x + lineBox.width, 'the line keeps to the label’s side').toBeLessThanOrEqual(switchBox.x);
        expect(lineBox.width).toBeLessThanOrEqual(width === 768 ? 520 : 640);
        if (width === 1440) expect(await line.evaluate((el) => getComputedStyle(el).fontSize)).toBe('20px');
        expect(await scrollsSideways(page), await sidewaysParts(page)).toBe(false);
      });
    }

    test('another profile’s switch is off', async ({ page, context, browser, colorScheme }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await openNotificationSettings(page, context);
      await pictureSwitch(page).click();
      await expect(pictureSwitch(page)).toHaveAttribute('aria-checked', 'true');
      const other = await browser.newContext({ colorScheme, viewport: { width: 1280, height: 900 } });
      const stranger = await other.newPage();
      await openNotificationSettings(stranger, other);
      await expect(pictureSwitch(stranger)).toHaveAttribute('aria-checked', 'false');
      await other.close();
    });
  });
});

describeInBothLooks('A watch alert’s notification, 1280 px', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('a Motion alert’s notification names the kind, the level and the time, with no picture while the switch is off', async ({ page, context }) => {
    test.setTimeout(150_000);
    await watchWithNotes(page, context, { settings: MOTION_ONLY, camera: MIDDLE_BAND });
    const time = await timeOf(cards(page).first(), 'Motion');
    await holdStill(page);
    await expect.poll(async () => (await notesOf(page)).length, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
    const [note] = await notesOf(page);
    expect(note.title).toBe('Motion alert');
    expect(note.body).toMatch(noteBody(time));
    expect(note.image ?? null, 'no picture while the switch is off').toBeNull();
    expect(note.tag).toMatch(/^safeos-/);
    expect(note.renotify).toBe(true);
    // No notification says Detected, a percentage or a threshold.
    for (const said of await notesOf(page)) expect(`${said.title} ${said.body ?? ''}`).not.toMatch(/detected|%|threshold/i);
  });

  test('with the switch on, a Motion alert’s notification carries the picture with its box drawn in', async ({ page, context }) => {
    test.setTimeout(150_000);
    // The camera's pictures are drawn once and shown in turn, so this page's own drawing leaves the
    // alert's picture its 300 ms on a busy runner.
    await watchWithNotes(page, context, { settings: MOTION_ONLY, camera: { ...MIDDLE_BAND, cycle: 8 }, pictures: { noticeAnswered: true, inNotifications: true } });
    const time = await timeOf(cards(page).first(), 'Motion');
    await holdStill(page);
    await expect.poll(async () => (await notesOf(page)).length, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
    const [note] = await notesOf(page);
    expect(note.title).toBe('Motion alert');
    expect(note.body).toMatch(noteBody(time));
    expect(note.image, 'the notification carries a picture').toMatch(/^data:image\/jpeg;base64,/);
    // The pet's photo or any other picture never stands as the notification's icon.
    expect(note.icon ?? '').not.toMatch(/^(data|blob):/);

    // The copy is 640 px on its long edge. The frame's box is its middle band, 640 by 240 at (0, 120):
    // its top edge is 4 px of the box's green inside 2 px of its dark line, and outside the box the
    // picture is the kept frame's, a flat grey.
    const size = await page.evaluate((url) => new Promise<[number, number]>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve([image.naturalWidth, image.naturalHeight]);
      image.onerror = () => reject(new Error('the notification’s picture did not load'));
      image.src = url;
    }), note.image!);
    expect(size).toEqual([640, 480]);
    const column = await pixelsAt(page, note.image!, [[320, 118], [320, 119], [320, 120], [320, 121], [320, 122], [320, 123], [320, 60], [320, 420]]);
    expect(column.slice(2, 6).filter((rgb) => near(rgb, '#4ade80', 60)).length, `the box's green line is 4 px (${JSON.stringify(column)})`).toBeGreaterThanOrEqual(3);
    expect(column.slice(0, 2).some((rgb) => near(rgb, '#0b131b', 40)), `its dark line stands outside it (${JSON.stringify(column)})`).toBe(true);
    await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBe(1);
    const [row] = keptRows(await readDatabase(page));
    const keptUrl = `data:image/jpeg;base64,${await keptFrame(page, row.id)}`;
    const kept = await pixelsAt(page, keptUrl, [[320, 60], [320, 420]]);
    [column[6], column[7]].forEach((rgb, i) => {
      expect(Math.abs(rgb[0] - kept[i][0]), `outside the box the copy shows the kept frame (${rgb} against ${kept[i]})`).toBeLessThanOrEqual(12);
    });
    // The alert's words stay in the title and body: none of this is stored as a data URL.
    const reading = await readDatabase(page);
    expect(JSON.stringify(reading.alerts)).not.toContain('data:image');
    expect(await page.evaluate(() => Object.values({ ...localStorage }).join(' ').includes('data:image'))).toBe(false);
  });

  test('a Sound alert’s notification never carries a picture', async ({ page, context }) => {
    test.setTimeout(120_000);
    await watchWithNotes(page, context, {
      settings: SOUND_ONLY,
      camera: { ...LEFT_THIRD, moving: { x: 0, y: 0, width: 0, height: 0 }, tone: true },
      pictures: { noticeAnswered: true, inNotifications: true },
    });
    const time = await timeOf(cards(page).first(), 'Sound');
    await expect.poll(async () => (await notesOf(page)).length, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
    const [note] = await notesOf(page);
    expect(note.title).toBe('Sound alert');
    expect(note.body).toMatch(noteBody(time));
    expect(note.image ?? null).toBeNull();
    expect(`${note.title} ${note.body ?? ''}`).not.toMatch(/detected|%|threshold/i);
  });

  test('a picture that takes too long goes as words at 300 ms', async ({ page, context }) => {
    test.setTimeout(120_000);
    // The picture's JPEG is handed back a second after it is drawn.
    await faultPictureStore(page, { holdDrawMs: 1_000 });
    await watchWithNotes(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD, pictures: { noticeAnswered: true, inNotifications: true } });
    await timeOf(cards(page).first(), 'Motion');
    await holdStill(page);
    await expect.poll(async () => (await notesOf(page)).length, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
    const [note] = await notesOf(page);
    expect(note.title).toBe('Motion alert');
    expect(note.image ?? null, 'the words go alone').toBeNull();
    const [alert] = monitoringAlerts(await readDatabase(page));
    const waited = note.at - Date.parse(alert.createdAt as string);
    expect(waited, `sent ${waited} ms after the alert`).toBeGreaterThanOrEqual(290);
    expect(waited, `sent ${waited} ms after the alert`).toBeLessThanOrEqual(900);
    // The late picture sends no second notification.
    await expect(cards(page).first().locator('.alert-picture__frame img')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    expect(await notesOf(page)).toHaveLength(1);
  });

  test('a picture that cannot be drawn leaves the notification’s words', async ({ page, context }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await watchWithNotes(page, context, {
      settings: MOTION_ONLY, camera: LEFT_THIRD,
      pictures: { noticeAnswered: true, inNotifications: true }, standIn: { failCopy: true },
    });
    const card = cards(page).first();
    const time = await timeOf(card, 'Motion');
    await holdStill(page);
    await expect.poll(async () => (await notesOf(page)).length, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
    const [note] = await notesOf(page);
    expect(note.title).toBe('Motion alert');
    expect(note.body).toMatch(noteBody(time));
    expect(note.image ?? null).toBeNull();
    // The card shows its picture, and the page shows no error.
    await expect(card.getByRole('img', { name: pictureName(time, true), exact: true })).toBeVisible();
    await expect(page.getByText(/could not be (drawn|sent|shown)/i)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('a repeat replaces the event’s notification with the newest picture and time', async ({ page, context }) => {
    test.setTimeout(180_000);
    await watchWithNotes(page, context, {
      settings: { ...MOTION_ONLY, timingSettings: cooldownPeriod(20) }, camera: LEFT_THIRD,
      pictures: { noticeAnswered: true, inNotifications: true },
    });
    const card = cards(page).first();
    const first = await timeOf(card, 'Motion');
    await expect(card.getByText('Repeated 1 time', { exact: true })).toBeVisible({ timeout: 60_000 });
    const later = await timeOf(card, 'Motion');
    expect(later).not.toBe(first);
    await expect.poll(async () => (await notesOf(page)).length, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
    const [one, two] = await notesOf(page);
    expect([one.title, two.title]).toEqual(['Motion alert', 'Motion alert']);
    expect(one.body).toMatch(noteBody(first));
    expect(two.body).toMatch(noteBody(later));
    expect(two.tag, 'the repeat keeps the event’s tag, so it replaces the first').toBe(one.tag);
    expect(two.renotify).toBe(true);
    expect(one.image).toMatch(/^data:image\/jpeg;base64,/);
    expect(two.image).toMatch(/^data:image\/jpeg;base64,/);
    expect(two.image, 'the newest picture').not.toBe(one.image);
  });

  test('a notification is asked for offline', async ({ page, context }) => {
    test.setTimeout(120_000);
    await recordNotifications(context, {});
    await seedDevice(context, { settings: MOTION_ONLY, pictures: { noticeAnswered: true, inNotifications: true } });
    await canvasCamera(page, LEFT_THIRD);
    await page.goto('/monitor/', { waitUntil: 'networkidle' });
    await context.setOffline(true);
    await startWatching(page);
    const time = await timeOf(cards(page).first(), 'Motion');
    await holdStill(page);
    await expect.poll(async () => (await notesOf(page)).length, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
    const [note] = await notesOf(page);
    expect(note.title).toBe('Motion alert');
    expect(note.body).toMatch(noteBody(time));
    expect(note.image).toMatch(/^data:image\/jpeg;base64,/);
    await context.setOffline(false);
  });

  // It reads the copy drawn within the 300 ms, so it runs in the notifications' own step, alone.
  test('turning the picture off while the notification’s picture is drawn sends the words alone', async ({ page, context }) => {
    test.setTimeout(120_000);
    // The notification's copy is drawn after the person turned the picture off in another tab.
    await page.addInitScript(() => {
      const toDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (this: HTMLCanvasElement, type?: string, quality?: number) {
        // The notification's copy alone is a JPEG at 0.8; the camera's frames for a server are at 0.7.
        if (type === 'image/jpeg' && quality === 0.8) {
          const marks = window as unknown as { __turnedOffAt?: number };
          marks.__turnedOffAt ??= Date.now();
          const key = 'safeos-alert-pictures';
          const stored = JSON.parse(localStorage.getItem(key) ?? '{"state":{},"version":0}');
          stored.state.inNotifications = false;
          const value = JSON.stringify(stored);
          localStorage.setItem(key, value);
          window.dispatchEvent(new StorageEvent('storage', { key, newValue: value, storageArea: localStorage }));
        }
        return toDataURL.call(this, type, quality);
      } as typeof toDataURL;
    });
    await watchWithNotes(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD, pictures: { noticeAnswered: true, inNotifications: true } });
    await timeOf(cards(page).first(), 'Motion');
    await holdStill(page);
    await expect.poll(async () => (await notesOf(page)).length, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
    const [note] = await notesOf(page);
    expect(note.title).toBe('Motion alert');
    // The copy was drawn, and the picture turned off, before the notification went: the words go
    // alone for the person's choice, not for a picture that came too late.
    const turnedOffAt = await page.evaluate(() => (window as unknown as { __turnedOffAt?: number }).__turnedOffAt);
    expect(turnedOffAt, 'the notification’s copy was drawn').toBeDefined();
    expect(turnedOffAt!, 'the picture was turned off before the notification went').toBeLessThanOrEqual(note.at);
    expect(note.image ?? null, 'no picture once the person turned it off').toBeNull();
  });

  // It reads copies drawn within the 300 ms, so it runs in the notifications' own step, alone.
  test('turning the picture off while a repeat’s notification waits its turn sends that one with its words alone', async ({ page, context }) => {
    test.setTimeout(180_000);
    await page.addInitScript(() => {
      const marks = window as unknown as { __copies?: number[]; __releaseNote?: () => void };
      marks.__copies = [];
      // When each notification's copy is drawn: the copy alone is a JPEG at 0.8.
      const toDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (this: HTMLCanvasElement, type?: string, quality?: number) {
        const url = toDataURL.call(this, type, quality);
        if (type === 'image/jpeg' && quality === 0.8) marks.__copies!.push(Date.now());
        return url;
      } as typeof toDataURL;
      // The browser takes the event's first notification and holds it until the walk lets it go,
      // so the repeat's notification waits its turn behind it.
      const container = navigator.serviceWorker;
      if (!container) return;
      const getRegistration = container.getRegistration.bind(container);
      let first = true;
      container.getRegistration = ((clientURL?: string) => {
        if (!first) return getRegistration(clientURL);
        first = false;
        return new Promise<ServiceWorkerRegistration | undefined>((resolve) => {
          marks.__releaseNote = () => resolve(getRegistration(clientURL));
        });
      }) as typeof container.getRegistration;
    });
    await watchWithNotes(page, context, {
      settings: { ...MOTION_ONLY, timingSettings: cooldownPeriod(20) }, camera: { ...LEFT_THIRD, cycle: 8 },
      pictures: { noticeAnswered: true, inNotifications: true },
    });
    const card = cards(page).first();
    const first = await timeOf(card, 'Motion');
    await expect(card.getByText('Repeated 1 time', { exact: true })).toBeVisible({ timeout: 60_000 });
    const later = await timeOf(card, 'Motion');
    await holdStill(page);
    expect(await page.evaluate(() => typeof (window as unknown as { __releaseNote?: () => void }).__releaseNote), 'the browser holds the first notification').toBe('function');

    // The repeat's copy was drawn within its 300 ms, so its notification has its picture as it waits.
    const copies = () => page.evaluate(() => (window as unknown as { __copies: number[] }).__copies);
    await expect.poll(async () => (await copies()).length, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
    const [firstDrawn, drawn] = await copies();
    // The repeat's picture is kept with the repeat's time, which its notification was asked at.
    const newestKept = async () => Math.max(0, ...keptRows(await readDatabase(page)).map((row) => row.takenAt as number));
    await expect.poll(newestKept, { timeout: 15_000 }).toBeGreaterThan(firstDrawn);
    const repeatAt = await newestKept();
    expect(drawn - repeatAt, 'the repeat’s copy was drawn within its 300 ms').toBeLessThanOrEqual(300);
    await page.waitForTimeout(1_000);
    expect(await notesOf(page), 'no notification has gone while the browser holds the first').toHaveLength(0);

    // The person turns the picture off in another tab, and then the browser takes the first.
    await page.evaluate(() => {
      const key = 'safeos-alert-pictures';
      const stored = JSON.parse(localStorage.getItem(key) ?? '{"state":{},"version":0}');
      stored.state.inNotifications = false;
      const value = JSON.stringify(stored);
      localStorage.setItem(key, value);
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: value, storageArea: localStorage }));
    });
    await page.evaluate(() => (window as unknown as { __releaseNote: () => void }).__releaseNote());
    await expect.poll(async () => (await notesOf(page)).length, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
    const [one, two] = await notesOf(page);
    // The first was in the browser's hands before the switch turned off.
    expect(one.body).toMatch(noteBody(first));
    expect(two.body).toMatch(noteBody(later));
    expect(two.image ?? null, 'the repeat’s notification goes with its words alone').toBeNull();
  });
});

// =============================================================================
// The privacy page and the third-party notices
// =============================================================================

describeInBothLooks('The privacy page and the notices, 1280 px', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('the privacy page names what an alert keeps, and the notices list the bundled packages', async ({ page }) => {
    await page.goto('/privacy/', { waitUntil: 'networkidle' });
    const words = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    for (const sentence of [
      'alerts, alert pictures and Lost & Found’s sightings in its IndexedDB; People’s saved frames and your pets’ photos in both.',
      'Alert pictures are not sent to that server.',
      'For each Motion and Picture change alert on the monitor page, SafeOS keeps the camera\'s picture of the moment and, where it can mark what changed, a box round it and a close-up of that box.',
      'A box over more than half of the picture has no close-up, and a Picture change over more than half of the picture has no box.',
      'A Sound alert keeps the picture with no box, and a Lost & Found alert keeps the camera\'s picture with a box round the part like your pet\'s photos.',
      'They are kept in this browser\'s IndexedDB on this device; Frame, which runs safeos.sh, never receives them.',
      'They are deleted after the time you choose under Keep alert pictures (3 days unless you choose 1, 7 or 30 days, or until you delete them); the alert\'s words stay in History.',
      'A picture is also deleted with its alert when the alert leaves under the limits above.',
      'You can delete one picture or all of them; Clear all data on this device and signing out delete them too.',
      'SafeOS sends alert pictures to no server, a server you connect yourself included.',
      'Anyone who can open SafeOS in this browser can see the alerts and their pictures.',
      'Alerts are never removed because of their age; their pictures are, after the time you choose.',
      'Clear all data on this device, on Settings, Data on this device, also removes recorded sounds, alert pictures and the offline cache.',
      'clears the alerts and their pictures, frames, recordings and personal settings saved in this browser',
      'If you turn on Show the picture in alert notifications, the picture shows in the notification, and on some phones on the lock screen, to anyone who can see this device.',
      'Last updated: November 26, 2026',
    ]) {
      expect(words, `the privacy page says: ${sentence}`).toContain(sentence);
    }

    // The built site lists the packages it bundles, with their versions as the lockfile holds them.
    const lock = JSON.parse(readFileSync(path.join(process.cwd(), 'package-lock.json'), 'utf8')) as { packages: Record<string, { version?: string }> };
    const versionOf = (name: string) => lock.packages[`node_modules/${name}`]?.version ?? 'not in the lockfile';
    const answer = await page.request.get('/third-party-notices.txt');
    expect(answer.status(), 'the notices file is served').toBe(200);
    const notices = await answer.text();
    for (const name of ['@tensorflow-models/coco-ssd', '@tensorflow/tfjs']) {
      expect(notices, `the notices list ${name} at ${versionOf(name)}`).toContain(`${name} ${versionOf(name)}`);
    }
    expect(notices).toContain('Apache License');
    // Each package's own licence text stands whole: lodash's names Underscore's author after its first line.
    expect(notices, 'lodash’s licence text whole').toContain('Based on Underscore.js, copyright Jeremy Ashkenas');
    expect(notices).toContain('The COCO-SSD model was trained on the COCO dataset; COCO\'s annotations are © COCO Consortium, licensed CC BY 4.0 (https://cocodataset.org/#termsofuse).');
    // A package used to build or test the site alone is not listed.
    expect(notices).not.toMatch(/^@playwright\/test /m);
    // Nor is a package for another platform, which the build machine (Linux) never installs.
    for (const name of ['@next/swc-darwin-arm64', '@next/swc-win32-x64-msvc', '@parcel/watcher-darwin-arm64']) {
      expect(notices, `the notices leave out ${name}`).not.toMatch(new RegExp(`^${name.replace(/[/]/g, '\\/')} `, 'm'));
    }

    for (const address of ['/about/', '/settings/models/']) {
      await page.goto(address, { waitUntil: 'networkidle' });
      const link = page.getByRole('link', { name: 'Third-party notices', exact: true });
      await expect(link, `${address} links the notices`).toBeVisible();
      expect(await link.getAttribute('href')).toMatch(/\/third-party-notices\.txt$/);
    }
  });
});

describeInBothLooks('What leaves this device on a phone, 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('each connection reads whole in the window, with no sideways scroll, and each part says what it is', async ({ page }) => {
    await page.goto('/privacy/', { waitUntil: 'networkidle' });
    const table = page.getByRole('table', { name: 'What leaves this device' });
    await table.scrollIntoViewIfNeeded();

    const region = page.getByRole('region', { name: 'What leaves this device' });
    const sideways = await region.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(sideways, 'pixels the table scrolls sideways').toBeLessThanOrEqual(0);

    // Every name and every cell lies inside the 390 px window.
    const outside = await table.locator('tbody th, tbody td').evaluateAll((cells) =>
      cells
        .map((cell) => ({ words: (cell.textContent ?? '').trim().slice(0, 40), box: cell.getBoundingClientRect() }))
        .filter(({ box }) => box.left < 0 || box.right > window.innerWidth)
        .map(({ words, box }) => `${words} (${Math.round(box.left)} to ${Math.round(box.right)} px)`)
    );
    expect(outside, 'cells outside the window').toEqual([]);

    // The table keeps its header, rows and cells for a screen reader.
    await expect(table.getByRole('columnheader')).toHaveCount(4);
    await expect(table.getByRole('rowheader')).toHaveCount(4);
    await expect(table.getByRole('cell')).toHaveCount(12);

    // With the header row out of sight, each part of a connection says what it is.
    for (const row of await table.locator('tbody tr').all()) {
      const words = (await row.innerText()).replace(/\s+/g, ' ');
      for (const label of ['When', 'Who sees what', 'How to stop it']) {
        expect(words, `a connection names its part ${label}`).toContain(label);
      }
    }
  });
});

// =============================================================================
// Edges of the save, the sweeps and the notification
// =============================================================================

test.describe('Edges of the save, the sweeps and the notification, 1280 px', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('a saved alert the history read cannot sort leaves every kept picture when a watch starts', async ({ page, context }) => {
    test.setTimeout(120_000);
    await seedDevice(context, { settings: MOTION_ONLY, pictures: { noticeAnswered: true } });
    await canvasCamera(page, LEFT_THIRD);
    await page.goto('/monitor/', { waitUntil: 'networkidle' });
    // Written after the page read its alerts: an alert of another tab, with a picture kept 20 minutes
    // ago, and a record of the alert engine whose date is a number, which the history read cannot sort.
    const at = Date.now() - 20 * 60_000;
    await seedPictureRows(page, [
      { alert: savedAlert('shared-odd-date', at, { producer: 'shared', monitoring: false, createdAt: at }) },
      { alert: savedAlert(`motion-${at}-other`, at, { kind: 'motion', pictureId: `picture-${at}-other` }), picture: keptPicture(`picture-${at}-other`, at) },
      // A picture of the same age whose alert names no picture: no alert holds it.
      { alert: savedAlert(`motion-${at}-unheld`, at, { kind: 'motion' }), picture: keptPicture(`picture-${at}-unheld`, at) },
    ], { here: true });
    await startWatching(page);
    // The sweep ran: the picture no alert holds is deleted.
    await expect.poll(async () => keptRows(await readDatabase(page)).map((row) => row.id), { timeout: 15_000 })
      .not.toContain(`picture-${at}-unheld`);
    const kept = keptRows(await readDatabase(page)).map((row) => row.id);
    expect(kept, 'the other tab’s alert keeps its picture').toContain(`picture-${at}-other`);
  });

  test('a saved file that cannot be drawn leaves the picture shown and Save picture to press again', async ({ page, context }) => {
    test.setTimeout(120_000);
    // The first saved file's JPEG (the picture with its box drawn in) cannot be made; the next can.
    await page.addInitScript(() => {
      const toBlob = HTMLCanvasElement.prototype.toBlob;
      let failed = false;
      HTMLCanvasElement.prototype.toBlob = function (this: HTMLCanvasElement, callback: BlobCallback, type?: string, quality?: number) {
        if (!failed && type === 'image/jpeg' && quality === 0.92) {
          failed = true;
          (window as unknown as { __savedFileRefused?: boolean }).__savedFileRefused = true;
          setTimeout(() => callback(null), 0);
          return;
        }
        return toBlob.call(this, callback, type, quality);
      } as typeof toBlob;
    });
    await watchWith(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD });
    const card = cards(page).first();
    const time = await timeOf(card, 'Motion');
    await holdStill(page);
    await openKey(card).click();
    const dialog = page.getByRole('dialog', { name: `Motion at ${time}`, exact: true });
    await expect(dialog.getByRole('img', { name: pictureName(time, true), exact: true })).toBeVisible();
    // The first press makes no file: its JPEG is refused, and nothing downloads.
    let downloads = 0;
    page.on('download', () => { downloads += 1; });
    await saveKey(dialog).click();
    await page.waitForTimeout(1_000);
    expect(await page.evaluate(() => (window as unknown as { __savedFileRefused?: boolean }).__savedFileRefused === true), 'the first file’s JPEG was refused').toBe(true);
    expect(downloads, 'the first press downloads nothing').toBe(0);
    // Nothing says the picture cannot be read: it shows, and Save picture stays.
    await expect(dialog.getByText(UNREADABLE_LINE, { exact: false })).toHaveCount(0);
    await expect(dialog.getByRole('img', { name: pictureName(time, true), exact: true })).toBeVisible();
    const [saved] = await Promise.all([page.waitForEvent('download'), saveKey(dialog).click()]);
    expect(saved.suggestedFilename()).toMatch(/^safeos-motion-\d{4}-\d{2}-\d{2}-\d{6}\.jpg$/);
  });

  test('a diffuse change over the line at a high sensitivity boxes the cells that changed', async ({ page, context }) => {
    test.setTimeout(120_000);
    // One pixel in 50, anywhere, flashes white each frame: about 4 per cent of the picture changes
    // between two checks, spread over every cell and under the detector's 10 per cent in each, and
    // Motion at 98 alerts over 2 per cent. The camera is 1280 by 720, so each cell reads 300 samples.
    // Eight such pictures are drawn once and shown in turn, so the large camera slows no other walk.
    const sparse = { ...LEFT_THIRD, width: 1280, height: 720, moving: { x: 0, y: 0, width: 1, height: 1 }, levels: [...Array(49).fill(128), 255], cycle: 8 };
    await watchWith(page, context, {
      settings: { ...MOTION_ONLY, globalSettings: { ...CUSTOM_PRESET, motionSensitivity: 98 } },
      camera: sparse,
    });
    const card = cards(page).first();
    await timeOf(card, 'Motion');
    await expect(card.locator('.alert-picture__frame .alert-picture__box'), 'the alert’s picture has its box').toHaveCount(1);
  });

  test('a repeat that changes the opened picture while its delete question is open closes the question', async ({ page, context }) => {
    test.setTimeout(150_000);
    await watchWith(page, context, { settings: { ...MOTION_ONLY, timingSettings: cooldownPeriod(10) }, camera: LEFT_THIRD });
    const card = cards(page).first();
    const time = await timeOf(card, 'Motion');
    await openKey(card).click();
    await expect(page.getByRole('dialog', { name: `Motion at ${time}`, exact: true })).toBeVisible();
    // The panel takes the newest alert's title with a repeat, so it is found by its own mark.
    const dialog = page.locator('[role="dialog"].alert-picture-dialog');
    const picture = dialog.getByRole('img', { name: /^What the camera saw at / });
    const first = await picture.getAttribute('src');
    await deleteKey(dialog).click();
    const question = page.getByRole('alertdialog', { name: DELETE_QUESTION, exact: true });
    await expect(question).toBeVisible();
    // The event goes on and repeats: the opened picture becomes the newest alert's.
    await expect.poll(() => picture.getAttribute('src'), { timeout: 60_000 }).not.toBe(first);
    // The question was asked of the picture that has gone from view: it closes, and nothing is deleted.
    await expect(question).toHaveCount(0);
    await expect(deleteKey(dialog)).toBeFocused();
    expect(keptRows(await readDatabase(page)).length).toBeGreaterThanOrEqual(1);
  });

  test('a box whose picture comes after Stop stands on no later watch', async ({ page, context }) => {
    test.setTimeout(120_000);
    // The alert's picture comes back 2 seconds after it is drawn: after Stop and the next Start.
    await faultPictureStore(page, { holdDrawMs: 2_000 });
    await watchWith(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD });
    await expect(cards(page).first()).toBeVisible({ timeout: 60_000 });
    await holdStill(page);
    await page.getByRole('button', { name: 'Stop watching', exact: true }).click();
    await startWatching(page);
    // The camera holds still, so the new watch raises no alert of its own and shows no box.
    await page.waitForTimeout(4_000);
    await expect(page.locator('.watch-frame__picture .alert-live__box'), 'the earlier watch’s box').toHaveCount(0);
  });

  test('the delete question fits a short screen at 200 per cent text', async ({ page, context }) => {
    test.setTimeout(120_000);
    await watchWith(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD });
    const card = cards(page).first();
    const time = await timeOf(card, 'Motion');
    await holdStill(page);
    await openKey(card).click();
    const dialog = page.getByRole('dialog', { name: `Motion at ${time}`, exact: true });
    await deleteKey(dialog).click();
    const question = page.getByRole('alertdialog', { name: DELETE_QUESTION, exact: true });
    await expect(question).toBeVisible();
    // The screen turns short (a phone on its side) and the text doubles with the question open.
    await page.setViewportSize({ width: 320, height: 260 });
    await doubleText(page);
    const box = (await question.boundingBox())!;
    expect(box.y, 'the question starts on the screen').toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, 'the question ends on the screen').toBeLessThanOrEqual(260);
    // Its keys are reached by scrolling inside it.
    const keep = question.getByRole('button', { name: 'Keep it', exact: true });
    await keep.scrollIntoViewIfNeeded();
    const where = (await keep.boundingBox())!;
    expect(where.y + where.height).toBeLessThanOrEqual(260);
    await keep.click();
    await expect(question).toHaveCount(0);
  });

  test('Stop pressed while the notification’s picture is drawn keeps the event’s own tag', async ({ page, context }) => {
    test.setTimeout(120_000);
    // The picture's JPEG comes back 250 ms after it is drawn; Stop watching is pressed 50 ms in.
    await faultPictureStore(page, { holdDrawMs: 250 });
    await page.addInitScript(() => {
      const toBlob = HTMLCanvasElement.prototype.toBlob;
      let pressed = false;
      HTMLCanvasElement.prototype.toBlob = function (this: HTMLCanvasElement, callback: BlobCallback, type?: string, quality?: number) {
        if (!pressed && type === 'image/jpeg') {
          pressed = true;
          setTimeout(() => {
            const stop = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === 'Stop watching');
            stop?.click();
          }, 50);
        }
        return toBlob.call(this, callback, type, quality);
      } as typeof toBlob;
    });
    await watchWithNotes(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD, pictures: { noticeAnswered: true, inNotifications: true } });
    await expect(page.locator('.watch-frame[data-phase="live"]')).toBeHidden({ timeout: 30_000 });
    await expect.poll(async () => (await notesOf(page)).length, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
    const [note] = await notesOf(page);
    expect(note.title).toBe('Motion alert');
    expect(note.tag, 'the notification keeps the tag of the event that raised it').toMatch(/^safeos-Motion alert-.+/);
  });

  test('a save that fails on a picture a repeat replaced leaves the newer picture shown with Save picture', async ({ page, context }) => {
    test.setTimeout(150_000);
    // While the page holds the flag, the next kept picture drawn for a file waits until the walk fails it.
    await page.addInitScript(() => {
      const draw = window.createImageBitmap.bind(window) as (...args: unknown[]) => Promise<ImageBitmap>;
      window.createImageBitmap = ((...args: unknown[]) => {
        if (window.__holdNextDraw && args[0] instanceof Blob) {
          window.__holdNextDraw = false;
          return new Promise<ImageBitmap>((_, reject) => {
            window.__failHeldDraw = () => reject(new DOMException('The source image could not be decoded.', 'InvalidStateError'));
          });
        }
        return draw(...args);
      }) as typeof window.createImageBitmap;
    });
    await watchWith(page, context, { settings: { ...MOTION_ONLY, timingSettings: cooldownPeriod(10) }, camera: LEFT_THIRD });
    const card = cards(page).first();
    const time = await timeOf(card, 'Motion');
    await openKey(card).click();
    await expect(page.getByRole('dialog', { name: `Motion at ${time}`, exact: true })).toBeVisible();
    // The panel takes the newest alert's title with a repeat, so it is found by its own mark.
    const dialog = page.locator('[role="dialog"].alert-picture-dialog');
    const picture = dialog.getByRole('img', { name: /^What the camera saw at / });
    const first = await picture.getAttribute('src');
    // Save picture draws the first picture with its box, and that drawing waits.
    await page.evaluate(() => { window.__holdNextDraw = true; });
    await saveKey(dialog).click();
    await expect.poll(() => page.evaluate(() => typeof window.__failHeldDraw), { timeout: 5_000 }).toBe('function');
    // The event goes on and repeats: the opened picture becomes the newest alert's.
    await expect.poll(() => picture.getAttribute('src'), { timeout: 60_000 }).not.toBe(first);
    // The first picture's drawing fails after the newer picture shows.
    await page.evaluate(() => { window.__failHeldDraw!(); });
    await page.waitForTimeout(1_000);
    // The failure belongs to the picture it was drawn for: the newer one shows, with Save picture.
    await expect(dialog.getByText(UNREADABLE_LINE, { exact: false })).toHaveCount(0);
    await expect(picture).toBeVisible();
    await expect(saveKey(dialog)).toBeVisible();
  });

  test('a failed delete’s line leaves with its picture when a repeat puts a newer one in the panel', async ({ page, context }) => {
    test.setTimeout(150_000);
    await faultPictureStore(page);
    await watchWith(page, context, { settings: { ...MOTION_ONLY, timingSettings: cooldownPeriod(10) }, camera: LEFT_THIRD });
    const card = cards(page).first();
    const time = await timeOf(card, 'Motion');
    await openKey(card).click();
    await expect(page.getByRole('dialog', { name: `Motion at ${time}`, exact: true })).toBeVisible();
    // The panel takes the newest alert's title with a repeat, so it is found by its own mark.
    const dialog = page.locator('[role="dialog"].alert-picture-dialog');
    const picture = dialog.getByRole('img', { name: /^What the camera saw at / });
    const first = await picture.getAttribute('src');
    // The delete of the shown picture fails, and the panel says so.
    await setFault(page, { deletes: 'error' });
    await deleteKey(dialog).click();
    await confirmDelete(page).click();
    const failed = dialog.getByText(PICTURE_DELETE_FAILED_LINE, { exact: true });
    await expect(failed).toBeVisible();
    await setFault(page, {});
    // The event goes on and repeats: the opened picture becomes the newest alert's.
    await expect.poll(() => picture.getAttribute('src'), { timeout: 60_000 }).not.toBe(first);
    // The failure was the earlier picture's: the newer one shows with no line saying it could not be deleted.
    await expect(failed).toHaveCount(0);
    await expect(picture).toBeVisible();
    await expect(deleteKey(dialog)).toBeVisible();
  });

  test('a delete whose answer comes after a repeat leaves the newer picture open', async ({ page, context }) => {
    test.setTimeout(150_000);
    await faultPictureStore(page);
    await watchWith(page, context, { settings: { ...MOTION_ONLY, timingSettings: cooldownPeriod(10) }, camera: LEFT_THIRD });
    const card = cards(page).first();
    const time = await timeOf(card, 'Motion');
    await openKey(card).click();
    await expect(page.getByRole('dialog', { name: `Motion at ${time}`, exact: true })).toBeVisible();
    // The panel takes the newest alert's title with a repeat, so it is found by its own mark.
    const dialog = page.locator('[role="dialog"].alert-picture-dialog');
    const picture = dialog.getByRole('img', { name: /^What the camera saw at / });
    const first = await picture.getAttribute('src');
    // The page hears that the shown picture was deleted 20 seconds after the browser wrote it.
    const HOLD_MS = 20_000;
    await setFault(page, { holdDeleteMs: HOLD_MS });
    await deleteKey(dialog).click();
    await confirmDelete(page).click();
    const asked = Date.now();
    await page.waitForTimeout(1_000);
    await setFault(page, {});
    // The event goes on and repeats: the opened picture becomes the newest alert's.
    await expect.poll(() => picture.getAttribute('src'), { timeout: 60_000 }).not.toBe(first);
    expect(Date.now() - asked, 'the repeat came while the delete was answered late').toBeLessThan(HOLD_MS);
    // The answer comes for the earlier picture: the newer one stays open.
    await page.waitForTimeout(Math.max(0, HOLD_MS - (Date.now() - asked)) + 3_000);
    await expect(dialog).toBeVisible();
    await expect(picture).toBeVisible();
    expect(await picture.getAttribute('src')).not.toBe(first);
  });

  test('a tab that reads an alert before its picture is saved shows the picture once it is', async ({ page, context }) => {
    test.setTimeout(180_000);
    await seedDevice(context, { settings: MOTION_ONLY, pictures: { noticeAnswered: true } });
    await canvasCamera(page, LEFT_THIRD);
    await faultPictureStore(page);
    // Another tab holds History open from before the watch: it reads each alert as the watch saves
    // it, and its opening found none to mark as seen.
    const other = await context.newPage();
    await other.goto('/history/', { waitUntil: 'networkidle' });
    await page.goto('/monitor/', { waitUntil: 'networkidle' });
    await startWatching(page);
    await timeOf(cards(page).first(), 'Motion');
    await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBe(1);
    // The next alert's picture is handed back 30 seconds after it is drawn: its save waits.
    await setFault(page, { holdDrawMs: 30_000 });
    await raiseEvents(page, 2, 2);
    const held = cards(page).first();
    await expect(held.locator('.alert-picture__wait')).toBeVisible();
    // The picture holds still: the event ends with no repeat, so the card keeps this alert's time.
    await page.evaluate(() => { window.__camera!.moving.width = 0; });
    const time = await timeOf(held, 'Motion');
    // The other tab lists the alert once it is saved, while its picture waits.
    await expect.poll(() => savedAlertCount(page), { timeout: 12_000 }).toBe(2);
    const row = historyRows(other).filter({ hasText: time }).filter({ hasText: 'Motion' });
    await expect(row).toHaveCount(1, { timeout: 15_000 });
    await expect(held.locator('.alert-picture__wait'), 'the save waits while the other tab reads').toBeVisible();
    // The save goes on: the other tab's row shows the picture with no reload.
    await expect(row.getByRole('img', { name: closeUpName(time), exact: true })).toBeVisible({ timeout: 60_000 });
    await other.close();
  });

  test('an age chosen in another tab is the one this tab sweeps by when it hears of it', async ({ page, context }) => {
    test.setTimeout(120_000);
    // This tab reads a choice another tab saved 3 seconds after the browser says it changed.
    await lateStorageEvents(page, 3_000);
    await seedDevice(context, { pictures: { noticeAnswered: true, deleteAfterDays: 1 } });
    await page.goto('/settings/detection/', { waitUntil: 'networkidle' });
    await expect(countLine(group(page))).toBeVisible();
    // A picture kept two days ago, written after this tab read the store.
    const at = Date.now() - 2 * DAY;
    const id = `picture-${at}-kept`;
    await seedPictureRows(page, [{ alert: savedAlert(`motion-${at}-kept`, at, { kind: 'motion', pictureId: id }), picture: keptPicture(id, at) }], { here: true });
    const other = await context.newPage();
    await other.goto('/settings/detection/', { waitUntil: 'networkidle' });
    await afterSelect(group(other)).selectOption({ label: 'Until I delete them' });
    await page.waitForTimeout(6_000);
    expect(keptRows(await readDatabase(page)).map((row) => row.id), 'the other tab chose Until I delete them').toEqual([id]);
    await other.close();
  });

  test('keeping turned off in another tab keeps no picture here, before this tab reads the choice', async ({ page, context }) => {
    test.setTimeout(150_000);
    // This tab reads a choice another tab saved 30 seconds after the browser says it changed.
    await lateStorageEvents(page, 30_000);
    await watchWith(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD });
    await timeOf(cards(page).first(), 'Motion');
    await holdStill(page);
    await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBe(1);
    const other = await context.newPage();
    await other.goto('/settings/detection/', { waitUntil: 'networkidle' });
    await keepSwitch(group(other)).click();
    await expect(keepSwitch(group(other))).toHaveAttribute('aria-checked', 'false');
    // The next alert comes well before this tab reads the choice from the browser. The picture holds
    // still long enough to end the first event first, however quickly the other tab opened, so the
    // next alert is a new event's, on a card of its own.
    await raiseEvents(page, 2, 2);
    await expect(cards(page).first().getByText(NOT_KEPT_LINE, { exact: true })).toBeVisible();
    await page.waitForTimeout(3_000);
    expect(await keptCount(page), 'the new alert’s picture is not kept').toBe(1);
    await other.close();
  });

  test('a choice another tab made before this tab turned keeping off keeps nothing when it is heard late', async ({ page, context }) => {
    test.setTimeout(150_000);
    // This tab hears the other tabs' news 8 seconds late, and their saved choices a minute late.
    const NEWS_MS = 8_000;
    await lateChannelNews(page, NEWS_MS);
    await lateStorageEvents(page, 60_000);
    await watchWith(page, context, { settings: MOTION_ONLY, camera: LEFT_THIRD });
    await timeOf(cards(page).first(), 'Motion');
    await holdStill(page);
    await expect.poll(() => keptCount(page), { timeout: 15_000 }).toBe(1);
    // The other tab turns keeping off and on again.
    const other = await context.newPage();
    await other.goto('/settings/detection/', { waitUntil: 'networkidle' });
    await keepSwitch(group(other)).click();
    await expect(keepSwitch(group(other))).toHaveAttribute('aria-checked', 'false');
    // Its news of keeping on goes out with the press, so this tab hears it no sooner than NEWS_MS after `sent`.
    const sent = Date.now();
    await keepSwitch(group(other)).click();
    await expect(keepSwitch(group(other))).toHaveAttribute('aria-checked', 'true');
    // Then, before this tab hears of it, the person turns keeping off here.
    const found = await openWatchGroup(page);
    await keepSwitch(found).click();
    await expect(keepSwitch(found)).toHaveAttribute('aria-checked', 'false');
    expect(Date.now() - sent, 'this tab chose before it heard the other tab').toBeLessThan(NEWS_MS);
    // The other tab's news comes after this tab's own choice. It is older, and keeps nothing.
    await page.waitForTimeout(Math.max(0, NEWS_MS - (Date.now() - sent)) + 2_000);
    await page.evaluate(() => { window.__camera!.moving.width = 1 / 3; });
    await expect(cards(page)).toHaveCount(2, { timeout: 20_000 });
    await expect(cards(page).first().getByText(NOT_KEPT_LINE, { exact: true })).toBeVisible();
    await page.waitForTimeout(3_000);
    expect(await keptCount(page), 'the new alert’s picture is not kept').toBe(1);
    await other.close();
  });

  test('an age another tab chose before a later choice deletes nothing when this tab hears of it late', async ({ page, context }) => {
    test.setTimeout(120_000);
    // This tab hears the other tabs' news 30 seconds late; it reads their saved choices at once.
    const NEWS_MS = 30_000;
    await lateChannelNews(page, NEWS_MS);
    await seedDevice(context, { pictures: { noticeAnswered: true, deleteAfterDays: 3 } });
    await page.goto('/settings/detection/', { waitUntil: 'networkidle' });
    await expect(countLine(group(page))).toBeVisible();
    // A picture that turns one day old 20 seconds from now.
    const at = Date.now() - DAY + 20_000;
    const id = `picture-${at}-kept`;
    await seedPictureRows(page, [{ alert: savedAlert(`motion-${at}-kept`, at, { kind: 'motion', pictureId: id }), picture: keptPicture(id, at) }], { here: true });
    // One tab chooses 1 day, while the picture is younger; another then chooses Until I delete them.
    const first = await context.newPage();
    await first.goto('/settings/detection/', { waitUntil: 'networkidle' });
    await afterSelect(group(first)).selectOption({ label: '1 day' });
    const chose = Date.now();
    const second = await context.newPage();
    await second.goto('/settings/detection/', { waitUntil: 'networkidle' });
    await afterSelect(group(second)).selectOption({ label: 'Until I delete them' });
    await expect(afterSelect(group(page)).locator('option:checked')).toHaveText('Until I delete them');
    expect(chose - at, 'the picture was younger than a day when 1 day was chosen').toBeLessThan(DAY);
    // The first tab's news reaches this tab once the picture is past a day. It is older than the
    // choice this tab holds, and deletes nothing.
    await page.waitForTimeout(Math.max(0, NEWS_MS - (Date.now() - chose)) + 4_000);
    expect(Date.now() - at, 'the picture is past a day').toBeGreaterThan(DAY);
    expect(keptRows(await readDatabase(page)).map((row) => row.id), 'the newer choice is Until I delete them').toEqual([id]);
    await first.close();
    await second.close();
  });
});
