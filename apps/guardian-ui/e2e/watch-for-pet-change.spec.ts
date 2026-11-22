/**
 * Another pet chosen while the watch compares
 *
 * The camera shows grey stripes. Two pets are saved: Stripes, enrolled from a
 * photo of the same stripes, which the comparison matches, and Plain, enrolled
 * from a plain blue photo, which it does not. The watch compares with Stripes
 * until its matches are saved; then Plain is chosen in Choose a pet. The pet's
 * meter then names Plain, no match is saved for Plain, and the camera stays on.
 *
 * @module e2e/watch-for-pet-change.spec
 */

import { test, expect, type Page } from '@playwright/test';

import monitorSettings from '../scripts/home-capture-settings.json';
import { enrolPet, watchStripes } from './helpers/own-sound';
import { setUpDevice } from './helpers/seeded-device';
import { CAMERA_FILE } from './helpers/striped-subject';

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

/** A plain blue photo, which the camera's grey stripes do not match. */
async function plainPhoto(page: Page): Promise<Buffer> {
  const photo = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2D canvas');
    ctx.fillStyle = 'rgb(0, 0, 255)';
    ctx.fillRect(0, 0, 320, 240);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return Buffer.from(photo, 'base64');
}

/**
 * How many frames the comparison has saved for the pet of this name, in this
 * browser's database. A database, a store or a pet that is not there, or a
 * read that fails, throws: none of them shows that no frame was saved.
 */
const framesOf = (page: Page, name: string): Promise<number> =>
  page.evaluate(async (petName) => {
    if (!(await indexedDB.databases()).some((database) => database.name === 'safeos-guardian')) {
      throw new Error('the safeos-guardian database is not in this browser');
    }
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('safeos-guardian');
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      const all = <T,>(store: string) => new Promise<T[]>((resolve, reject) => {
        if (!database.objectStoreNames.contains(store)) {
          reject(new Error(`the database has no ${store} store`));
          return;
        }
        const reading = database.transaction(store).objectStore(store).getAll();
        reading.onsuccess = () => resolve(reading.result as T[]);
        reading.onerror = () => reject(reading.error ?? new Error(`the ${store} store did not read`));
      });
      const pets = await all<{ id: string; name: string }>('subject_profile');
      const frames = await all<{ subjectId: string }>('match_frame');
      const ids = new Set(pets.filter((pet) => pet.name === petName).map((pet) => pet.id));
      if (ids.size === 0) throw new Error(`no pet named ${petName} is saved`);
      return frames.filter((frame) => ids.has(frame.subjectId)).length;
    } finally {
      database.close();
    }
  }, name);

test('another pet chosen while the watch compares starts with none of the first pet’s matches', async ({ page, context }) => {
  test.setTimeout(240_000);
  await setUpDevice(context, { use: 'pet', settings: monitorSettings });

  await page.goto('/lost-found/', { waitUntil: 'networkidle', timeout: 60_000 });
  await enrolPet(page, 'Plain', await plainPhoto(page));
  await expect(page.getByText('Add New Subject to Watch')).toBeVisible({ timeout: 60_000 });
  await watchStripes(page);

  // Stripes' matches are saved, and the pet's meter names Stripes.
  const petMeter = page.locator('.watch-meter--pet');
  await expect(petMeter.getByText('Comparing with Stripes’s photos', { exact: true })).toBeVisible({ timeout: 30_000 });
  expect(await framesOf(page, 'Stripes')).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Change pet', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose a pet' });
  await dialog.getByText('Plain', { exact: true }).click();
  await expect(dialog).toHaveCount(0);

  // The meter names Plain at once, and no match is saved for Plain while it is compared.
  await expect(petMeter.getByText('Comparing with Plain’s photos', { exact: true })).toBeVisible();
  await page.waitForTimeout(3_000);
  expect(await framesOf(page, 'Plain')).toBe(0);
  await page.screenshot({ path: test.info().outputPath('watch-for-pet-changed-1280.png') });

  // The camera did not restart, and the comparison goes on with Plain.
  await expect(page.getByRole('button', { name: 'Stop watching', exact: true })).toBeVisible();
  await expect(petMeter.getByText('Comparing with Plain’s photos', { exact: true })).toBeVisible();
});
