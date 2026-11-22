/**
 * Alerts keep coming while the activity goes on, on one card per event.
 *
 * Opens the monitor with a camera whose picture changes on every frame,
 * presses "Start watching" and keeps the change going. The first alert
 * comes after the sustained-detection window; while the change goes on, the
 * next alert of that kind is due once the longer of its severity's cooldown
 * and the Cooldown Period has passed since the last one, and not before. It
 * updates the event's card, which counts its repeats, and it alerts again:
 * a repeat notification is shown with `renotify`.
 *
 * The camera is a canvas stream handed to the page in place of
 * getUserMedia's: the page's own motion and pixel detectors read it the way
 * they read a real camera. A part of the picture is redrawn with grey levels
 * 0, 85, 170 and 255 at random every 40 ms. Two samples of the same point
 * differ by 85 or more (over the motion detector's 30 grey-level line) in
 * three samples out of four, so the motion reading is three quarters of the
 * redrawn part, on every sample, with no dip under the line. The test can
 * widen the redrawn part, or hold the picture still for a moment now and
 * then. The microphone is silent, or a sawtooth tone at full gain.
 *
 * The times are read inside the page: an observer notes the moment the
 * alert list's count of each kind of alert goes up (a new card, or a card's
 * "Repeated N times" going up), and each value the Motion, Pixel and Audio
 * readouts show, so the gap between two alerts does not depend on how often
 * the test looks.
 *
 * Run in CI by ci.yml's "Web app alert walk" job against the static export.
 */

import { test, expect, type Page, type TestInfo } from '@playwright/test';

type Kind = 'motion' | 'pixel' | 'audio';

interface Shown {
  at: number;
  title: string;
  tag?: string;
  renotify?: boolean;
  requireInteraction?: boolean;
}

interface Walk {
  /** When the count of alerts of each kind went up (Date.now()). */
  alerts: Record<Kind, number[]>;
  /** How many cards of each kind the alert list shows. */
  cards: Record<Kind, number>;
  /** Each value a readout showed, with when it showed it. */
  readings: Record<Kind, Array<[number, number]>>;
  /** The system notifications the page asked for. */
  notifications: Shown[];
}

interface Camera {
  /** The share of the picture's width that changes, from the left edge (0 to 1). */
  changingWidth: number;
  /** Hold the picture still for `stillForMs` out of every `stillEveryMs` (0: never). */
  stillEveryMs: number;
  stillForMs: number;
  /** A sawtooth tone at full gain on the microphone, in place of silence. */
  tone: boolean;
}

declare global {
  interface Window {
    __walk?: Walk;
    __walkCamera?: Camera;
  }
}

interface Seed {
  /** The persisted settings to start from (merged over the store's defaults). */
  settings: Record<string, unknown> | null;
  camera: Partial<Camera>;
  /** Grant notifications and record each one the page shows. */
  notify?: boolean;
}

// The Custom preset with pixel detection and sound detection off: only the
// motion detector raises alerts. Motion line 20 % (sensitivity 80).
const CUSTOM = {
  id: 'custom',
  name: 'Maximum Alert',
  description: 'High sensitivity (80%) and max volume.',
  motionSensitivity: 80,
  audioSensitivity: 80,
  pixelThreshold: 20,
  absolutePixelThreshold: 50,
  analysisInterval: 5,
  alertDelay: 30,
  alertVolume: 100,
  emergencyMode: false,
  pixelDetectionEnabled: false,
  motionDetectionEnabled: true,
  audioDetectionEnabled: false,
  processingMode: 'hybrid',
  useAbsoluteThreshold: false,
};
const MOTION_ONLY = { activePresetId: 'custom', globalSettings: CUSTOM };

// Only the sound detector raises alerts. Sound line 5 % (sensitivity 95).
const SOUND_ONLY = {
  activePresetId: 'custom',
  globalSettings: {
    ...CUSTOM,
    audioSensitivity: 95,
    motionDetectionEnabled: false,
    audioDetectionEnabled: true,
  },
};

// Only the pixel detector raises alerts, at the default preset's 50 px line.
const PIXEL_ONLY = {
  activePresetId: 'custom',
  globalSettings: {
    ...CUSTOM,
    pixelDetectionEnabled: true,
    motionDetectionEnabled: false,
  },
};

// The store's timing defaults with the Cooldown Period at `seconds`.
const cooldownPeriod = (seconds: number) => ({
  cooldownPeriod: seconds,
  minimumMotionDuration: 500,
  emergencyEscalationDelay: 300,
});

// Each meter's alert line on its 0 to 100 track: Motion at 20, Sound at 5,
// and Picture change at 20, where its bar stands exactly when the check says
// yes (its own line is 50 changed pixels).
const LINES: Record<Kind, number> = { motion: 20, pixel: 20, audio: 5 };

async function openMonitor(page: Page, seed: Seed): Promise<void> {
  await page.addInitScript((s: Seed) => {
    localStorage.setItem('safeos-onboarding', JSON.stringify({ state: {
      isComplete: true, selectedScenario: 'pet',
      acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
    }, version: 0 }));
    localStorage.setItem('guardian-onboarding-complete', 'true');
    if (s.settings) {
      localStorage.setItem('safeos-settings', JSON.stringify({ state: s.settings, version: 0 }));
    }
    localStorage.setItem('safeos-notification-prompt-dismissed', String(Date.now()));
    localStorage.setItem('safeos-pwa-prompt-dismissed', String(Date.now()));

    const walk: Walk = {
      alerts: { motion: [], pixel: [], audio: [] },
      cards: { motion: 0, pixel: 0, audio: 0 },
      readings: { motion: [], pixel: [], audio: [] },
      notifications: [],
    };
    window.__walk = walk;
    window.__walkCamera = { changingWidth: 0, stillEveryMs: 0, stillForMs: 0, tone: false, ...s.camera };

    if (s.notify) {
      const shown = walk.notifications;
      const record = (title: string, options?: NotificationOptions) => {
        const o = (options || {}) as NotificationOptions & { renotify?: boolean };
        shown.push({ at: Date.now(), title, tag: o.tag, renotify: o.renotify, requireInteraction: o.requireInteraction });
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
    }

    // An alert card's message line starts with its kind; the screen-reader
    // summary starts "New ..." and is not counted. A card that counts its
    // repeats says "Repeated N times" beside its level.
    const KINDS: Array<[Kind, RegExp]> = [
      ['motion', /^Motion detected: \d+%/],
      ['pixel', /^Pixel movement detected/],
      ['audio', /^Audio detected: \d+%/],
    ];
    // Each kind's meter under the live picture, read from its value.
    const READOUTS: Array<[Kind, string]> = [['motion', 'Motion level'], ['pixel', 'Picture change level'], ['audio', 'Sound level']];
    const look = () => {
      const now = Date.now();
      const lines = Array.from(document.querySelectorAll('p'));
      for (const [kind, pattern] of KINDS) {
        let cards = 0;
        let alerts = 0;
        for (const p of lines) {
          if (!pattern.test(p.textContent || '')) continue;
          cards += 1;
          const repeats = /Repeated (\d+) times?/.exec(p.parentElement?.textContent || '');
          alerts += 1 + (repeats ? Number(repeats[1]) : 0);
        }
        walk.cards[kind] = cards;
        while (walk.alerts[kind].length < alerts) walk.alerts[kind].push(now);
      }
      for (const [kind, label] of READOUTS) {
        const meter = document.querySelector(`[role="meter"][aria-label="${label}"]`);
        if (!meter || !meter.hasAttribute('aria-valuetext')) continue;
        const value = parseFloat(meter.getAttribute('aria-valuenow') || '');
        if (!Number.isFinite(value)) continue;
        const list = walk.readings[kind];
        if (list.length === 0 || list[list.length - 1][1] !== value) list.push([now, value]);
      }
    };
    new MutationObserver(look).observe(document, { childList: true, subtree: true, characterData: true });

    const W = 320;
    const H = 240;
    const LEVELS = [0, 85, 170, 255];
    navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      const camera = window.__walkCamera!;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      canvas.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px';
      document.body.appendChild(canvas);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context for the test camera');
      const image = ctx.createImageData(W, H);
      const startedAt = Date.now();
      const draw = () => {
        if (camera.stillEveryMs > 0 && (Date.now() - startedAt) % camera.stillEveryMs < camera.stillForMs) return;
        const changing = Math.round(W * camera.changingWidth);
        const d = image.data;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            const v = x < changing ? LEVELS[Math.floor(Math.random() * 4)] : 128;
            d[i] = v;
            d[i + 1] = v;
            d[i + 2] = v;
            d[i + 3] = 255;
          }
        }
        ctx.putImageData(image, 0, 0);
      };
      draw();
      setInterval(draw, 40);
      const stream = canvas.captureStream(25);
      if (constraints && constraints.audio) {
        const audio = new AudioContext();
        const microphone = audio.createMediaStreamDestination();
        if (camera.tone) {
          // A sawtooth has a harmonic in nearly every band the sound
          // detector reads, so its level is far over a 5 % line.
          const tone = audio.createOscillator();
          tone.type = 'sawtooth';
          tone.frequency.value = 440;
          const gain = audio.createGain();
          gain.gain.value = 1;
          tone.connect(gain).connect(microphone);
          tone.start();
        }
        void audio.resume();
        for (const track of microphone.stream.getAudioTracks()) stream.addTrack(track);
      }
      return stream;
    };
  }, seed);

  await page.goto('/monitor/', { waitUntil: 'networkidle' });
  await startMonitoring(page);
}

async function startMonitoring(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start watching', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop watching', exact: true })).toBeVisible({ timeout: 30_000 });
}

const walkOf = (page: Page) => page.evaluate(() => window.__walk!);
const pageNow = (page: Page) => page.evaluate(() => Date.now());

/** Waits for the first alert of `kind` and returns its time. */
async function firstAlert(page: Page, kind: Kind): Promise<number> {
  await expect
    .poll(() => page.evaluate((k) => window.__walk?.alerts[k].length ?? 0, kind), { timeout: 60_000 })
    .toBeGreaterThanOrEqual(1);
  return page.evaluate((k) => window.__walk!.alerts[k][0], kind);
}

/** Lets the page run until its clock reads `at`. */
async function runUntil(page: Page, at: number): Promise<void> {
  const left = at - (await pageNow(page));
  if (left <= 0) return;
  await page.waitForFunction((t) => Date.now() >= t, at, { polling: 250, timeout: left + 30_000 });
}

/** The lowest value the readout showed from `from` to `to`, the value it showed at `from` included. */
function lowestReading(walk: Walk, kind: Kind, from: number, to: number): number {
  const list = walk.readings[kind];
  let lowest = Infinity;
  for (let i = 0; i < list.length; i++) {
    const [at, value] = list[i];
    const next = i + 1 < list.length ? list[i + 1][0] : Infinity;
    if (next > from && at <= to) lowest = Math.min(lowest, value);
  }
  return lowest;
}

/** A picture of the alert list, kept with the walk's report. */
async function pictureOfAlerts(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const panel = page.locator('div.rounded-xl', { has: page.getByRole('heading', { name: /^Alerts/ }) }).last();
  await panel.screenshot({ path: testInfo.outputPath(`${name}.png`), timeout: 5_000 }).catch(() => undefined);
}

const cardsOf = (page: Page, pattern: RegExp) => page.locator('p', { hasText: pattern });
const MOTION_CARD = /^Motion detected: \d+%/;

/**
 * Checks one event that went on: its second alert came `periodMs` after the
 * first (no sooner, and not much later), the readout stayed over the line in
 * between, and the alert updated the event's one card.
 */
async function expectRepeat(page: Page, kind: Kind, first: number, periodMs: number, what: string): Promise<number> {
  await runUntil(page, first + periodMs + LATE_MS);
  const walk = await walkOf(page);
  const later = walk.alerts[kind].slice(1).map((t) => t - first);
  expect(later.length, `a second ${kind} alert while the ${what} went on (seen at ${JSON.stringify(later)} ms)`).toBeGreaterThanOrEqual(1);
  const second = later[0] ?? Infinity;
  expect.soft(second, `the second ${kind} alert waited ${periodMs} ms`).toBeGreaterThanOrEqual(periodMs - EARLY_MS);
  expect.soft(second).toBeLessThanOrEqual(periodMs + LATE_MS);
  expect.soft(walk.readings[kind].length, `the ${kind} readout was read`).toBeGreaterThan(0);
  expect.soft(
    lowestReading(walk, kind, first, first + second),
    `the ${kind} reading stayed over its ${LINES[kind]} line between the two alerts`,
  ).toBeGreaterThanOrEqual(LINES[kind]);
  expect.soft(walk.cards[kind], `one card for the one ${kind} event (alerts at ${JSON.stringify(later)} ms)`).toBe(1);
  return second;
}

interface SavedCard {
  id: string;
  message: string;
  acknowledged: boolean;
  repeats?: number;
}

/** The monitor's alert cards saved in the site's database, read from `page`, a tab of the same site. */
function savedCards(page: Page): Promise<SavedCard[]> {
  return page.evaluate(() => new Promise<SavedCard[]>((resolve, reject) => {
    const open = indexedDB.open('safeos-guardian');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const read = db.transaction('alert_cache', 'readonly').objectStore('alert_cache').getAll();
      read.onerror = () => { db.close(); reject(read.error); };
      read.onsuccess = () => {
        db.close();
        resolve(read.result
          .filter((row) => row.monitoring && /^Motion detected/.test(row.message))
          .map(({ id, message, acknowledged, repeats }) => ({ id, message, acknowledged, repeats })));
      };
    };
  }));
}

/** Acknowledges a saved card from `page` the way the store saves an acknowledgement: one update of its record. */
function acknowledgeSaved(page: Page, id: string): Promise<void> {
  return page.evaluate((cardId) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('safeos-guardian');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('alert_cache', 'readwrite');
      const cards = tx.objectStore('alert_cache');
      const read = cards.get(cardId);
      read.onsuccess = () => { cards.put({ ...read.result, acknowledged: true, acknowledgementOrder: 0 }); };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), id);
}

// The page draws the first alert's card while it is busiest (the list's first
// render, the sounds), so a later card may be drawn a little sooner after its
// alert than the first was; it has this long to arrive.
const EARLY_MS = 750;
const LATE_MS = 6_000;

// The page lists the browser's cameras before it asks for one; the fake
// device gives it one to list. The stream itself comes from the canvas.
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

// The test camera and microphone need desktop Chromium: the flags above, and
// the camera and microphone grants, which Playwright's Firefox does not take
// (it throws "Unknown permission: camera"). CI walks it in Chromium; under
// the other projects in playwright.config.ts it skips.
test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'the alert walk runs in desktop Chromium',
);

test.describe('Alerts repeat while the activity goes on', () => {
  test('a low motion alert comes again after the Cooldown Period when that is longer than low\'s 10 s, on the same card', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    // A third of the width changes: a motion reading of 25 % on a 20 % line,
    // 5 points over it, which is a low alert (cooldown 10 s by default). The
    // Cooldown Period is 20 s, so the same event waits 20 s.
    await openMonitor(page, {
      settings: { ...MOTION_ONLY, timingSettings: cooldownPeriod(20) },
      camera: { changingWidth: 1 / 3 },
    });
    const first = await firstAlert(page, 'motion');
    await expect(cardsOf(page, MOTION_CARD).first()).toHaveText(/^Motion detected: 2\d% \(threshold: 20%/);
    await expectRepeat(page, 'motion', first, 20_000, 'motion');
    await expect.soft(page.getByText('Repeated 1 time', { exact: true })).toBeVisible();
    await pictureOfAlerts(page, testInfo, 'low-motion-repeated');
  });

  test('a critical motion alert, whose cooldown is 0, comes again at the Cooldown Period, on the same card, and notifies again', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    // The whole picture changes: a reading of 75 % on a 20 % line, a
    // critical alert. Its cooldown is 0, so one event repeats at the
    // Cooldown Period (10 s here), not on every sample.
    await openMonitor(page, {
      settings: { ...MOTION_ONLY, timingSettings: cooldownPeriod(10) },
      camera: { changingWidth: 1 },
      notify: true,
    });
    const first = await firstAlert(page, 'motion');
    await expect(cardsOf(page, MOTION_CARD).first()).toHaveText(/^Motion detected: [6-9]\d% \(threshold: 20%/);
    await expectRepeat(page, 'motion', first, 10_000, 'motion');
    await expect.soft(page.getByText('Repeated 1 time', { exact: true })).toBeVisible();
    await pictureOfAlerts(page, testInfo, 'critical-motion-repeated');

    // The repeat replaces the first notification (same tag) and alerts again.
    const shown = (await walkOf(page)).notifications.filter((n) => n.title === 'Motion Detected');
    expect.soft(shown.length, `a notification for each alert (${JSON.stringify(shown)})`).toBeGreaterThanOrEqual(2);
    expect.soft(shown[1]?.tag).toBe(shown[0]?.tag);
    expect.soft(shown[1]?.renotify, 'the repeat notification sets renotify, so it alerts again').toBe(true);
  });

  test('on the default preset a pixel alert comes again at the Cooldown Period while the picture keeps changing', async ({ page }) => {
    test.setTimeout(120_000);
    // The default preset (Maximum Alert) has pixel detection on with a 50 px
    // line. Three quarters of the whole picture changes on every frame, far
    // over ten times the line: a critical pixel alert, cooldown 0.
    await openMonitor(page, {
      settings: { timingSettings: cooldownPeriod(10) },
      camera: { changingWidth: 1 },
    });
    const first = await firstAlert(page, 'pixel');
    await expectRepeat(page, 'pixel', first, 10_000, 'picture change');
  });

  test('a sound that goes on alerts again at the Cooldown Period, on the same card', async ({ page }) => {
    test.setTimeout(120_000);
    // A sawtooth tone at full gain on a 5 % line: a critical sound alert,
    // cooldown 0, so the event repeats at the Cooldown Period (10 s here).
    await openMonitor(page, {
      settings: { ...SOUND_ONLY, timingSettings: cooldownPeriod(10) },
      camera: { changingWidth: 0, tone: true },
    });
    const first = await firstAlert(page, 'audio');
    await expect(cardsOf(page, /^Audio detected: \d+%/).first()).toHaveText(/^Audio detected: (4[5-9]|[5-9]\d|100)% \(threshold: 5%/);
    await expectRepeat(page, 'audio', first, 10_000, 'sound');
  });

  test('a card acknowledged in another tab stays acknowledged: the event\'s next alert goes on a new card, which the alert after it updates', async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    // A critical event that goes on repeats at the Cooldown Period (10 s here).
    await openMonitor(page, {
      settings: { ...MOTION_ONLY, timingSettings: cooldownPeriod(10) },
      camera: { changingWidth: 1 },
    });
    const first = await firstAlert(page, 'motion');

    // A second tab of the site acknowledges the event's card before its next alert.
    const other = await page.context().newPage();
    await other.goto('/about/', { waitUntil: 'domcontentloaded' });
    await expect.poll(async () => (await savedCards(other)).length, { timeout: 15_000 }).toBe(1);
    const [card] = await savedCards(other);
    await acknowledgeSaved(other, card.id);

    // The next alert finds the card acknowledged: it leaves it so and goes on a new card.
    await runUntil(page, first + 10_000 + LATE_MS);
    let saved = await savedCards(other);
    expect(saved.find((c) => c.id === card.id), `the acknowledged card is kept (${JSON.stringify(saved)})`).toMatchObject({ acknowledged: true });
    expect.soft(saved.find((c) => c.id === card.id)?.repeats).toBeUndefined();
    const added = saved.filter((c) => c.id !== card.id);
    expect(added, `one new card for the alert after the acknowledgement (${JSON.stringify(saved)})`).toHaveLength(1);
    expect(added[0]).toMatchObject({ acknowledged: false });

    // The alert after that updates the new card; no third card is made.
    await runUntil(page, first + 20_000 + LATE_MS);
    saved = await savedCards(other);
    expect(saved.map((c) => c.id).sort(), `the two cards (${JSON.stringify(saved)})`).toEqual([card.id, added[0].id].sort());
    expect(saved.find((c) => c.id === added[0].id)).toMatchObject({ acknowledged: false, repeats: 1 });
    expect(saved.find((c) => c.id === card.id)).toMatchObject({ acknowledged: true });
    await expect.soft(page.getByText('Repeated 1 time', { exact: true })).toBeVisible();
    await pictureOfAlerts(page, testInfo, 'acknowledged-in-another-tab');
    await other.close();
  });

  test('a rise to critical during a continuing event alerts at once, on the event\'s card, and replaces its notification', async ({ page }) => {
    test.setTimeout(120_000);
    // A low event (25 % on a 20 % line) goes on; 3 s after its alert the
    // whole picture starts changing (75 %, critical). Motion never falls
    // under the line, and critical has no cooldown: the rise alerts at once,
    // not after the Cooldown Period (30 s by default).
    await openMonitor(page, { settings: MOTION_ONLY, camera: { changingWidth: 1 / 3 }, notify: true });
    const first = await firstAlert(page, 'motion');
    await expect(cardsOf(page, MOTION_CARD).first()).toHaveText(/^Motion detected: 2\d% \(threshold: 20%/);
    await runUntil(page, first + 3_000);
    const roseAt = await page.evaluate(() => {
      window.__walkCamera!.changingWidth = 1;
      return Date.now();
    });
    await runUntil(page, roseAt + 6_000);
    const walk = await walkOf(page);
    const afterRise = walk.alerts.motion.filter((t) => t > roseAt).map((t) => t - roseAt);
    expect(afterRise.length, `an alert after the rise (alerts at ${JSON.stringify(walk.alerts.motion.map((t) => t - first))} ms after the first)`).toBeGreaterThanOrEqual(1);
    expect.soft(afterRise[0], 'the critical alert came within 3 s of the rise').toBeLessThanOrEqual(3_000);
    expect.soft(lowestReading(walk, 'motion', first, roseAt + afterRise[0]), 'motion stayed over the line').toBeGreaterThanOrEqual(20);
    expect.soft(walk.cards.motion, 'the rise updated the event\'s card').toBe(1);
    await expect.soft(cardsOf(page, MOTION_CARD).first()).toHaveText(/^Motion detected: [6-9]\d% \(threshold: 20%/);

    // The rise's notification keeps the event's tag, so it replaces the low
    // one in place of standing beside it.
    const shown = walk.notifications.filter((n) => n.title === 'Motion Detected');
    expect.soft(shown.length, `a notification for each alert (${JSON.stringify(shown)})`).toBeGreaterThanOrEqual(2);
    expect.soft(shown[shown.length - 1]?.tag, `the rise keeps the notification tag (${JSON.stringify(shown)})`).toBe(shown[0]?.tag);
  });

  test('a critical event that repeats at a lower severity keeps its notification up until it is dismissed', async ({ page }) => {
    test.setTimeout(120_000);
    // The whole picture changes (75 %, critical), then a third of it (25 %,
    // low, still over the 20 % line): one event, whose repeat at the
    // Cooldown Period (10 s here) is low. The critical notification stays up
    // until it is dismissed, and the low repeat that replaces it does too.
    await openMonitor(page, {
      settings: { ...MOTION_ONLY, timingSettings: cooldownPeriod(10) },
      camera: { changingWidth: 1 },
      notify: true,
    });
    const first = await firstAlert(page, 'motion');
    await page.evaluate(() => { window.__walkCamera!.changingWidth = 1 / 3; });
    await runUntil(page, first + 10_000 + LATE_MS);

    const shown = (await walkOf(page)).notifications.filter((n) => n.title === 'Motion Detected');
    expect(shown.length, `a notification for each alert (${JSON.stringify(shown)})`).toBeGreaterThanOrEqual(2);
    expect.soft(shown[0]?.requireInteraction, 'the critical notification stays up').toBe(true);
    expect.soft(shown[shown.length - 1]?.tag, 'the repeat replaces the event\'s notification').toBe(shown[0]?.tag);
    expect.soft(shown[shown.length - 1]?.requireInteraction, `the lower repeat keeps it up (${JSON.stringify(shown)})`).toBe(true);
    await expect.soft(cardsOf(page, MOTION_CARD).first()).toHaveText(/^Motion detected: 2\d% \(threshold: 20%/);
  });

  test('an event whose card is acknowledged keeps its notification tag on the new card it goes on', async ({ page }) => {
    test.setTimeout(120_000);
    // A critical event goes on (the whole picture, 75 %); its card is
    // acknowledged; its next alert, at the Cooldown Period (10 s here), goes
    // on a new card and replaces the event's notification.
    await openMonitor(page, {
      settings: { ...MOTION_ONLY, timingSettings: cooldownPeriod(10) },
      camera: { changingWidth: 1 },
      notify: true,
    });
    const first = await firstAlert(page, 'motion');
    await page.getByRole('button', { name: 'Acknowledge', exact: true }).first().click();
    await runUntil(page, first + 10_000 + LATE_MS);

    const shown = (await walkOf(page)).notifications.filter((n) => n.title === 'Motion Detected');
    expect(shown.length, `a notification for each alert (${JSON.stringify(shown)})`).toBeGreaterThanOrEqual(2);
    expect(shown[shown.length - 1]?.tag, `the event keeps its tag on its new card (${JSON.stringify(shown)})`).toBe(shown[0]?.tag);
  });

  test('a new event does not replace the notification of an earlier event that is kept up', async ({ page }) => {
    test.setTimeout(120_000);
    // A critical event (the whole picture, 75 %), whose notification stays up
    // until dismissed; the picture holds still, so the event ends; then a
    // third of it changes (25 %, low): a new event, on a new card, whose
    // notification stands beside the critical one.
    await openMonitor(page, {
      settings: { ...MOTION_ONLY, timingSettings: cooldownPeriod(10) },
      camera: { changingWidth: 1 },
      notify: true,
    });
    const first = await firstAlert(page, 'motion');
    await page.evaluate(() => { window.__walkCamera!.changingWidth = 0; });
    await runUntil(page, first + 3_000);
    await page.evaluate(() => { window.__walkCamera!.changingWidth = 1 / 3; });
    await expect.poll(async () => (await walkOf(page)).cards.motion, { timeout: 40_000 }).toBe(2);
    // The second card shows before its notification is delivered: the notification
    // waits for the service worker's registration.
    const motionNotifications = async () => (await walkOf(page)).notifications.filter((n) => n.title === 'Motion Detected');
    await expect.poll(async () => (await motionNotifications()).length, {
      message: 'a notification for each event', timeout: 15_000,
    }).toBeGreaterThanOrEqual(2);

    const shown = await motionNotifications();
    expect.soft(shown[0]?.requireInteraction, 'the critical notification stays up').toBe(true);
    expect(shown[shown.length - 1]?.tag, `the new event has its own tag (${JSON.stringify(shown)})`).not.toBe(shown[0]?.tag);
  });

  test('a scene that holds still for a moment now and then is one event, which repeats at the Cooldown Period', async ({ page }) => {
    test.setTimeout(120_000);
    // The whole picture changes (critical), but holds still for 450 ms out
    // of every 1.5 s, so a sample or two reads 0 %. That is shorter than the
    // 500 ms sustained window: the event goes on and repeats at the Cooldown
    // Period (10 s here), not after each still moment.
    await openMonitor(page, {
      settings: { ...MOTION_ONLY, timingSettings: cooldownPeriod(10) },
      camera: { changingWidth: 1, stillEveryMs: 1_500, stillForMs: 450 },
    });
    const first = await firstAlert(page, 'motion');
    await runUntil(page, first + 10_000 + LATE_MS);
    const walk = await walkOf(page);
    const later = walk.alerts.motion.slice(1).map((t) => t - first);
    expect(later.length, `a second motion alert (seen at ${JSON.stringify(later)} ms)`).toBeGreaterThanOrEqual(1);
    expect.soft(later[0], `the second alert waited for the Cooldown Period (alerts at ${JSON.stringify(later)} ms)`).toBeGreaterThanOrEqual(10_000 - EARLY_MS);
    expect.soft(lowestReading(walk, 'motion', first, first + later[0]), 'the still moments reached the detector').toBeLessThan(20);
    expect.soft(walk.cards.motion, 'one card for the one event').toBe(1);
  });

  test('after Stop and Start a new event alerts at once and does not wait for the last session\'s Cooldown Period', async ({ page }) => {
    test.setTimeout(120_000);
    // A critical event, Cooldown Period 60 s. Monitoring stops 2 s after its
    // alert and starts again while the picture keeps changing: that is a new
    // event, and critical has no cooldown.
    await openMonitor(page, {
      settings: { ...MOTION_ONLY, timingSettings: cooldownPeriod(60) },
      camera: { changingWidth: 1 },
    });
    const first = await firstAlert(page, 'motion');
    await runUntil(page, first + 2_000);
    await page.getByRole('button', { name: 'Stop watching', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start watching', exact: true })).toBeVisible({ timeout: 10_000 });
    await startMonitoring(page);
    const restartedAt = await pageNow(page);
    await runUntil(page, restartedAt + 8_000);
    const walk = await walkOf(page);
    const afterStart = walk.alerts.motion.filter((t) => t > restartedAt).map((t) => t - restartedAt);
    expect(afterStart.length, `an alert after Start (alerts at ${JSON.stringify(walk.alerts.motion.map((t) => t - first))} ms after the first, Start at ${restartedAt - first} ms)`).toBeGreaterThanOrEqual(1);
    expect.soft(afterStart[0]).toBeLessThanOrEqual(5_000);
    expect.soft(walk.cards.motion, 'the new session\'s event has its own card').toBe(2);
  });

  test('turning a detector off ends its event: turned on again, a new event alerts at once and does not wait for the Cooldown Period', async ({ page }) => {
    test.setTimeout(120_000);
    // A critical pixel event, Cooldown Period 60 s. Pixel detection is
    // turned off 2 s after the alert, on the monitor's own switch, and on
    // again 1 s later while the picture keeps changing. While it is off the
    // camera hands the page no pixel readings, so only the switch can end
    // the event. Turned on again, that is a new event, and critical has no
    // cooldown.
    await openMonitor(page, {
      settings: { ...PIXEL_ONLY, timingSettings: cooldownPeriod(60) },
      camera: { changingWidth: 1 },
    });
    const first = await firstAlert(page, 'pixel');
    await runUntil(page, first + 2_000);
    // The switch is in the watch's settings, folded under Settings for this watch.
    await page.getByRole('button', { name: 'Show settings', exact: true }).click();
    const pixelSwitch = page.getByRole('switch', { name: 'Toggle pixel detection' });
    await pixelSwitch.click();
    await expect(pixelSwitch).toHaveAttribute('aria-checked', 'false');
    await runUntil(page, (await pageNow(page)) + 1_000);
    await pixelSwitch.click();
    await expect(pixelSwitch).toHaveAttribute('aria-checked', 'true');
    const onAgainAt = await pageNow(page);
    await runUntil(page, onAgainAt + 8_000);
    const walk = await walkOf(page);
    const afterOn = walk.alerts.pixel.filter((t) => t > onAgainAt).map((t) => t - onAgainAt);
    expect(afterOn.length, `a pixel alert after pixel detection was turned on again (alerts at ${JSON.stringify(walk.alerts.pixel.map((t) => t - first))} ms after the first, on again at ${onAgainAt - first} ms)`).toBeGreaterThanOrEqual(1);
    expect.soft(afterOn[0]).toBeLessThanOrEqual(5_000);
    expect.soft(walk.cards.pixel, 'the new event has its own card').toBe(2);
  });
});
