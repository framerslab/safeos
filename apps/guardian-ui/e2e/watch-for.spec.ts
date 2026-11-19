/**
 * Watch for: Motion and sound, or Lost and Found, walked in Chromium
 *
 * The watch at /monitor/ opens with the heading "Watch for" and its two
 * options above the camera and the settings. With Lost and Found chosen it
 * shows the pet whose photos it compares with what the camera sees: the first
 * saved photo, the name, the count of photos and Change pet; with no pet
 * saved, "No pet saved" and Add a pet. The choice is setup's own, so setup and
 * the watch show the same one, and a reload keeps the choice and the pet.
 *
 * Pets are added through the Lost & Found page as a person adds one, or saved
 * straight into this browser's database where a walk needs several. The
 * camera and microphone are Chromium's fake ones.
 *
 * @module e2e/watch-for.spec
 */

import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

test.use({
  viewport: { width: 390, height: 844 },
  launchOptions: {
    // The headless browser has no prompt to answer a camera request; the fake prompt grants it.
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
});

test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'The fake camera is a Chromium switch; the walk sets its own widths'
);

// =============================================================================
// The device
// =============================================================================

interface Device {
  /** The use setup saved. */
  scenario?: 'pet' | 'baby';
  /** Setup's Lost & Found choice. */
  lostFoundChosen?: boolean;
}

/**
 * A device that has finished setup, with the camera and microphone allowed.
 * Saved once: a reload keeps what the page itself saved since.
 */
async function setUpDevice(context: BrowserContext, device: Device = {}) {
  await context.grantPermissions(['camera', 'microphone']);
  await context.addInitScript(({ scenario, lostFoundChosen }) => {
    if (localStorage.getItem('safeos-onboarding') !== null) return;
    localStorage.setItem('safeos-onboarding', JSON.stringify({ state: {
      isComplete: true, selectedScenario: scenario, lostFoundChosen,
      acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
    }, version: 0 }));
    localStorage.setItem('guardian-onboarding-complete', 'true');
    localStorage.setItem('safeos-notification-prompt-dismissed', String(Date.now()));
    localStorage.setItem('safeos-pwa-prompt-dismissed', String(Date.now()));
  }, { scenario: device.scenario ?? 'pet', lostFoundChosen: device.lostFoundChosen ?? false });
}

/** Setup's Lost & Found choice as this browser keeps it. */
const storedLostFound = (page: Page): Promise<boolean | undefined> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('safeos-onboarding') || '{}')?.state?.lostFoundChosen);

interface Pet {
  id: string;
  name: string;
  photos: number;
  /** An earlier version saved people too. */
  type?: 'pet' | 'person';
  createdAt: string;
}

/**
 * Saves pets into this browser's database, as the Lost & Found page saves
 * them, each photo a plain square of its own colour. The page must have
 * opened the database first; the walk reloads the page after.
 */
async function savePets(page: Page, pets: Pet[]) {
  await expect.poll(() => page.evaluate(async () => {
    const known = await indexedDB.databases();
    if (!known.some((database) => database.name === 'safeos-guardian')) return false;
    return new Promise<boolean>((resolve) => {
      const opening = indexedDB.open('safeos-guardian');
      opening.onerror = () => resolve(false);
      opening.onsuccess = () => {
        const ready = opening.result.objectStoreNames.contains('subject_profile');
        opening.result.close();
        resolve(ready);
      };
    });
  }), { timeout: 30_000 }).toBe(true);

  await page.evaluate(async (list) => {
    const photo = (hue: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 96;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2D canvas');
      ctx.fillStyle = `hsl(${hue}, 60%, 50%)`;
      ctx.fillRect(0, 0, 96, 96);
      return canvas.toDataURL('image/png');
    };
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('safeos-guardian');
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    const saving = database.transaction('subject_profile', 'readwrite');
    list.forEach((pet, index) => {
      const referenceImages = Array.from({ length: pet.photos }, (_, i) => photo((index * 47 + i * 19) % 360));
      saving.objectStore('subject_profile').put({
        id: pet.id,
        name: pet.name,
        type: pet.type ?? 'pet',
        description: '',
        // A fingerprint of the first form, which the watch rebuilds from the photos.
        fingerprint: {
          id: `${pet.id}-fingerprint`, name: pet.name, colorHistogram: [], dominantColors: [],
          averageColor: { r: 128, g: 128, b: 128 }, colorVariance: 0, estimatedSizeRatio: 0.2,
          edgeSignature: [], referenceImages: [], createdAt: pet.createdAt,
        },
        referenceImages,
        createdAt: pet.createdAt,
        lastActiveAt: null,
        matchCount: 0,
      });
    });
    await new Promise((resolve, reject) => {
      saving.oncomplete = resolve;
      saving.onerror = () => reject(saving.error);
    });
    database.close();
  }, pets);
}

const MISO: Pet = { id: 'pet-miso', name: 'Miso', photos: 3, createdAt: '2026-11-02T10:00:00.000Z' };
const TOFU: Pet = { id: 'pet-tofu', name: 'Tofu', photos: 1, createdAt: '2026-11-01T10:00:00.000Z' };

/** Opens the watch on a device holding these pets. */
async function openWatchWithPets(page: Page, pets: Pet[]) {
  await page.goto('/monitor/', { waitUntil: 'networkidle', timeout: 60_000 });
  await savePets(page, pets);
  await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
}

// =============================================================================
// What the walk reads
// =============================================================================

const watchFor = (page: Page) => page.getByRole('radiogroup', { name: 'Watch for' });
const motionAndSound = (page: Page) => watchFor(page).getByRole('radio', { name: 'Motion and sound' });
const lostAndFound = (page: Page) => watchFor(page).getByRole('radio', { name: 'Lost and Found' });
const changePet = (page: Page) => page.getByRole('button', { name: 'Change pet', exact: true });
const choosePet = (page: Page) => page.getByRole('dialog', { name: 'Choose a pet' });
const shown = (locator: Locator) => locator.filter({ visible: true });
/** A sentence the page reads once from a polite status. */
const announced = (page: Page, words: RegExp) => page.getByRole('status').filter({ hasText: words });

const MOTION_LINE = 'Sounds an alert on this device when something moves or makes a sound.';
const LIMITS_LINE = 'It can alert on an animal that looks alike. It works best in daylight, with a pet whose colours stand out.';
const comparesLine = (name: string) =>
  `Compares what the camera sees with ${name}’s photos, by colour and shape. Motion and sound alerts go on too.`;

/** The box of a locator that is on the page. */
async function box(locator: Locator) {
  const found = await locator.boundingBox();
  if (!found) throw new Error(`${locator} has no box`);
  return found;
}

/** No sideways scroll on the page. */
const scrollsSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

/** Each option's words fit inside it, and both options share one row. */
async function optionsOnOneRow(page: Page) {
  return page.evaluate(() => {
    const group = document.querySelector('[role="radiogroup"][aria-labelledby]');
    const options = group ? [...group.querySelectorAll('label')] : [];
    const boxes = options.map((option) => option.getBoundingClientRect());
    return {
      count: options.length,
      oneRow: boxes.length === 2 && Math.abs(boxes[0].top - boxes[1].top) < 1 && boxes[0].right <= boxes[1].left + 1,
      cut: options.some((option) => option.scrollWidth > option.clientWidth + 1 || option.scrollHeight > option.clientHeight + 1),
      sizes: options.map((option) => parseFloat(getComputedStyle(option).fontSize)),
      widths: boxes.map((b) => Math.round(b.width)),
    };
  });
}

// =============================================================================
// The walk
// =============================================================================

test('a fresh device watches for Motion and sound, with Lost and Found beside it, above the camera and the settings', async ({ page, context }) => {
  await setUpDevice(context);
  await page.goto('/monitor/', { waitUntil: 'networkidle', timeout: 60_000 });

  await expect(page.getByRole('heading', { level: 1, name: 'Watch for' })).toBeVisible();
  await expect(motionAndSound(page)).toBeChecked();
  await expect(lostAndFound(page)).not.toBeChecked();
  await expect(page.getByText(MOTION_LINE, { exact: true })).toBeVisible();
  await expect(page).toHaveTitle('Motion and sound | SafeOS');

  // Above the camera and the watch's settings.
  const chooser = await box(watchFor(page));
  expect(chooser.y + chooser.height).toBeLessThanOrEqual((await box(page.getByRole('heading', { name: 'Camera Feed' }))).y);
  expect(chooser.y + chooser.height).toBeLessThanOrEqual((await box(page.getByRole('heading', { name: 'Mode Selection' }))).y);
  // Lost and Found is chosen here, not from a key of its own in the bar.
  await expect(page.getByRole('button', { name: 'Lost & Found Mode' })).toHaveCount(0);
});

test('Lost and Found with no pet saved says No pet saved, and Add a pet opens the Lost & Found page', async ({ page, context }) => {
  await setUpDevice(context);
  await page.goto('/monitor/', { waitUntil: 'networkidle', timeout: 60_000 });

  await lostAndFound(page).check();
  await expect(lostAndFound(page)).toBeChecked();
  await expect(page.getByText('No pet saved', { exact: true })).toBeVisible();
  await expect(page.getByText('Save a few photos of your pet to compare with what the camera sees.', { exact: true })).toBeVisible();
  await expect(page.getByText('Without a saved pet, it watches for motion and sound.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Monitoring', exact: true })).toBeVisible();
  await expect(page).toHaveTitle('Lost and Found | SafeOS');
  expect(await storedLostFound(page)).toBe(true);

  await page.getByRole('link', { name: 'Add a pet', exact: true }).click();
  await expect(page).toHaveURL(/\/lost-found\/?$/);
});

test('a pet added on the Lost & Found page is the watch’s pet, compared while the watch runs, and a reload keeps it', async ({ page, context }) => {
  test.setTimeout(240_000);
  await setUpDevice(context);
  await page.goto('/monitor/', { waitUntil: 'networkidle', timeout: 60_000 });
  await lostAndFound(page).check();
  await page.getByRole('link', { name: 'Add a pet', exact: true }).click();
  await expect(page).toHaveURL(/\/lost-found\/?$/);

  // Miso, from three photos, as a person adds a pet.
  await page.getByText('Add New Subject to Watch').click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByPlaceholder('e.g., Max, Luna, Dad').fill('Miso');
  const photos = await page.evaluate(() => [24, 30, 36].map((hue) => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2D canvas');
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(0, 0, 160, 120);
    ctx.fillStyle = `hsl(${hue}, 70%, 45%)`;
    ctx.fillRect(40, 30, 80, 60);
    return canvas.toDataURL('image/png').split(',')[1];
  }));
  await page.locator('input[type="file"]').setInputFiles(photos.map((data, i) => ({
    name: `miso-${i + 1}.png`, mimeType: 'image/png', buffer: Buffer.from(data, 'base64'),
  })));
  const next = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(next).toBeEnabled();
  await next.click();
  await page.getByRole('button', { name: 'Start Watching', exact: true }).click();
  // The Lost & Found page's own start key opens the watch with Miso.
  await page.getByRole('button', { name: 'Start Monitoring' }).click({ timeout: 60_000 });
  await page.waitForURL(/\/monitor\/?$/, { timeout: 60_000 });

  await expect(lostAndFound(page)).toBeChecked();
  await expect(shown(page.getByRole('img', { name: 'Miso’s first saved photo' }))).toBeVisible();
  await expect(shown(page.getByText('Miso', { exact: true }))).toBeVisible();
  await expect(shown(page.getByText('3 photos', { exact: true }))).toBeVisible();
  await expect(changePet(page)).toBeVisible();
  await expect(page.getByText(comparesLine('Miso'), { exact: true })).toBeVisible();
  await expect(page.getByText(LIMITS_LINE, { exact: true })).toBeVisible();
  await expect(page).toHaveTitle('Lost and Found | SafeOS');

  // Start Monitoring starts the comparison with Miso's photos.
  await page.getByRole('button', { name: 'Start Monitoring', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop Monitoring', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(announced(page, /^Comparing with Miso’s photos from .+\.$/)).toHaveCount(1);
  await expect(page.getByText('Watching...', { exact: true })).toBeVisible();

  // Motion and sound stops the comparison, with no restart of the camera.
  await expect.poll(() => page.evaluate(() => Boolean(document.querySelector('video')?.srcObject)), { timeout: 30_000 }).toBe(true);
  await page.evaluate(() => { (window as unknown as { watchedStream: unknown }).watchedStream = document.querySelector('video')?.srcObject; });
  await motionAndSound(page).check();
  await expect(announced(page, /^Stopped comparing at .+\.$/)).toHaveCount(1);
  await expect(page.getByText('Watching...', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stop Monitoring', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.querySelector('video')?.srcObject === (window as unknown as { watchedStream: unknown }).watchedStream)).toBe(true);
  expect(await storedLostFound(page)).toBe(false);

  // Lost and Found again compares again.
  await lostAndFound(page).check();
  await expect(announced(page, /^Comparing with Miso’s photos from .+\.$/)).toHaveCount(1);
  await expect(page.getByText('Watching...', { exact: true })).toBeVisible();

  // The words while it compares: none of a match, a recognition or a score.
  const words = [
    await page.getByRole('region', { name: 'Watch for' }).innerText(),
  ].join(' ');
  expect(words).not.toMatch(/recogni[sz]e|identif|match|found your pet|confidence|%/i);

  // A reload keeps Lost and Found and Miso.
  await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
  await expect(lostAndFound(page)).toBeChecked();
  await expect(shown(page.getByRole('img', { name: 'Miso’s first saved photo' }))).toBeVisible();
  await expect(shown(page.getByText('3 photos', { exact: true }))).toBeVisible();
});

test('the Lost & Found page’s start key opens the watch with Lost and Found and the pet it shows', async ({ page, context }) => {
  await setUpDevice(context);
  await openWatchWithPets(page, [MISO, TOFU]);
  await expect(motionAndSound(page)).toBeChecked();

  await page.goto('/lost-found/', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('heading', { name: 'Tofu', exact: true }).click();
  await page.getByRole('button', { name: 'Start Monitoring' }).click();
  await page.waitForURL(/\/monitor\/?$/, { timeout: 60_000 });

  await expect(lostAndFound(page)).toBeChecked();
  await expect(shown(page.getByRole('img', { name: 'Tofu’s first saved photo' }))).toBeVisible();
  await expect(shown(page.getByText('1 photo', { exact: true }))).toBeVisible();
});

test('setup’s Lost & Found opens the watch on Lost and Found, and Motion and sound chosen on the watch is what setup run again shows', async ({ page, context }) => {
  await setUpDevice(context, { scenario: 'pet', lostFoundChosen: true });
  await page.goto('/monitor/', { waitUntil: 'networkidle', timeout: 60_000 });
  await expect(lostAndFound(page)).toBeChecked();

  await motionAndSound(page).check();
  expect(await storedLostFound(page)).toBe(false);

  await page.goto('/setup/?again=1', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('button', { name: /Begin Setup/ }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /Accept & Continue/ }).click();
  await expect(page.getByRole('button', { name: /Lost & Found/ })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: /Pet Monitoring/ })).toHaveAttribute('aria-pressed', 'true');
});

test('Lost and Found chosen on the watch of a baby device is what setup run again shows', async ({ page, context }) => {
  await setUpDevice(context, { scenario: 'baby' });
  await page.goto('/monitor/', { waitUntil: 'networkidle', timeout: 60_000 });
  await lostAndFound(page).check();

  await page.goto('/setup/?again=1', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('button', { name: /Begin Setup/ }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /Accept & Continue/ }).click();
  await expect(page.getByRole('button', { name: /Lost & Found/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /Baby Monitoring/ })).toHaveAttribute('aria-pressed', 'false');
});

test('Change pet opens Choose a pet; choosing the other pet names it, and Escape and Close keep the pet', async ({ page, context }) => {
  await setUpDevice(context, { lostFoundChosen: true });
  await openWatchWithPets(page, [MISO, TOFU]);

  // The newest saved pet is the watch's pet until another is chosen.
  await expect(shown(page.getByText('3 photos', { exact: true }))).toBeVisible();
  await changePet(page).click();
  const dialog = choosePet(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Miso', exact: true })).toBeChecked();
  await expect(dialog.getByRole('radio', { name: 'Tofu', exact: true })).not.toBeChecked();
  await expect(dialog.getByRole('img', { name: 'Miso, saved photo 1 of 3' })).toBeVisible();
  await expect(dialog.getByRole('img', { name: 'Tofu, saved photo 1 of 1' })).toBeVisible();
  await expect(dialog.getByText('3 photos', { exact: true })).toBeVisible();
  await expect(dialog.getByText('1 photo', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Add a pet', exact: true })).toBeVisible();
  // Focus is held in the dialog.
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }

  await dialog.getByText('Tofu', { exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(shown(page.getByText('1 photo', { exact: true }))).toBeVisible();
  await expect(page.getByText(comparesLine('Tofu'), { exact: true })).toBeVisible();
  await expect(changePet(page)).toBeFocused();

  // At 1280, Escape and Close leave the pet as it was and return to Change pet.
  await page.setViewportSize({ width: 1280, height: 900 });
  await changePet(page).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(changePet(page)).toBeFocused();
  await changePet(page).click();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(changePet(page)).toBeFocused();
  await expect(shown(page.getByText('1 photo', { exact: true }))).toBeVisible();

  // A reload keeps Tofu.
  await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
  await expect(shown(page.getByRole('img', { name: 'Tofu’s first saved photo' }))).toBeVisible();
});

test('twelve saved pets scroll inside Choose a pet with Add a pet at its foot, and a person saved by an earlier version is not listed', async ({ page, context }) => {
  await setUpDevice(context, { lostFoundChosen: true });
  const pets: Pet[] = Array.from({ length: 12 }, (_, i) => ({
    id: `pet-${i + 1}`, name: `Pet ${i + 1}`, photos: 1, createdAt: `2026-10-${String(10 + i).padStart(2, '0')}T10:00:00.000Z`,
  }));
  await openWatchWithPets(page, [...pets, { id: 'person-1', name: 'Sam', photos: 1, type: 'person', createdAt: '2026-11-03T10:00:00.000Z' }]);

  // Sam is newest, but a person is never the watch's pet.
  await expect(shown(page.getByText('Pet 12', { exact: true }))).toBeVisible();
  await changePet(page).click();
  const dialog = choosePet(page);
  await expect(dialog.getByRole('radio')).toHaveCount(12);
  await expect(dialog.getByRole('radio', { name: 'Sam' })).toHaveCount(0);
  const list = dialog.getByRole('radiogroup');
  expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  const addPet = dialog.getByRole('link', { name: 'Add a pet', exact: true });
  await expect(addPet).toBeInViewport();
  const dialogBox = await box(dialog);
  const addBox = await box(addPet);
  expect(addBox.y + addBox.height).toBeLessThanOrEqual(dialogBox.y + dialogBox.height + 1);
});

/** The pet this browser keeps as the watch's. */
const storedPetId = (page: Page): Promise<string | null | undefined> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('safeos-lost-found') || '{}')?.state?.chosenPetId);

test('the arrow keys move the choice in Choose a pet; Escape and Close keep the watch\u2019s pet, and Enter chooses', async ({ page, context }) => {
  await setUpDevice(context, { lostFoundChosen: true });
  await openWatchWithPets(page, [MISO, TOFU]);
  await expect(shown(page.getByText('3 photos', { exact: true }))).toBeVisible();
  const dialog = choosePet(page);

  for (const leave of ['Escape', 'Close'] as const) {
    await changePet(page).click();
    await expect(dialog.getByRole('radio', { name: 'Miso', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(dialog.getByRole('radio', { name: 'Tofu', exact: true })).toBeChecked();
    await expect(dialog).toBeVisible();
    if (leave === 'Escape') await page.keyboard.press('Escape');
    else await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(shown(page.getByText('3 photos', { exact: true })), `after ${leave}`).toBeVisible();
    expect(await storedPetId(page), `after ${leave}`).toBe(MISO.id);
  }

  await changePet(page).click();
  await expect(dialog.getByRole('radio', { name: 'Miso', exact: true })).toBeChecked();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(shown(page.getByText('1 photo', { exact: true }))).toBeVisible();
  expect(await storedPetId(page)).toBe(TOFU.id);
});

test('Choose a pet stands above the page\u2019s navigation, so its links take no press while it is open', async ({ page, context }) => {
  await setUpDevice(context, { lostFoundChosen: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await openWatchWithPets(page, [MISO, TOFU]);
  await changePet(page).click();
  await expect(choosePet(page)).toBeVisible();

  const link = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Dashboard' });
  const covered = await link.evaluate((element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    const hit = document.elementFromPoint(x + width / 2, y + height / 2);
    return hit !== null && !element.contains(hit);
  });
  expect(covered).toBe(true);
});

test('a thing saved after the pet is never the watch\u2019s pet until it is chosen', async ({ page, context }) => {
  await setUpDevice(context, { lostFoundChosen: true });
  // Keys, saved on the Lost & Found page as an object, is newer than Miso.
  await openWatchWithPets(page, [MISO, { id: 'thing-keys', name: 'Keys', photos: 2, type: 'other', createdAt: '2026-11-03T10:00:00.000Z' }]);

  await expect(shown(page.getByRole('img', { name: 'Miso\u2019s first saved photo' }))).toBeVisible();
  await expect(shown(page.getByText('3 photos', { exact: true }))).toBeVisible();
});

test('the Lost & Found page offers no Start Monitoring for a person an earlier version saved', async ({ page, context }) => {
  await setUpDevice(context, { lostFoundChosen: true });
  await openWatchWithPets(page, [MISO, { id: 'person-sam', name: 'Sam', photos: 1, type: 'person', createdAt: '2026-11-03T10:00:00.000Z' }]);

  await page.goto('/lost-found/', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('heading', { name: 'Sam', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Currently Watching' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Monitoring' })).toHaveCount(0);

  await page.getByRole('heading', { name: 'Miso', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start Monitoring' })).toBeVisible();
});

test('saved pets that cannot be read say so, with Motion and sound chosen', async ({ page, context }) => {
  await setUpDevice(context, { lostFoundChosen: true });
  await page.goto('/monitor/', { waitUntil: 'networkidle', timeout: 60_000 });
  await savePets(page, [MISO]);
  await page.addInitScript(() => {
    const readAll = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function (...args: Parameters<IDBObjectStore['getAll']>) {
      if (this.name === 'subject_profile') throw new DOMException('The saved pets cannot be read', 'UnknownError');
      return readAll.apply(this, args);
    };
  });
  await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });

  await expect(page.getByText('Saved pets could not be read on this device. Reload the page to try again.', { exact: true })).toBeVisible();
  await expect(motionAndSound(page)).toBeChecked();
  await expect(page).toHaveTitle('Motion and sound | SafeOS');

  // Pressing Motion and sound keeps it, for the watch and for setup.
  await motionAndSound(page).click();
  await expect.poll(() => storedLostFound(page)).toBe(false);
  await expect(page.getByText('Saved pets could not be read on this device. Reload the page to try again.', { exact: true })).toHaveCount(0);
});

test('while the saved pets are read the pet row says Loading saved pets…, then shows the pet', async ({ page, context }) => {
  await setUpDevice(context, { lostFoundChosen: true });
  await page.goto('/monitor/', { waitUntil: 'networkidle', timeout: 60_000 });
  await savePets(page, [MISO]);
  // The read of the saved pets answers 3 seconds late.
  await page.addInitScript(() => {
    const readAll = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function (...args: Parameters<IDBObjectStore['getAll']>) {
      const request = readAll.apply(this, args);
      if (this.name !== 'subject_profile') return request;
      let held = true;
      request.addEventListener('success', (event) => {
        if (!held) return;
        event.stopImmediatePropagation();
        window.setTimeout(() => {
          held = false;
          request.dispatchEvent(new Event('success'));
        }, 3000);
      });
      return request;
    };
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });

  await expect(page.getByText('Loading saved pets…', { exact: true })).toBeVisible();
  await expect(shown(page.getByText('3 photos', { exact: true }))).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Loading saved pets…', { exact: true })).toHaveCount(0);
});

test('offline, Lost and Found shows the pet and compares while the watch runs', async ({ page, context }) => {
  test.setTimeout(120_000);
  await setUpDevice(context);
  await openWatchWithPets(page, [MISO]);
  await context.setOffline(true);

  await lostAndFound(page).check();
  await expect(shown(page.getByRole('img', { name: 'Miso’s first saved photo' }))).toBeVisible();
  await page.getByRole('button', { name: 'Start Monitoring', exact: true }).click();
  await expect(announced(page, /^Comparing with Miso’s photos from .+\.$/)).toHaveCount(1);
  await expect(page.getByText('Watching...', { exact: true })).toBeVisible();
});

test('the arrow keys move between Motion and sound and Lost and Found and choose, with the ring round the group', async ({ page, context }) => {
  await setUpDevice(context);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/monitor/', { waitUntil: 'networkidle', timeout: 60_000 });

  await motionAndSound(page).focus();
  await page.keyboard.press('ArrowRight');
  await expect(lostAndFound(page)).toBeFocused();
  await expect(lostAndFound(page)).toBeChecked();
  await page.keyboard.press('ArrowLeft');
  await expect(motionAndSound(page)).toBeFocused();
  await expect(motionAndSound(page)).toBeChecked();
  const ring = await watchFor(page).evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(ring.style).not.toBe('none');
  expect(ring.width).toBeGreaterThanOrEqual(2);
});

test('Watch for and the pet row stay on one row from 320 to 768 px, their words whole, with no sideways scroll', async ({ page, context }) => {
  test.setTimeout(120_000);
  await setUpDevice(context, { lostFoundChosen: true });
  await openWatchWithPets(page, [MISO]);

  for (const width of [320, 360, 390, 430, 480, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(shown(page.getByText('3 photos', { exact: true }))).toBeVisible();
    const options = await optionsOnOneRow(page);
    expect(options.count, `${width} px`).toBe(2);
    expect(options.oneRow, `${width} px: ${options.widths.join(' and ')} px`).toBe(true);
    expect(options.cut, `${width} px`).toBe(false);
    for (const size of options.sizes) expect(size, `${width} px`).toBe(width < 360 ? 15 : 16);
    for (const option of await watchFor(page).locator('label').all()) {
      const { height, width: optionWidth } = await box(option);
      expect(height, `${width} px`).toBeGreaterThanOrEqual(48);
      expect(optionWidth, `${width} px`).toBeGreaterThanOrEqual(140);
    }
    expect(await scrollsSideways(page), `${width} px`).toBe(false);

    // The pet row: the photo, the name and Change pet on one row.
    const photo = await box(shown(page.getByRole('img', { name: 'Miso’s first saved photo' })));
    const name = await box(shown(page.getByText('Miso', { exact: true })));
    const change = await box(changePet(page));
    expect(name.y, `${width} px`).toBeLessThan(photo.y + photo.height);
    expect(change.y, `${width} px`).toBeLessThan(photo.y + photo.height);
    expect(change.x + change.width, `${width} px`).toBeLessThanOrEqual(width);
    expect(change.height, `${width} px`).toBeGreaterThanOrEqual(44);
  }
});

test('at 200 per cent text the options’ words wrap inside them on one row, nothing cut', async ({ page, context }) => {
  await setUpDevice(context, { lostFoundChosen: true });
  await openWatchWithPets(page, [MISO]);
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });

  const options = await optionsOnOneRow(page);
  expect(options.oneRow, options.widths.join(' and ')).toBe(true);
  expect(options.cut).toBe(false);
  const chooser = await box(watchFor(page));
  expect(chooser.x).toBeGreaterThanOrEqual(0);
  expect(chooser.x + chooser.width).toBeLessThanOrEqual(390);
});

test('the pet band, the pet card and its photos follow the width: 768, 1024 and 1440 px', async ({ page, context }) => {
  await setUpDevice(context, { lostFoundChosen: true });
  await openWatchWithPets(page, [MISO]);
  const heading = page.getByRole('heading', { level: 1, name: 'Watch for' });
  const photo = () => shown(page.getByRole('img', { name: 'Miso’s first saved photo' }));
  const limits = page.getByText(LIMITS_LINE, { exact: true });

  // 768: the options under the heading; the pet and its limits line side by side.
  await page.setViewportSize({ width: 768, height: 1000 });
  expect((await box(watchFor(page))).y).toBeGreaterThanOrEqual((await box(heading)).y + (await box(heading)).height);
  const bandPhoto = await box(photo());
  const bandLimits = await box(limits);
  expect(bandLimits.x).toBeGreaterThan(bandPhoto.x + bandPhoto.width);
  expect(bandLimits.y).toBeLessThan(bandPhoto.y + bandPhoto.height);

  // 1024: the options in the heading's row; the pet card heads the right column, above the alerts.
  await page.setViewportSize({ width: 1024, height: 1000 });
  const headingBox = await box(heading);
  expect((await box(watchFor(page))).y).toBeLessThan(headingBox.y + headingBox.height);
  // The camera's panel: its heading's row, then the panel round it.
  const camera = await box(page.getByRole('heading', { name: 'Camera Feed' }).locator('xpath=../..'));
  const card = await box(photo());
  expect(card.x).toBeGreaterThan(camera.x + camera.width);
  expect(card.width).toBe(96);
  const alerts = await box(page.getByRole('heading', { name: /^Alerts/ }));
  expect(card.y + card.height).toBeLessThanOrEqual(alerts.y);

  // 1440: the photo 120 px with the other saved photos beside it as 48 px thumbnails.
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect((await box(photo())).width).toBe(120);
  for (const i of [2, 3]) {
    const thumbnail = await box(shown(page.getByRole('img', { name: `Miso, saved photo ${i} of 3` })));
    expect(thumbnail.width).toBe(48);
  }
});

// =============================================================================
// Accessibility
// =============================================================================

/** axe-core, installed for the run by CI. */
const AXE = readFileSync(path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');

interface AxeViolation { id: string; impact: string | null; help: string; nodes: Array<{ target: string[] }> }

/** What Watch for draws: the chooser and its pet row, the pet's card and Choose a pet. */
const WATCH_FOR_PARTS = ['.watch-for', '.watch-pet--card', '.watch-dialog'];

/**
 * axe's violations in the parts of the watch that are on the page, or on the
 * whole page when `parts` is empty.
 */
async function axeViolations(page: Page, parts: string[] = []): Promise<AxeViolation[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ content: AXE });
  return page.evaluate(async (selectors) => {
    type Context = Document | { include: string[][] };
    const axe = (window as unknown as { axe: { run: (context: Context, options: object) => Promise<{ violations: AxeViolation[] }> } }).axe;
    const present = selectors.filter((selector) => document.querySelector(selector));
    const context: Context = selectors.length === 0 ? document : { include: present.map((selector) => [selector]) };
    const result = await axe.run(context, { resultTypes: ['violations'] });
    return result.violations.map(({ id, impact, help, nodes }) => ({ id, impact, help, nodes: nodes.map(({ target }) => ({ target })) }));
  }, parts);
}

async function lookContext(browser: Browser, look: 'light' | 'dark', width: number) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: look });
  await setUpDevice(context, { lostFoundChosen: true });
  return context;
}

/** Counts the whole page's violations in the run's log, by rule. */
async function logWholePage(page: Page, state: string) {
  const all = await axeViolations(page);
  console.log(`${state}, the whole watch: ${all.map((violation) => `${violation.id} on ${violation.nodes.length}`).join(', ') || 'none'}`);
}

for (const look of ['light', 'dark'] as const) {
  for (const width of [390, 1280]) {
    test(`axe finds nothing in Watch for, the pet and Choose a pet, ${width} px, ${look}`, async ({ browser }) => {
      test.setTimeout(90_000);
      const context = await lookContext(browser, look, width);
      const page = await context.newPage();
      try {
        // No pet saved.
        await page.goto('/monitor/', { waitUntil: 'networkidle', timeout: 60_000 });
        await expect(lostAndFound(page)).toBeChecked();
        await expect(shown(page.getByText('No pet saved', { exact: true }))).toBeVisible();
        const empty = await axeViolations(page, WATCH_FOR_PARTS);
        await logWholePage(page, `no pet saved, ${width} ${look}`);

        // Miso and Tofu saved, then Choose a pet open.
        await savePets(page, [MISO, TOFU]);
        await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
        await expect(shown(page.getByText('3 photos', { exact: true }))).toBeVisible();
        const withPet = await axeViolations(page, WATCH_FOR_PARTS);
        await logWholePage(page, `Miso saved, ${width} ${look}`);
        await changePet(page).click();
        await expect(choosePet(page)).toBeVisible();
        const dialog = await axeViolations(page, WATCH_FOR_PARTS);

        expect(empty, JSON.stringify(empty)).toEqual([]);
        expect(withPet, JSON.stringify(withPet)).toEqual([]);
        expect(dialog, JSON.stringify(dialog)).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
}
