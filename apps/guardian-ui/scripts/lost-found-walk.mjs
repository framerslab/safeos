// A person's walk through Lost and Found on the built site, for the scripts
// that drive it in CI (scripts/lost-found-probe.mjs). The caller launches
// Chromium, with the fake camera fed from the sample clip; these functions
// seed a device, enrol a pet through /lost-found/ with its photos, start the
// watch and read what the watch kept from the browser's own database.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The capture's preset (scripts/home-capture-settings.json), as the home
// page's captures seed it: the default preset with pixel detection off.
const CAPTURE_SETTINGS = JSON.parse(await readFile(path.join(APP_ROOT, 'scripts', 'home-capture-settings.json'), 'utf8'));

/**
 * A browser context for a person who has finished setup with the pet use,
 * the capture's preset saved, the two cards that appear unasked put away and
 * the notice about alert pictures answered, with the camera and microphone
 * allowed. The device is seeded once, so a reload keeps what the walk did.
 */
export async function seededContext(browser, options) {
  const context = await browser.newContext({ ...options, permissions: ['camera', 'microphone'] });
  await context.addInitScript((settings) => {
    if (localStorage.getItem('safeos-walk-seeded')) return;
    localStorage.setItem('safeos-walk-seeded', 'true');
    localStorage.setItem('safeos-onboarding', JSON.stringify({ state: {
      isComplete: true, selectedScenario: 'pet',
      acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
    }, version: 0 }));
    localStorage.setItem('guardian-onboarding-complete', 'true');
    localStorage.setItem('safeos-settings', JSON.stringify({ state: settings, version: 0 }));
    localStorage.setItem('safeos-notification-prompt-dismissed', String(Date.now()));
    localStorage.setItem('safeos-pwa-prompt-dismissed', String(Date.now()));
    localStorage.setItem('safeos-alert-pictures', JSON.stringify({ state: {
      keep: true, deleteAfterDays: 3, noticeAnswered: true, inNotifications: false,
    }, version: 0 }));
  }, CAPTURE_SETTINGS);
  return context;
}

/**
 * Enrols a pet through /lost-found/ as a person does: "Add New Subject to
 * Watch", Continue with the pet chosen, the name, the photos one at a time
 * through the file input, Continue and "Start Watching". Where setup shows the
 * photos' fingerprints with a Done key first, `atFingerprints` is awaited on
 * that step before Done is pressed. Returns once the page shows the pet under
 * "Currently Watching".
 */
export async function enrol(page, baseUrl, { name, photos, atFingerprints }) {
  await page.goto(new URL('/lost-found/', baseUrl).toString(), { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByText('Add New Subject to Watch').click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  // The upload step: its first text input is the name.
  const fileInput = page.locator('input[type="file"]');
  await fileInput.waitFor({ state: 'attached', timeout: 30_000 });
  await page.locator('input[type="text"]').first().fill(name);

  // One photo at a time, each waited for, so the pet keeps them in this order.
  const previews = page.locator('img[src^="data:image"]');
  for (let i = 0; i < photos.length; i++) {
    await fileInput.setInputFiles(photos[i]);
    await page.waitForFunction((count) => document.querySelectorAll('img[src^="data:image"]').length >= count, i + 1, { timeout: 30_000 });
  }
  const shown = await previews.count();
  if (shown !== photos.length) throw new Error(`setup shows ${shown} photos, not ${photos.length}`);

  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Start Watching', exact: true }).click();

  // Setup either shows the fingerprints with a Done key or goes straight back
  // to the page with the pet under "Currently Watching".
  const done = page.getByRole('button', { name: 'Done', exact: true });
  const watching = page.getByText('Currently Watching', { exact: true });
  await done.or(watching).first().waitFor({ timeout: 120_000 });
  let sawFingerprints = false;
  if (await done.isVisible()) {
    sawFingerprints = true;
    if (atFingerprints) await atFingerprints(page);
    await done.click();
  }
  await watching.waitFor({ timeout: 60_000 });
  await page.getByText(name, { exact: true }).first().waitFor({ timeout: 30_000 });
  return { sawFingerprints };
}

/**
 * Presses the Lost & Found page's "Start Monitoring", then the watch's own,
 * and waits for the camera to show LIVE. Returns the time it did, in
 * milliseconds since 1970. A camera that does not start throws with the
 * app's own error words.
 */
export async function startWatch(page) {
  await page.getByRole('button', { name: 'Start Monitoring' }).first().click({ timeout: 60_000 });
  await page.waitForURL(/\/monitor\/?$/, { timeout: 60_000 });
  await page.getByRole('button', { name: 'Start Monitoring', exact: true }).click({ timeout: 60_000 });
  await page.getByText('LIVE', { exact: true }).waitFor({ timeout: 30_000 }).catch(async (err) => {
    const shown = await page.locator('text=Camera Error').first().locator('xpath=..').textContent({ timeout: 2_000 }).catch(() => null);
    throw new Error(shown ? `the camera did not start: ${shown.replace(/\s+/g, ' ').trim()}` : err.message);
  });
  return Date.now();
}

/**
 * What the watch kept, read from the browser's database, each store only
 * where it exists: `saved` from the frames it saved (the match_frame store)
 * and `sightings` from the alerts it kept as sightings (alert_cache records
 * of kind 'sighting'). Pictures are left out. A database that cannot be
 * opened, or a store that cannot be read, fails the read with its name, so a
 * failed read is never taken for a watch that kept nothing.
 */
export async function readWatch(page) {
  return page.evaluate(async () => {
    const empty = { saved: [], sightings: [] };
    const known = await indexedDB.databases();
    if (!known.some((database) => database.name === 'safeos-guardian')) return empty;
    const database = await new Promise((resolve, reject) => {
      const opening = indexedDB.open('safeos-guardian');
      opening.onerror = () => reject(new Error(`could not open the safeos-guardian database: ${opening.error?.message ?? 'no reason given'}`));
      opening.onsuccess = () => resolve(opening.result);
    });
    const all = (store) => new Promise((resolve, reject) => {
      if (!database.objectStoreNames.contains(store)) return resolve([]);
      const reading = database.transaction(store).objectStore(store).getAll();
      reading.onsuccess = () => resolve(reading.result);
      reading.onerror = () => reject(new Error(`could not read the ${store} store: ${reading.error?.message ?? 'no reason given'}`));
    });
    try {
      const frames = await all('match_frame');
      const alerts = await all('alert_cache');
      return {
        saved: frames.map((frame) => ({
          id: frame.id,
          at: frame.timestamp,
          score: frame.confidence,
          colour: frame.details?.colorMatch,
          mainColours: frame.details?.dominantMatch,
          edges: frame.details?.edgeMatch,
          size: frame.details?.sizeMatch,
          region: frame.region ?? null,
        })).sort((a, b) => a.at - b.at),
        sightings: alerts.filter((alert) => alert.kind === 'sighting').map((alert) => ({
          id: alert.id,
          at: Date.parse(alert.createdAt),
          pictureId: alert.pictureId ?? null,
          repeats: alert.repeats ?? 0,
          colour: alert.details?.colorMatch,
          mainColours: alert.details?.dominantMatch,
          edges: alert.details?.edgeMatch,
          size: alert.details?.sizeMatch,
        })).sort((a, b) => a.at - b.at),
      };
    } finally {
      database.close();
    }
  });
}

/**
 * The saved pet of that name (its subject_profile record), or null. A read
 * that fails, fails with the database's or the store's name.
 */
export async function readPet(page, name) {
  return page.evaluate(async (wanted) => {
    const known = await indexedDB.databases();
    if (!known.some((database) => database.name === 'safeos-guardian')) return null;
    const database = await new Promise((resolve, reject) => {
      const opening = indexedDB.open('safeos-guardian');
      opening.onerror = () => reject(new Error(`could not open the safeos-guardian database: ${opening.error?.message ?? 'no reason given'}`));
      opening.onsuccess = () => resolve(opening.result);
    });
    try {
      if (!database.objectStoreNames.contains('subject_profile')) return null;
      const pets = await new Promise((resolve, reject) => {
        const reading = database.transaction('subject_profile').objectStore('subject_profile').getAll();
        reading.onsuccess = () => resolve(reading.result);
        reading.onerror = () => reject(new Error(`could not read the subject_profile store: ${reading.error?.message ?? 'no reason given'}`));
      });
      return pets.find((pet) => pet.name === wanted) ?? null;
    } finally {
      database.close();
    }
  }, name);
}
