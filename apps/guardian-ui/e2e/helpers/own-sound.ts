/**
 * A sound of the person's own, saved as Sounds stores one, and the striped pet
 * the watch compares, for the walks of Lost & Found's sounds.
 *
 * @module e2e/helpers/own-sound
 */

import { expect, type Page } from '@playwright/test';

import { stripedPhoto } from './striped-subject';

export const SOUND_ID = 'sound-come-home';

/** How a saved sound plays, and the alerts it is saved for. */
export interface OwnSound {
  loop?: boolean;
  /** Passes after the first; a sound that loops ignores it. */
  repeatCount?: number;
  repeatDelayMs?: number;
  triggers?: string[];
}

/** Saves a short tone as the person's own sound, for Lost Item Found unless `triggers` says otherwise. */
export const saveOwnSound = (page: Page, sound: OwnSound = {}) =>
  page.evaluate(({ id, loop, repeatCount, repeatDelayMs, triggers }) => new Promise<void>((resolve, reject) => {
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
        volume: 80, loop, repeatCount, repeatDelayMs, fadeInMs: 0, fadeOutMs: 200,
        triggers, priority: 5, enabled: true, playCount: 0,
      });
      writing.oncomplete = () => { database.close(); resolve(); };
      writing.onerror = () => { database.close(); reject(writing.error); };
    };
  }), {
    id: SOUND_ID,
    loop: sound.loop ?? false,
    repeatCount: sound.repeatCount ?? 0,
    repeatDelayMs: sound.repeatDelayMs ?? 1000,
    triggers: sound.triggers ?? ['object_found'],
  });

/** How many times the sound manager has played the saved sound. */
export const timesPlayed = (page: Page) =>
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

/** Enrols a pet on the Lost & Found page from one photo, as a person adds one. */
export async function enrolPet(page: Page, name: string, photo: Buffer) {
  await page.getByText('Add New Subject to Watch').click();
  await expect(page.getByText('What are you looking for?')).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByPlaceholder('e.g., Max, Luna, Dad').fill(name);
  await page.locator('input[type="file"]').setInputFiles({ name: `${name.toLowerCase()}.png`, mimeType: 'image/png', buffer: photo });
  const next = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(next).toBeEnabled();
  await next.click();
  await page.getByRole('button', { name: 'Start Watching', exact: true }).click();
}

/** Enrols the striped pet, opens the watch and waits for the comparison to match. */
export async function watchStripes(page: Page) {
  await enrolPet(page, 'Stripes', await stripedPhoto(page));

  await page.getByRole('button', { name: 'Start Monitoring' }).click({ timeout: 60_000 });
  await page.waitForURL(/\/monitor\/?$/, { timeout: 60_000 });
  await page.getByRole('button', { name: 'Start Monitoring', exact: true }).click({ timeout: 60_000 });
  await expect(page.getByText('LIVE', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/consecutive match/).first()).toBeVisible({ timeout: 60_000 });
}

/**
 * Counts, in the page, each pass a saved sound (an audio element on a blob)
 * starts, each pass that ends, and each time one is paused. Call before the
 * page opens.
 */
export async function countOwnSoundPasses(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __ownSound: { passes: number; ended: number; pauses: number } };
    w.__ownSound = { passes: 0, ended: 0, pauses: 0 };
    const counted = new WeakSet<HTMLMediaElement>();
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (this.src.startsWith('blob:')) {
        w.__ownSound.passes += 1;
        if (!counted.has(this)) {
          counted.add(this);
          this.addEventListener('ended', () => { w.__ownSound.ended += 1; });
        }
      }
      return play.call(this);
    };
    const pause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
      if (this.src.startsWith('blob:') && !this.paused) w.__ownSound.pauses += 1;
      return pause.call(this);
    };
  });
}

/** What countOwnSoundPasses has counted so far. */
export const ownSoundCounts = (page: Page) =>
  page.evaluate(() => (window as unknown as { __ownSound: { passes: number; ended: number; pauses: number } }).__ownSound);

/**
 * Holds the saved sounds' store with a write that does not end until
 * releaseSavedSounds, so every read of the saved sounds waits, as a slow
 * database makes it wait. Resolves once the hold is in place.
 */
export const holdSavedSounds = (page: Page) =>
  page.evaluate(() => new Promise<void>((resolve, reject) => {
    const w = window as unknown as { __holdSounds: boolean };
    w.__holdSounds = true;
    const opening = indexedDB.open('safeos-custom-sounds');
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const database = opening.result;
      const store = database.transaction('sounds', 'readwrite').objectStore('sounds');
      let first = true;
      // Each request queued from the last one's answer keeps the write open.
      const keep = () => {
        const request = store.get('held');
        request.onsuccess = () => {
          if (first) { first = false; resolve(); }
          if (w.__holdSounds) keep(); else database.close();
        };
      };
      keep();
    };
  }));

export const releaseSavedSounds = (page: Page) =>
  page.evaluate(() => { (window as unknown as { __holdSounds: boolean }).__holdSounds = false; });
