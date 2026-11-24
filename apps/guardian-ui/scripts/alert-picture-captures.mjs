// Captures the alert pictures in each of their states from the built site.
//
//   node scripts/alert-picture-captures.mjs <base-url> <out-dir> <clip.y4m> <clip.wav>
//
// The Pictures workflow's "Capture the home page pictures" job runs it after
// the home captures, on the same served site. Nothing is drawn by hand: the
// pages are the built site's, and the camera is Chromium's fake camera fed
// from the committed sample clip, converted to .y4m and .wav inside the job.
//
// For each look (light, dark) and each size (390 by 844 and 1440 by 900, at
// a device scale factor of 2) it seeds a device that finished setup and
// answered the notice about alert pictures, raises alerts from the clip and
// saves each state clipped to its own part of the page, as
// alert-<state>-<width>-<look>.png:
//
//   card                  three Motion alerts: the newest card large, two small
//   sound-card            a Sound alert's card
//   card-failed           a picture the device could not save, moved to the small form by a newer alert
//   opened                a Motion alert's picture, opened
//   history               History's rows of the watch's alerts
//   watch-group           Alert pictures in the watch's settings
//   settings-group        Alert pictures on Settings > Detection
//   notice                the notice before a device's first watch
//   setup-choice          the same choice in setup's camera step, on a first visit
//   notification-setting  Show the picture in alert notifications
//   live-box              the box on the live picture after an alert
//   sighting              a Lost and Found sighting, from a striped clip this
//                         script writes, with the pet "Stripes" enrolled
//   dashboard-sighting    the dashboard's Since you last looked after that
//                         sighting, in the same visit
//
// The clip's camera moves, so a Motion alert raised from the whole clip boxes
// the whole frame, and a box over half of the frame has no close-up. For the
// Motion states (card, opened, history, live-box) the camera is the clip
// itself through the fake camera, held still outside one part: the page sees
// a still frame of the clip with the clip playing inside its middle part, so
// that part is what changes, and the box and its close-up show.
//
// A state it cannot reach fails the run and is named. It prints the commit
// and the run it was given (CAPTURE_COMMIT, CAPTURE_RUN).
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const [baseUrl, outDir, videoFile, audioFile] = process.argv.slice(2);
if (!baseUrl || !outDir || !videoFile || !audioFile) {
  console.error('usage: alert-picture-captures.mjs <base-url> <out-dir> <clip.y4m> <clip.wav>');
  process.exit(2);
}

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOOKS = ['light', 'dark'];
const SIZES = [{ width: 390, height: 844 }, { width: 1440, height: 900 }];
const SCALE = 2;

console.log(`commit: ${process.env.CAPTURE_COMMIT || '(not given)'}`);
console.log(`run: ${process.env.CAPTURE_RUN || '(not given)'}`);

// The capture preset of the home captures, with the detectors each state needs.
const CAPTURE_SETTINGS = JSON.parse(await readFile(path.join(APP_ROOT, 'scripts', 'home-capture-settings.json'), 'utf8'));
const withDetectors = ({ motion, sound }) => ({
  ...CAPTURE_SETTINGS,
  globalSettings: { ...CAPTURE_SETTINGS.globalSettings, motionDetectionEnabled: motion, audioDetectionEnabled: sound, pixelDetectionEnabled: false },
});
const MOTION_ONLY = withDetectors({ motion: true, sound: false });
// The clip held still outside one part changes less of the frame than the whole clip does, so
// its watch runs at a Motion sensitivity of 95: a change over 5 per cent of the picture alerts.
const PART_MOTION = { ...MOTION_ONLY, globalSettings: { ...MOTION_ONLY.globalSettings, motionSensitivity: 95 } };
const SOUND_ONLY = withDetectors({ motion: false, sound: true });
const SIGHTINGS_ONLY = withDetectors({ motion: false, sound: false });

const MOTION_CARD = /^Motion at \d/;
const SOUND_CARD = /^Sound at \d/;
const QUESTION = 'Could this be Stripes?';

// =============================================================================
// The striped clip and the pet's photo, as the Lost & Found walks make them
// =============================================================================

const STRIPES = { width: 640, height: 480, period: 40, frames: 8 };
const stripeLuma = (x, shift = 0) => 126 + 96 * Math.sin((2 * Math.PI * (x - shift)) / STRIPES.period);

function stripedClip() {
  const { width, height, frames, period } = STRIPES;
  const parts = [Buffer.from(`YUV4MPEG2 W${width} H${height} F30:1 Ip A1:1 C420jpeg\n`, 'ascii')];
  const colourPlanes = Buffer.alloc((width / 2) * (height / 2) * 2, 128);
  for (let frame = 0; frame < frames; frame++) {
    const shift = (frame * period) / frames;
    const row = Buffer.from(Array.from({ length: width }, (_, x) => Math.round(stripeLuma(x, shift))));
    const plane = Buffer.alloc(width * height);
    for (let y = 0; y < height; y++) row.copy(plane, y * width);
    parts.push(Buffer.from('FRAME\n', 'ascii'), plane, colourPlanes);
  }
  return Buffer.concat(parts);
}

async function stripedPhoto(page) {
  const base64 = await page.evaluate(({ width, height, period }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    for (let x = 0; x < width; x++) {
      const y = 126 + 96 * Math.sin((2 * Math.PI * x) / period);
      const grey = Math.round(((y - 16) * 255) / 219);
      ctx.fillStyle = `rgb(${grey}, ${grey}, ${grey})`;
      ctx.fillRect(x, 0, 1, height);
    }
    return canvas.toDataURL('image/png').split(',')[1];
  }, STRIPES);
  return Buffer.from(base64, 'base64');
}

// =============================================================================
// The device and the pages
// =============================================================================

const address = (route) => new URL(route, baseUrl).toString();

/**
 * Runs in the page before its own scripts: the camera the page gets is the
 * fake camera's clip held still outside its middle part, where the clip plays
 * on. The microphone is the fake microphone, as it is.
 */
function clipInOnePart() {
  const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    const real = await original(constraints);
    const [camera] = real.getVideoTracks();
    if (!camera) return real;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([camera]);
    await video.play();
    await new Promise((resolve) => {
      const wait = () => (video.videoWidth > 0 ? resolve() : requestAnimationFrame(wait));
      wait();
    });
    const width = video.videoWidth;
    const height = video.videoHeight;
    const still = document.createElement('canvas');
    still.width = width;
    still.height = height;
    still.getContext('2d').drawImage(video, 0, 0);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.style.cssText = 'position:absolute;left:-10000px;top:0;width:1px;height:1px';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const part = { x: Math.round(width * 0.28), y: Math.round(height * 0.05), w: Math.round(width * 0.45), h: Math.round(height * 0.9) };
    const draw = () => {
      ctx.drawImage(still, 0, 0);
      ctx.drawImage(video, part.x, part.y, part.w, part.h, part.x, part.y, part.w, part.h);
    };
    draw();
    const timer = setInterval(draw, 40);
    const stream = canvas.captureStream(25);
    for (const track of real.getAudioTracks()) stream.addTrack(track);
    const [shown] = stream.getVideoTracks();
    const stop = shown.stop.bind(shown);
    shown.stop = () => {
      clearInterval(timer);
      stop();
      camera.stop();
    };
    return stream;
  };
}

/** Says the browser allows SafeOS's notifications, as a person's browser does once asked. */
function notificationsAllowed() {
  if (typeof Notification !== 'undefined') {
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' });
  }
}

/** A device that finished setup with `settings`; `answered` says whether it answered the notice. */
async function seededContext(browser, { size, look, settings, answered = true, before = [] }) {
  const context = await browser.newContext({
    viewport: size,
    deviceScaleFactor: SCALE,
    colorScheme: look,
    reducedMotion: 'reduce',
    permissions: ['camera', 'microphone', 'notifications'],
  });
  await context.addInitScript(({ settings, answered }) => {
    if (localStorage.getItem('safeos-capture-seeded')) return;
    localStorage.setItem('safeos-capture-seeded', 'true');
    localStorage.setItem('safeos-onboarding', JSON.stringify({ state: {
      isComplete: true, selectedScenario: 'pet',
      acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
    }, version: 0 }));
    localStorage.setItem('guardian-onboarding-complete', 'true');
    localStorage.setItem('safeos-settings', JSON.stringify({ state: settings, version: 0 }));
    localStorage.setItem('safeos-notification-prompt-dismissed', String(Date.now()));
    localStorage.setItem('safeos-pwa-prompt-dismissed', String(Date.now()));
    if (answered) {
      localStorage.setItem('safeos-alert-pictures', JSON.stringify({ state: {
        keep: true, deleteAfterDays: 3, noticeAnswered: true, inNotifications: false,
      }, version: 0 }));
    }
  }, { settings, answered });
  for (const script of before) await context.addInitScript(script);
  return context;
}

const startKey = (page) => page.getByRole('button', { name: 'Start Monitoring', exact: true });
const stopKey = (page) => page.getByRole('button', { name: 'Stop Monitoring', exact: true });
const cards = (page) => page.locator('[data-alert-card]');

async function startWatch(page) {
  await startKey(page).click({ timeout: 60_000 });
  await page.getByText('LIVE', { exact: true }).waitFor({ timeout: 30_000 });
}

/** Waits until `count` cards hold a picture whose lead line matches `lead`. */
async function waitForCards(page, lead, count) {
  await page.waitForFunction(({ source, count }) => {
    const pattern = new RegExp(source);
    const shown = [...document.querySelectorAll('[data-alert-card]')].filter((card) => {
      const line = card.querySelector('[data-lead]');
      return line && pattern.test((line.textContent || '').trim()) && card.querySelector('.alert-picture[data-status="shown"] img');
    });
    return shown.length >= count;
  }, { source: lead.source, count }, { timeout: 120_000, polling: 250 });
}

/**
 * Waits until every picture inside `locator` has loaded. A picture that fails
 * to load, or has not loaded in five seconds, fails the state, naming it.
 */
async function picturesLoaded(locator) {
  const broken = await locator.evaluate((root) => Promise.all([...root.querySelectorAll('img')].map((img) => {
    const loaded = () => img.complete && img.naturalWidth > 0;
    if (loaded()) return null;
    return new Promise((resolve) => {
      const settle = () => resolve(loaded() ? null : img.getAttribute('alt') || img.currentSrc || 'a picture');
      img.addEventListener('load', settle, { once: true });
      img.addEventListener('error', settle, { once: true });
      setTimeout(settle, 5_000);
    });
  })).then((names) => names.filter(Boolean)));
  if (broken.length > 0) throw new Error(`pictures that did not load: ${broken.join('; ')}`);
}

const saved = [];
const failed = [];

async function capture(name, size, look, locator) {
  await locator.waitFor({ state: 'visible', timeout: 30_000 });
  await picturesLoaded(locator);
  await locator.scrollIntoViewIfNeeded();
  // The page's fixed and sticky bars (the header, the phone's bottom bar) are hidden while the
  // state is saved, so none stands over it; the state's own panel is left as it is.
  await locator.evaluate((target) => {
    for (const el of document.querySelectorAll('body *')) {
      if (el === target || el.contains(target) || target.contains(el)) continue;
      const position = getComputedStyle(el).position;
      if (position === 'fixed' || position === 'sticky') {
        el.setAttribute('data-capture-hidden', '');
        el.style.setProperty('visibility', 'hidden', 'important');
      }
    }
  });
  const file = `alert-${name}-${size.width}-${look}.png`;
  try {
    await locator.screenshot({ path: path.join(outDir, file), animations: 'disabled' });
  } finally {
    await locator.page().evaluate(() => {
      for (const el of document.querySelectorAll('[data-capture-hidden]')) {
        el.style.removeProperty('visibility');
        el.removeAttribute('data-capture-hidden');
      }
    });
  }
  saved.push(file);
  console.log(`saved ${file}`);
}

/**
 * Saves a panel that scrolls inside itself whole: the window is made as tall
 * as the panel's content for the picture, then set back.
 */
async function captureWhole(name, size, look, locator) {
  await locator.waitFor({ state: 'visible', timeout: 30_000 });
  await picturesLoaded(locator);
  const hidden = await locator.evaluate((panel) => {
    let most = 0;
    for (const el of [panel, ...panel.querySelectorAll('*')]) {
      if (!/(auto|scroll)/.test(getComputedStyle(el).overflowY)) continue;
      most = Math.max(most, el.scrollHeight - el.clientHeight);
    }
    return Math.ceil(most);
  });
  const page = locator.page();
  if (hidden > 0) await page.setViewportSize({ width: size.width, height: size.height + hidden });
  try {
    await capture(name, size, look, locator);
  } finally {
    if (hidden > 0) await page.setViewportSize({ width: size.width, height: size.height });
  }
}

/** Runs one state; a state that cannot be reached is named and the run goes on to the next. */
async function state(names, size, look, run) {
  try {
    await run();
  } catch (error) {
    for (const name of names) failed.push(`${name} at ${size.width} px, ${look}: ${String(error?.message || error).split('\n')[0]}`);
  }
}

// =============================================================================
// The states
// =============================================================================

/** Motion alerts: the live box, three cards, the opened picture, the watch's group, History, Settings, Data on this device. */
async function motionStates(browser, size, look) {
  const context = await seededContext(browser, { size, look, settings: PART_MOTION, before: [clipInOnePart] });
  const page = await context.newPage();
  try {
    await state(['live-box', 'card', 'opened', 'watch-group'], size, look, async () => {
      await page.goto(address('/monitor/'), { waitUntil: 'networkidle', timeout: 60_000 });
      await startWatch(page);
      await waitForCards(page, MOTION_CARD, 1);
      // The box stands on the live picture for 10 seconds from the alert.
      const box = page.locator('.alert-live__box');
      await box.waitFor({ state: 'visible', timeout: 8_000 });
      await capture('live-box', size, look, page.locator('.alert-live').locator('xpath=..'));

      // Each start is a new event on a new card: three cards, the newest large.
      for (let count = 2; count <= 3; count++) {
        await stopKey(page).click();
        await startWatch(page);
        await waitForCards(page, MOTION_CARD, count);
      }
      await stopKey(page).click();
      await capture('card', size, look, page.locator('.alert-card-list'));

      await cards(page).first().getByRole('button', { name: /^Open picture: / }).click();
      const dialog = page.locator('[role="dialog"].alert-picture-dialog');
      // On a phone the dialog scrolls inside itself: it is saved whole, its keys included.
      await captureWhole('opened', size, look, dialog);
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached', timeout: 10_000 });

      const head = page.getByRole('button', { name: /^Alert pictures/ });
      if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
      await page.getByRole('group', { name: 'Alert pictures', exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
      // The watch's section, its heading row included.
      await capture('watch-group', size, look, head.locator('xpath=..'));
    });

    await state(['history'], size, look, async () => {
      await page.goto(address('/history/'), { waitUntil: 'networkidle', timeout: 60_000 });
      await page.locator('[data-history-row] .alert-picture[data-status="shown"] img').first().waitFor({ timeout: 30_000 });
      await capture('history', size, look, page.locator('[role="list"]').filter({ has: page.locator('[data-history-row]') }).first());
    });

    await state(['settings-group'], size, look, async () => {
      await page.goto(address('/settings/detection/'), { waitUntil: 'networkidle', timeout: 60_000 });
      await capture('settings-group', size, look, page.getByRole('group', { name: 'Alert pictures', exact: true }));
    });

    await state(['data-count'], size, look, async () => {
      await page.goto(address('/settings/data/'), { waitUntil: 'networkidle', timeout: 60_000 });
      // The three alerts' pictures stand among the saved pictures the page counts.
      const head = page.locator('.set-head').filter({ has: page.getByRole('heading', { level: 1, name: 'Data on this device', exact: true }) });
      await head.getByText(/\b3 saved pictures\b/).waitFor({ timeout: 30_000 });
      await capture('data-count', size, look, head);
    });

  } finally {
    await context.close();
  }
}

/** Show the picture in alert notifications, in a browser that allows SafeOS's notifications. */
async function notificationState(browser, size, look) {
  const context = await seededContext(browser, { size, look, settings: MOTION_ONLY, before: [notificationsAllowed] });
  const page = await context.newPage();
  try {
    await state(['notification-setting'], size, look, async () => {
      await page.goto(address('/settings/notifications/'), { waitUntil: 'networkidle', timeout: 60_000 });
      const row = page.locator('[data-notification-picture-row]');
      await row.getByRole('switch').and(page.locator(':not([aria-disabled="true"])')).waitFor({ timeout: 10_000 });
      await capture('notification-setting', size, look, row);
    });
  } finally {
    await context.close();
  }
}

/** A Sound alert's card. */
async function soundState(browser, size, look) {
  const context = await seededContext(browser, { size, look, settings: SOUND_ONLY });
  const page = await context.newPage();
  try {
    await state(['sound-card'], size, look, async () => {
      await page.goto(address('/monitor/'), { waitUntil: 'networkidle', timeout: 60_000 });
      await startWatch(page);
      await waitForCards(page, SOUND_CARD, 1);
      await stopKey(page).click();
      await capture('sound-card', size, look, cards(page).first());
    });
  } finally {
    await context.close();
  }
}

/** While `window.__refusePictureSaves` is true, the browser refuses to save a picture: its save fails. */
function refusePictureSaves() {
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, ...rest) {
    if (window.__refusePictureSaves && this.name === 'alert_picture' && value && value.state === 'kept') {
      throw new DOMException('the capture refuses this picture save', 'UnknownError');
    }
    return put.call(this, value, ...rest);
  };
}

const SAVE_FAILED_LINE = 'This picture could not be saved on this device. It shows here until you reload.';

/** A picture this device could not save, moved down the list by a newer alert: its line stays with it. */
async function failedSaveState(browser, size, look) {
  const context = await seededContext(browser, { size, look, settings: PART_MOTION, before: [clipInOnePart, refusePictureSaves] });
  const page = await context.newPage();
  try {
    await state(['card-failed'], size, look, async () => {
      await page.goto(address('/monitor/'), { waitUntil: 'networkidle', timeout: 60_000 });
      for (let count = 1; count <= 3; count++) {
        // The second alert's picture is not saved.
        await page.evaluate((refuse) => { window.__refusePictureSaves = refuse; }, count === 2);
        await startWatch(page);
        await waitForCards(page, MOTION_CARD, count);
        if (count === 2) await cards(page).first().getByText(SAVE_FAILED_LINE, { exact: true }).waitFor({ timeout: 30_000 });
        await stopKey(page).click();
      }
      const moved = cards(page).nth(1);
      await moved.locator('.alert-picture[data-form="small"]').waitFor({ timeout: 30_000 });
      await moved.getByText(SAVE_FAILED_LINE, { exact: true }).waitFor({ timeout: 30_000 });
      await capture('card-failed', size, look, page.locator('.alert-card-list'));
    });
  } finally {
    await context.close();
  }
}

/** The notice before a device's first watch. */
async function noticeState(browser, size, look) {
  const context = await seededContext(browser, { size, look, settings: MOTION_ONLY, answered: false });
  const page = await context.newPage();
  try {
    await state(['notice'], size, look, async () => {
      await page.goto(address('/monitor/'), { waitUntil: 'networkidle', timeout: 60_000 });
      await startKey(page).click({ timeout: 60_000 });
      await capture('notice', size, look, page.getByRole('dialog', { name: 'Each alert keeps a picture', exact: true }));
    });
  } finally {
    await context.close();
  }
}

/** The notice's choice in setup's camera step, on a first visit that has not finished setup. */
async function setupChoiceState(browser, size, look) {
  const context = await browser.newContext({
    viewport: size,
    deviceScaleFactor: SCALE,
    colorScheme: look,
    reducedMotion: 'reduce',
    permissions: ['camera', 'microphone'],
  });
  await context.addInitScript(() => {
    localStorage.setItem('safeos-notification-prompt-dismissed', String(Date.now()));
    localStorage.setItem('safeos-pwa-prompt-dismissed', String(Date.now()));
  });
  const page = await context.newPage();
  try {
    await state(['setup-choice'], size, look, async () => {
      await page.goto(address('/setup/'), { waitUntil: 'networkidle', timeout: 60_000 });
      await page.getByRole('button', { name: /Begin Setup/ }).click({ timeout: 60_000 });
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: /Accept & Continue/ }).click();
      await page.getByRole('button', { name: /Pet Monitoring/ }).click();
      await page.getByRole('heading', { name: 'Device Access' }).waitFor({ timeout: 30_000 });
      await capture('setup-choice', size, look, page.getByRole('group', { name: 'Each alert keeps a picture', exact: true }));
    });
  } finally {
    await context.close();
  }
}

/** A Lost and Found sighting of the striped pet, on a browser whose camera plays the stripes. */
async function sightingState(browser, size, look) {
  const context = await seededContext(browser, { size, look, settings: SIGHTINGS_ONLY });
  const page = await context.newPage();
  try {
    await state(['sighting'], size, look, async () => {
      await page.goto(address('/lost-found/'), { waitUntil: 'networkidle', timeout: 60_000 });
      await page.getByText('Add New Subject to Watch').click();
      await page.getByText('What are you looking for?').waitFor({ timeout: 30_000 });
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.getByPlaceholder('e.g., Max, Luna, Dad').fill('Stripes');
      await page.locator('input[type="file"]').setInputFiles({ name: 'stripes.png', mimeType: 'image/png', buffer: await stripedPhoto(page) });
      const next = page.getByRole('button', { name: 'Continue', exact: true });
      await next.click();
      await page.getByRole('button', { name: 'Start Watching', exact: true }).click();
      await page.getByRole('button', { name: 'Start Monitoring' }).click({ timeout: 60_000 });
      await page.waitForURL(/\/monitor\/?$/, { timeout: 60_000 });
      await startWatch(page);
      const card = cards(page).filter({ hasText: QUESTION }).first();
      await card.waitFor({ timeout: 120_000 });
      await card.locator('.alert-picture[data-status="shown"] img').first().waitFor({ timeout: 30_000 });
      await stopKey(page).click();
      await capture('sighting', size, look, card);
    });
    await state(['dashboard-sighting'], size, look, async () => {
      // The app's Dashboard in the same visit: Since you last looked lists the sighting as Lost
      // and Found's, with its kept picture.
      await page.locator('nav[aria-label="App"]:visible').getByRole('link', { name: 'Dashboard', exact: true }).first().click();
      await page.waitForURL(/\/dashboard\/?$/, { timeout: 60_000 });
      const since = page.getByRole('region', { name: 'Since you last looked' });
      await since.getByRole('link', { name: /^Colours like Stripes['’]s at / }).locator('img').waitFor({ timeout: 30_000 });
      await capture('dashboard-sighting', size, look, since);
    });
  } finally {
    await context.close();
  }
}

// =============================================================================
// The run
// =============================================================================

await mkdir(outDir, { recursive: true });
const clipArgs = (video) => [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  `--use-file-for-fake-video-capture=${path.resolve(video)}`,
  `--use-file-for-fake-audio-capture=${path.resolve(audioFile)}`,
  '--autoplay-policy=no-user-gesture-required',
];

const clipBrowser = await chromium.launch({ args: clipArgs(videoFile) });
try {
  for (const look of LOOKS) {
    for (const size of SIZES) {
      await motionStates(clipBrowser, size, look);
      await notificationState(clipBrowser, size, look);
      await soundState(clipBrowser, size, look);
      await failedSaveState(clipBrowser, size, look);
      await noticeState(clipBrowser, size, look);
      await setupChoiceState(clipBrowser, size, look);
    }
  }
} finally {
  await clipBrowser.close();
}

const stripesFile = path.join(await mkdtemp(path.join(tmpdir(), 'alert-captures-')), 'stripes.y4m');
await writeFile(stripesFile, stripedClip());
const stripesBrowser = await chromium.launch({ args: clipArgs(stripesFile) });
try {
  for (const look of LOOKS) {
    for (const size of SIZES) await sightingState(stripesBrowser, size, look);
  }
} finally {
  await stripesBrowser.close();
}

console.log(`${saved.length} pictures saved to ${outDir}`);
if (failed.length > 0) {
  for (const line of failed) console.error(`could not reach ${line}`);
  process.exit(1);
}
