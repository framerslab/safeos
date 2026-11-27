import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { recordingSettings as settings } from './home-run-seed.mjs';
import { enrol } from './lost-found-walk.mjs';

export const omittedRuns = [
  { id: 'alert', reason: 'Requires a garden recording with a kept movement picture and its close-up.' },
];

const SECOND = 1000;
const WATCH = '/monitor/';
const CAMERA = '.watch-frame__picture video';
const MOTION_WALK = { from: 25.2, to: 26.8 };
const KITTEN_FACES_CAMERA = { from: 22, to: 25.25 };
const ALERT_HOLD_SECONDS = 2.5;
const WATCH_CLIP_START = 20;
const WATCH_POSTER_AT = 22.25;
// Lost and Found: Toffee is enrolled from photo 1 alone, the photo taken on
// another day. Photos 2 and 3 are stills from the recording the clip comes
// from, so they would compare the clip with itself.
const PET = 'Toffee';
const LOST_FOUND_PHOTOS = ['home/lost-found/photo-1.jpg'];
const LOST_FOUND_START_AT = 2;
const LOST_FOUND_HOLD_AT = 5;
const between = (value, { from, to }) => value >= from && value <= to;
const pose = (page, name) => page.getByRole('button', { name, exact: true });

async function open(page, baseUrl, route) {
  const response = await page.goto(new URL(route, baseUrl).href, { waitUntil: 'load' });
  assert.ok(response?.ok(), `${route} returned ${response?.status()}`);
  await page.waitForFunction(() => document.documentElement.dataset.appStarted === 'true');
  await page.evaluate(() => document.fonts.ready.then(() => {}));
}

async function openWatch(page, baseUrl) {
  await open(page, baseUrl, WATCH);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('safeos-settings')).state);
  assert.equal(saved.activePresetId, 'custom', 'Expected the Custom preset');
  assert.equal(saved.globalSettings.pixelDetectionEnabled, false, 'Expected picture change off on the sample clip');
  await pose(page, 'Start watching').waitFor();
}

// The page and DevTools use the same wall-clock time base.
export const browserTime = (page) => page.evaluate(() => (performance.timeOrigin + performance.now()) / 1000);

function sleepUntil(page, start, offset) {
  return page.evaluate(({ start, offset }) => new Promise((resolve) => {
    const delay = (start + offset) * 1000 - (performance.timeOrigin + performance.now());
    setTimeout(resolve, Math.max(0, delay));
  }), { start, offset });
}

async function markStart(page) {
  await page.evaluate(() => {
    document.addEventListener('click', (event) => {
      if (event.target.closest('button')?.textContent.trim() === 'Start watching') {
        window.homeWatchClick = (performance.timeOrigin + performance.now()) / 1000;
      }
    }, { capture: true });
  });
  await pose(page, 'Start watching').click();
  const at = await page.evaluate(() => window.homeWatchClick);
  assert.ok(at, 'Start watching did not receive a click');
  return at;
}

function watchEvent(page, kind) {
  return page.locator(`.watch-list__body [data-alert-card][data-kind="${kind}"]`).first();
}

function trackWatchAlerts(page, offset = 0) {
  return page.evaluate(({ offset, camera }) => {
    const watch = document.querySelector('.watch-list__body');
    if (!watch) throw Error('The watch has no alert list');
    window.homeWatchEvents = [];
    const seen = new Set();
    const observer = new MutationObserver(() => {
      const clipAt = document.querySelector(camera)?.currentTime + offset;
      if (!Number.isFinite(clipAt)) return;
      for (const card of watch.querySelectorAll('[data-alert-card][data-kind][data-alert-at]')) {
        const { kind, alertAt: at } = card.dataset;
        const identity = kind + ':' + at;
        if (seen.has(identity)) continue;
        seen.add(identity);
        window.homeWatchEvents.push({
          kind, at, clipAt,
          observedAt: (performance.timeOrigin + performance.now()) / 1000,
        });
      }
    });
    observer.observe(watch, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-alert-at'] });
  }, { offset, camera: CAMERA });
}

function alertCard(page, { kind, at }) {
  return page.locator(`.watch-list__body [data-alert-card][data-kind="${kind}"][data-alert-at="${at}"]`);
}

async function readPicture(picture, timeout = 3000) {
  await picture.waitFor({ state: 'visible', timeout });
  await picture.evaluate((image) => image.decode());
  assert.match(await picture.getAttribute('src'), /^blob:/, 'Expected the alert’s own saved picture');
}

async function prepareDashboard({ page, baseUrl }) {
  await openWatch(page, baseUrl);
  await trackWatchAlerts(page);
  await markStart(page);
  await pose(page, 'Stop watching').waitFor({ timeout: 15 * SECOND });
  await pose(page, 'Show settings').click();
  const tune = page.getByRole('button', { name: /Fine-Tune Settings|Hide Fine-Tuning/ });
  const watchSettings = page.locator('#watch-settings > div').filter({ has: tune });
  await tune.click();
  const sensitivity = watchSettings.getByText('Motion Sensitivity', { exact: true })
    .locator('xpath=../..').getByRole('slider');
  assert.equal(await sensitivity.inputValue(), '0', 'The Dashboard watch starts with Motion at its least sensitive setting');
  await watchEvent(page, 'sound').waitFor({ timeout: 20 * SECOND });
  await page.waitForFunction((camera) => document.querySelector(camera)?.currentTime >= 22, CAMERA, { timeout: 20 * SECOND });
  await sensitivity.fill('97');
  await page.waitForFunction(() => window.homeWatchEvents.some(({ kind }) => kind === 'motion'),
    null, { timeout: 3200 }).catch(() => {});
  const events = await page.evaluate(() => window.homeWatchEvents);
  const latestMotion = events.findLast(({ kind }) => kind === 'motion');
  assert.ok(latestMotion && between(latestMotion.clipAt, KITTEN_FACES_CAMERA),
    'The kept movement picture must show the kitten’s face: ' + JSON.stringify(events));
  assert.ok(events.some(({ kind, clipAt }) => kind === 'sound' && clipAt >= 5.5 && clipAt <= 10),
    'No recorded sound alert during the bark');
  console.log(`Dashboard saved the movement picture at clip ${latestMotion.clipAt.toFixed(3)} s`);
  await pose(page, 'Stop watching').click();
  await pose(page, 'Start watching').waitFor();
  const openPicture = alertCard(page, latestMotion).locator('[data-open-picture]');
  const alertId = await openPicture.getAttribute('data-open-picture', { timeout: 3000 });
  assert.ok(alertId, 'The movement alert has no picture to open');
  const notices = await page.evaluate(() => window.homeRunNotifications);
  assert.ok(notices?.length, 'The watch saved alerts without a recorded notification');
  await open(page, baseUrl, '/dashboard/');
  await page.getByRole('heading', { name: 'Not watching', exact: true }).waitFor();
  await page.locator('.dash-new').getByText(/new alerts? since you last looked/).waitFor();
  await pose(page, 'Start watching').waitFor();
  const ways = page.getByRole('region', { name: 'Ways to watch' });
  assert.equal(await ways.getByRole('link').count(), 4, 'Expected all four ways to watch');
  const since = page.getByRole('region', { name: 'Since you last looked' });
  const motion = since.getByRole('link', { name: /Movement at/ }).first();
  await motion.waitFor();
  await readPicture(motion.locator('img'));
  await since.getByRole('link', { name: /Sound at/ }).first().waitFor();
  return { notices, events, alertId };
}

async function viewingTop(page, selector) {
  return page.evaluate((selector) => {
    const subject = document.querySelector(selector);
    if (!subject) throw Error(`Missing recording subject ${selector}`);
    return subject.getBoundingClientRect().top + scrollY;
  }, selector);
}

async function placeDashboard(page, top, height) {
  await page.mouse.move(0, 0);
  return page.evaluate(async ({ top, height }) => {
    const box = (selector) => document.querySelector(selector).getBoundingClientRect();
    const alerts = box('.since');
    const ways = box('.ways');
    const footer = box('.app-shell__footer');
    const bar = box('.phone-bar');
    const first = Math.ceil(Math.max(ways.bottom, alerts.bottom - height) + scrollY);
    const last = Math.floor(Math.min(alerts.top, footer.top - height) + scrollY);
    if (first > last || (bar.height && top + height > bar.top)) {
      throw Error('The Dashboard alerts do not fit between the watch links and the app footer');
    }
    const center = Math.round((alerts.top + alerts.bottom - height) / 2 + scrollY);
    const crop = Math.min(last, Math.max(first, center));
    window.scrollTo({ top: crop - top, behavior: 'instant' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (Math.abs(scrollY - (crop - top)) > 0.5) throw Error('The Dashboard crop did not reach the alert list');
    return top;
  }, { top, height });
}

export async function placeSubject(page, recipe, view, height) {
  const header = await page.locator('.app-header').first().boundingBox();
  const headerBottom = Math.ceil(header ? header.y + header.height : 0);
  if (recipe.id === 'dashboard') return placeDashboard(page, headerBottom + 8, height);
  if (recipe.id === 'lost-found') {
    // The crop starts under the fixed header, below its scroll shadow, with Watch for at its top.
    const cropTop = headerBottom + 4;
    const top = await viewingTop(page, recipe.anchor);
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.max(0, top - cropTop - 8));
    return cropTop;
  }

  const anchor = recipe.anchor;
  const top = await viewingTop(page, anchor);
  if (recipe.id === 'watching' || view.size === 'wide') {
    // Leave room below the fixed header’s scroll shadow.
    const cropTop = recipe.id === 'watching' ? headerBottom + 4 : 0;
    const target = Math.max(headerBottom + 4, cropTop + 3);
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.max(0, top - target));
    return cropTop;
  }

  const box = await page.locator(anchor).first().boundingBox();
  const footer = await page.locator('.phone-bar').first().boundingBox();
  const maxTop = Math.floor(Math.min(view.height, footer?.y ?? view.height) - height);
  const visibleTop = Math.min(maxTop, Math.max(headerBottom, Math.floor(box.y - 6)));
  if (box.y - 6 > maxTop) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), top - visibleTop - 6);
  }
  return Math.round(visibleTop);
}

async function scrollSubject(page, selector, top, seconds, edge = 'start', frameHeight = 0) {
  return page.evaluate(({ selector, top, seconds, edge, frameHeight }) => {
    const subject = document.querySelector(selector);
    if (!subject) throw Error(`Missing scroll destination ${selector}`);
    const box = subject.getBoundingClientRect();
    const start = scrollY;
    const desired = edge === 'end' ? start + box.bottom - top - frameHeight : start + box.top - top;
    const target = Math.min(document.scrollingElement.scrollHeight - innerHeight, Math.max(0, desired));
    return new Promise((resolve) => {
      const began = performance.now();
      const tick = (now) => {
        const progress = seconds === 0 ? 1 : Math.min(1, (now - began) / (seconds * 1000));
        window.scrollTo({ top: start + (target - start) * progress, behavior: 'instant' });
        if (progress < 1) requestAnimationFrame(tick);
        else resolve({ from: start, to: scrollY, target });
      };
      requestAnimationFrame(tick);
    });
  }, { selector, top, seconds, edge, frameHeight });
}

function fits(box, { x, y, width, height }) {
  return box && box.x >= x - 0.5 && box.x + box.width <= x + width + 0.5
    && box.y >= y - 0.5 && box.y + box.height <= y + height + 0.5;
}

// Move a held page by the fewest CSS pixels so that no visible line of words
// crosses the crop's top or bottom edge, keeping the named parts inside it.
// With shrink, a part (the opened picture) may also narrow step by step until
// such a position exists. The search runs in one task, so no in-between
// position or size is ever painted.
async function settleEdges(page, crop, keep, { scroller = null, shrink = null, controls: whole = true } = {}) {
  const settled = await page.evaluate(({ crop, keep, scroller, shrink, whole }) => {
    const box = scroller ? document.querySelector(scroller) : document.scrollingElement;
    if (!box) throw Error(`Missing scrolling part ${scroller}`);
    const from = box.scrollTop;
    const top = crop.y;
    const bottom = crop.y + crop.height;
    const words = [];
    // A scrolling panel moves only its own words; the page behind it stays put.
    const walker = document.createTreeWalker(scroller ? box : document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || parent.closest('script, style, [hidden], template, noscript, .sr-only')) continue;
      const style = getComputedStyle(parent);
      if (style.visibility !== 'visible' || style.opacity === '0') continue;
      for (const word of node.textContent.matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(node, word.index);
        range.setEnd(node, word.index + word[0].length);
        words.push({ range, parent, word: word[0] });
      }
    }
    // A key or a switch cut at the edge reads as broken as a cut word.
    const controls = !whole ? [] : [...(scroller ? box : document.body).querySelectorAll(
      'button, a[href], input, select, textarea, [role="switch"], [role="button"]',
    )].filter((control) => getComputedStyle(control).visibility === 'visible');
    const parts = keep.map((selector) => {
      const part = document.querySelector(selector);
      if (!part) throw Error(`Missing held part ${selector}`);
      return part;
    });
    const crossing = () => {
      for (const part of parts) {
        const rect = part.getBoundingClientRect();
        if (rect.top < top - 0.5 || rect.bottom > bottom + 0.5) return 'part';
      }
      for (const control of controls) {
        const rect = control.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.right <= crop.x || rect.left >= crop.x + crop.width) continue;
        for (const edge of [top, bottom]) {
          if (rect.top >= edge - 0.5 || rect.bottom <= edge + 0.5) continue;
          const y = edge === top ? (top + Math.min(bottom, rect.bottom)) / 2 : (Math.max(top, rect.top) + bottom) / 2;
          const hit = document.elementFromPoint(Math.min(crop.x + crop.width - 0.1, Math.max(crop.x + 0.1, rect.left + rect.width / 2)), y);
          if (hit && (control.contains(hit) || hit.contains(control))) return control.getAttribute('aria-label') || control.textContent.trim() || control.tagName;
        }
      }
      for (const { range, parent, word } of words) {
        for (const rect of range.getClientRects()) {
          if (!rect.width || !rect.height || rect.right <= crop.x || rect.left >= crop.x + crop.width) continue;
          for (const edge of [top, bottom]) {
            if (rect.top >= edge - 0.5 || rect.bottom <= edge + 0.5) continue;
            const y = edge === top ? (top + Math.min(bottom, rect.bottom)) / 2 : (Math.max(top, rect.top) + bottom) / 2;
            const hit = document.elementFromPoint(Math.min(crop.x + crop.width - 0.1, Math.max(crop.x + 0.1, rect.left + rect.width / 2)), y);
            if (hit && (parent.contains(hit) || hit.contains(parent))) return word;
          }
        }
      }
      return null;
    };
    const narrowed = shrink && document.querySelector(shrink.selector);
    if (shrink && !narrowed) throw Error(`Missing part to narrow ${shrink.selector}`);
    const widths = [null];
    if (narrowed) {
      const full = narrowed.getBoundingClientRect().width;
      for (let width = Math.floor(full) - 8; width >= full * shrink.least; width -= 8) widths.push(width);
    }
    for (const width of widths) {
      if (width !== null) narrowed.style.maxWidth = `${width}px`;
      const max = box.scrollHeight - box.clientHeight;
      for (let step = 0; step <= 160; step += 1) {
        for (const to of step ? [from - step, from + step] : [from]) {
          if (to < 0 || to > max) continue;
          // The page asks for smooth scrolling; a held frame must not glide.
          box.scrollTo({ top: to, behavior: 'instant' });
          if (Math.abs(box.scrollTop - to) > 0.5) continue;
          if (!crossing()) return { from, to, width };
        }
      }
    }
    if (narrowed) narrowed.style.maxWidth = '';
    box.scrollTo({ top: from, behavior: 'instant' });
    return { from, to: null, word: crossing() };
  }, { crop, keep, scroller, shrink, whole });
  assert.ok(settled.to !== null,
    `No position within 160 px keeps every word whole at the crop's edges: ${JSON.stringify({ ...settled, keep })}`);
  if (settled.to !== settled.from || settled.width) console.log(`Held page settled: ${JSON.stringify(settled)}`);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return settled;
}

// Wait for a screencast frame painted at or after a moment. A page that stops
// changing sends none, so its held state is then read by a screenshot.
async function frameAfter(page, { nextFrameAfter, captureFrame }, at) {
  const frame = await nextFrameAfter(at);
  if (frame) return frame;
  return captureFrame(await browserTime(page));
}

async function holdThrough(page, end, check) {
  for (let at = await browserTime(page); at < end; at = await browserTime(page)) {
    await check();
    await sleepUntil(page, Math.min(at + 0.12, end), 0);
  }
  await check();
}

async function dashboard({ page, crop, view, prepared, sample, whole, nextFrameAfter, captureFrame }) {
  const since = page.getByRole('region', { name: 'Since you last looked' });
  const motion = since.getByRole('link', { name: /Movement at/ }).first();
  const sound = since.getByRole('link', { name: /Sound at/ }).first();
  for (const subject of [since.getByRole('heading'), motion, motion.locator('img'), sound]) {
    assert.ok(fits(await subject.boundingBox(), crop),
      'The Dashboard recording must hold the heading, both alerts and the movement picture: ' + subject);
  }
  const start = await browserTime(page);
  const words = await sample();
  await sleepUntil(page, start, 2);
  const event = await browserTime(page);
  await motion.click();
  await page.waitForURL((url) => url.pathname === '/history/');
  // Fit the complete saved camera frame inside the capture of History's picture viewer.
  // The phone panel fills the screen from its top, above the recording's crop,
  // so its title starts at the crop's top, as on a screen of that height.
  await page.addStyleTag({ content: `
    .alert-picture-dialog { padding-top: ${crop.y + 16}px; }
    .alert-picture-dialog__picture .alert-picture__frame {
      max-width: ${Math.floor((crop.y + crop.height - 108) * 4 / 3)}px;
      margin-inline: auto;
    }
  ` });
  const openPicture = `[data-open-picture=${JSON.stringify(prepared.alertId)}]`;
  await page.locator(openPicture).waitFor();
  await scrollSubject(page, `.alert-history-row:has(${openPicture})`, crop.y + 8, 0);
  await page.locator(openPicture).click();
  const picture = page.getByRole('dialog').locator('.alert-picture-dialog__picture img');
  await readPicture(picture);
  await settleEdges(page, crop, ['.alert-picture-dialog__picture img'], {
    scroller: '.alert-picture-dialog',
    shrink: { selector: '.alert-picture-dialog__picture .alert-picture__frame', least: 0.6 },
  });
  assert.ok(fits(await picture.boundingBox(), crop), 'The Dashboard alert picture does not fit the recording');
  const pictureAt = await frameAfter(page, { nextFrameAfter, captureFrame }, await browserTime(page));
  const end = start + view.seconds;
  assert.ok(end - pictureAt >= 3.5, 'The Dashboard must hold the opened picture through the end');
  await holdThrough(page, end, async () => {
    assert.ok(fits(await picture.boundingBox(), crop), 'The Dashboard alert picture left the frame');
    await whole('The opened Dashboard picture');
  });
  return {
    start, end, poster: start, event, words, pictureAt,
    notices: prepared.notices, watchEvents: prepared.events,
  };
}

async function prepareWatching({ page, baseUrl, view }) {
  await openWatch(page, baseUrl);
  const height = view.size === 'square' ? view.width : view.width * 5 / 8;
  const square = view.size === 'square';
  // Fit the live camera and meters into one native capture. The home player
  // surrounds the recording with its own ticks.
  await page.addStyleTag({ content: `
    .watch-grid__frame { width: 100vw; justify-self: center; }
    .watch-frame .corner-ticks { display: none; }
    .watch-frame[data-phase="live"] .watch-frame__screen {
      height: ${square ? height - 104 : view.width * 9 / 16}px;
      max-height: none;
    }
    .watch-frame__picture video { object-fit: cover; }
    .watch-meters {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      ${square ? '' : 'padding-block: 6px;'}
    }
    .watch-meters .watch-meter:not(.watch-meter--pet):not(.watch-meter--problem) {
      grid-template-columns: ${square ? 'minmax(0, 1fr)' : 'auto minmax(0, 1fr) auto'};
      grid-template-areas: ${square ? '"name" "track" "state"' : '"name track state"'};
    }
    .watch-list .alert-picture[data-form="large"] {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
    }
    .watch-list .alert-picture[data-form="large"] > .alert-picture__notes { grid-column: 1 / -1; }
  ` });
  await trackWatchAlerts(page, WATCH_CLIP_START);
  await markStart(page);
  await pose(page, 'Stop watching').waitFor({ timeout: 4 * SECOND });
  await page.locator(CAMERA).waitFor({ state: 'visible', timeout: 4 * SECOND });
}

function readWatch(page) {
  return page.evaluate(({ camera, offset }) => {
    const motion = document.querySelector('[role="meter"][aria-label="Motion level"]');
    const sound = document.querySelector('[role="meter"][aria-label="Sound level"]');
    return {
      at: (performance.timeOrigin + performance.now()) / 1000,
      clipAt: document.querySelector(camera).currentTime + offset,
      motion: Number(motion?.getAttribute('aria-valuenow') ?? 0),
      motionOverLine: motion?.closest('.watch-meter')?.dataset.state === 'over',
      sound: Number(sound?.getAttribute('aria-valuenow') ?? 0),
      events: window.homeWatchEvents,
    };
  }, { camera: CAMERA, offset: WATCH_CLIP_START });
}

async function watching({ page, crop, view, sample, whole, nextFrameAfter, captureFrame }) {
  const camera = page.locator(CAMERA).first();
  const cameraBox = await camera.boundingBox();
  const meters = await page.locator('.watch-meters').boundingBox();
  assert.ok(cameraBox && Math.abs(cameraBox.x - crop.x) <= 0.5
    && Math.abs(cameraBox.width - crop.width) <= 0.5 && fits(cameraBox, crop) && fits(meters, crop),
    `Watching must frame the full-width camera and both meters: ${JSON.stringify({ cameraBox, meters, crop })}`);
  assert.equal(await camera.evaluate((element) => getComputedStyle(element).objectFit), 'cover');
  const size = await camera.evaluate(({ videoWidth, videoHeight }) => ({ videoWidth, videoHeight }));
  assert.ok(size.videoWidth > 0 && cameraBox.height >= cameraBox.width * size.videoHeight / size.videoWidth - 0.5,
    `The Watching poster cuts off the camera picture vertically: ${JSON.stringify({ cameraBox, size })}`);
  assert.equal(await page.locator('.watch-frame .corner-ticks').isVisible(), false, 'The watch’s ticks show inside the home recording');

  await page.waitForFunction(({ camera, offset }) => document.querySelector(camera).currentTime + offset >= 22,
    { camera: CAMERA, offset: WATCH_CLIP_START });
  const first = await readWatch(page);
  assert.ok(first.clipAt < 22.75, 'The Watching recording missed the start of the kitten’s face window');
  const start = first.at;
  const end = start + view.seconds;
  const peaks = { motion: 0, sound: 0 };
  const line = 100 - settings.globalSettings.motionSensitivity;
  let poster;
  let posterReading;
  let words;
  let motionOverAt;
  let arrival;
  const readings = [];
  let reading = first;
  while (reading.clipAt <= MOTION_WALK.to + 0.2 && reading.at < start + 6) {
    if (readings.at(-1)?.motion !== reading.motion) {
      readings.push({ clipAt: Number(reading.clipAt.toFixed(3)), motion: reading.motion });
    }
    peaks.motion = Math.max(peaks.motion, reading.motion);
    peaks.sound = Math.max(peaks.sound, reading.sound);
    if (!poster && reading.clipAt >= WATCH_POSTER_AT && reading.clipAt <= 25 && !reading.motionOverLine) {
      // The word boxes must describe the actual compositor frame. A meter
      // can update between a frame arriving and the page reporting its words.
      const candidate = await sample();
      const frame = await nextFrameAfter(await browserTime(page));
      if (frame && frame - reading.at <= 25 - reading.clipAt) {
        const confirmed = await sample();
        const text = (entries) => entries.map(({ word }) => word).join(' ');
        if (text(candidate) === 'Motion Quiet Sound Quiet' && text(candidate) === text(confirmed)) {
          words = candidate;
          poster = frame;
          posterReading = { clipAt: reading.clipAt + frame - reading.at };
        }
      }
    }
    if (!motionOverAt && between(reading.clipAt, MOTION_WALK)
      && reading.motionOverLine && reading.motion > line) {
      motionOverAt = await nextFrameAfter(reading.at);
    }
    arrival ??= reading.events.find(({ kind, clipAt }) => kind === 'motion' && between(clipAt, MOTION_WALK));
    if (arrival && motionOverAt) break;
    await sleepUntil(page, reading.at, 0.04);
    reading = await readWatch(page);
  }
  assert.ok(poster, 'No frame showed the kitten facing the camera in the poster window');
  assert.ok(motionOverAt, `Motion never went over its line during the walk (peak ${peaks.motion}, line ${line}): ${JSON.stringify(readings)}`);
  assert.ok(arrival, 'No motion alert arrived during the walk: ' + JSON.stringify({ readings, events: reading.events }));
  console.log(`Watching Motion peak ${peaks.motion}, line ${line}, alert at clip ${arrival.clipAt.toFixed(3)} s`);
  const alert = alertCard(page, arrival);
  const picture = alert.locator('.alert-picture__frame img').first();
  // Bring the entry into view in one scroll. Intermediate frames of a fast
  // scroll repeatedly swap the camera and the white background in the light look.
  await scrollSubject(page, '.watch-list__head', crop.y + 8, 0);
  await readPicture(picture).catch(async (cause) => {
    const cards = await page.locator('.watch-list__body [data-alert-card]').evaluateAll((cards) => cards.map((card) => ({
      ...card.dataset,
      picture: card.querySelector('.alert-picture')?.dataset.status,
    })));
    throw Error('The new motion card did not show its picture: ' + JSON.stringify(cards), { cause });
  });
  const card = `.watch-list__body [data-alert-card][data-kind="${arrival.kind}"][data-alert-at="${arrival.at}"]`;
  await settleEdges(page, crop, ['.watch-list__head', card, `${card} .alert-picture__frame img`]);
  const checkAlert = async () => {
    const heading = page.getByRole('heading', { name: 'Alerts', exact: true });
    const boxes = await Promise.all([heading, alert, picture].map((part) => part.boundingBox()));
    assert.ok(boxes.every((box) => fits(box, crop)),
      'The motion alert and its picture were not in frame: ' + JSON.stringify({ boxes, crop }));
    await whole('The held Watching alert');
  };
  await checkAlert();
  // The alert counts as shown from the first recorded frame that holds it.
  const pictureAt = await frameAfter(page, { nextFrameAfter, captureFrame }, await browserTime(page));
  assert.ok(end - pictureAt >= ALERT_HOLD_SECONDS,
    'The motion alert and its picture did not stay in frame for 2.5 seconds');
  await holdThrough(page, end, checkAlert);
  const events = await page.evaluate(() => window.homeWatchEvents);
  assert.equal(events.length, 1, 'The Watching recording must show one alert: ' + JSON.stringify(events));
  const notices = await page.evaluate(() => window.homeRunNotifications);
  assert.ok(notices.some(({ title }) => /^Motion alert/i.test(title)), 'The watch saved a motion alert without a recorded notification');
  return {
    start, end, poster, posterFrame: poster, posterReading, words,
    event: arrival.observedAt, peaks, line, motionOverAt, pictureAt,
    notices, watchEvents: events,
  };
}

async function siteSettings({ page, view, top, sample, whole, nextFrameAfter, captureFrame }) {
  const frame = { x: 0, y: top, width: view.width, height: view.size === 'square' ? view.width : view.height };
  // The first rows stand still for two seconds and give the poster. A list
  // row's box may run past an edge, as any scrolled list does; its words may not.
  await settleEdges(page, frame, [], { controls: false });
  const start = await browserTime(page);
  await sleepUntil(page, start, 1);
  const words = await sample();
  await sleepUntil(page, start, 2);
  const selector = 'nav[aria-label="Settings pages"]';
  await scrollSubject(page, selector, top, 3, 'end', view.size === 'square' ? view.width : view.height);
  await settleEdges(page, frame, [], { controls: false });
  await whole('The foot of Settings', { controls: false });
  await frameAfter(page, { nextFrameAfter, captureFrame }, await browserTime(page));
  await sleepUntil(page, start, 6);
  return { start, words, poster: start + 1, event: start + 2 };
}

async function prepareLostFound({ page, baseUrl, view }) {
  const photos = LOST_FOUND_PHOTOS.map((file) => fileURLToPath(new URL('../public/' + file, import.meta.url)));
  await enrol(page, baseUrl, { name: PET, photos });
  // The Lost & Found page opens the watch with Lost and Found and its pet.
  await page.getByRole('button', { name: 'Start Monitoring' }).first().click();
  await page.waitForURL((url) => url.pathname === WATCH, { timeout: 15 * SECOND });
  await page.waitForFunction(() => document.documentElement.dataset.appStarted === 'true');
  await page.evaluate(() => document.fonts.ready.then(() => {}));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('safeos-settings')).state);
  assert.equal(saved.activePresetId, 'custom', 'Expected the Custom preset');
  assert.equal(saved.globalSettings.motionSensitivity, 0, 'Motion starts at its least sensitive setting');
  // The run sets none of Lost and Found's own settings: the comparison runs at the app's defaults.
  const lostFound = await page.evaluate(() => JSON.parse(localStorage.getItem('safeos-lost-found') || '{}').state?.settings ?? null);
  assert.ok(!lostFound || (lostFound.minConfidenceForAlert === 70 && lostFound.processingMode === 'local'),
    'Lost and Found must compare at the app’s default settings: ' + JSON.stringify(lostFound));
  assert.equal(await page.getByRole('radio', { name: 'Lost and Found', exact: true }).isChecked(), true,
    'The watch must have Lost and Found chosen');
  const photo = page.locator('.watch-pet .watch-pet__photo').first();
  await photo.waitFor();
  await photo.evaluate((image) => image.decode());
  await pose(page, 'Start watching').waitFor();
  // Open the fake camera and microphone once and close them before the recording. The first
  // open in a new browser starts Chromium's capture service, which took up to 2.3 s on a CI
  // runner; with it running, Start watching shows the camera within the run's 1.5 seconds.
  await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    await new Promise((resolve) => video.requestVideoFrameCallback(resolve));
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  });
  if (view.size === 'wide') {
    // Set the camera's picture beside the pair and the words, so the whole entry fits the capture.
    await page.addStyleTag({ content: `
      .watch-list .alert-picture[data-kind='sighting'][data-form='large'][data-status] {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        column-gap: 16px;
      }
      .watch-list .alert-picture[data-kind='sighting'][data-form='large'] > .alert-picture__frame { grid-row: 1 / span 3; }
    ` });
  }
  await trackWatchAlerts(page);
}

async function lostFound({ page, crop, view, sample, whole, nextFrameAfter, captureFrame }) {
  // 0–2 seconds: Watch for, Lost and Found chosen, with Toffee's one saved photo.
  // The wide crop cannot hold the heading with the whole Start watching key under the pet's row,
  // so it keeps the choice, Lost and Found, and the photo, with the heading above the crop.
  await settleEdges(page, crop, view.size === 'wide'
    ? ['.watch-for__options', '.watch-pet .watch-pet__photo']
    : ['.watch-for__heading', '.watch-pet .watch-pet__photo']);
  await whole('Watch for with Toffee’s saved photo');
  const start = await browserTime(page);
  const end = start + view.seconds;

  // 2 seconds: the camera's frame comes into the crop in one step and Start watching is pressed.
  await sleepUntil(page, start, LOST_FOUND_START_AT);
  await scrollSubject(page, '.watch-frame__screen', crop.y + 4, 0);
  await settleEdges(page, crop, ['.watch-frame__screen'], { controls: false });
  await pose(page, 'Start watching').click();
  await page.locator('.watch-frame[data-phase="live"]').waitFor({ timeout: 3 * SECOND });
  const liveAt = await browserTime(page);
  assert.ok(liveAt - start <= LOST_FOUND_START_AT + 1.5, `The camera took ${(liveAt - start).toFixed(2)} s to start`);

  // 2–5 seconds: the watch compares the clip with Toffee's photo; the possible sighting arrives.
  const sightingBy = start + LOST_FOUND_HOLD_AT - 0.25;
  await page.waitForFunction(() => window.homeWatchEvents.some(({ kind }) => kind === 'sighting'), null,
    // A timeout of 0 would wait for ever: wait at least a millisecond.
    { timeout: Math.max(1, Math.round((sightingBy - await browserTime(page)) * 1000)), polling: 50 }).catch(() => {});
  const events = await page.evaluate(() => window.homeWatchEvents);
  const arrival = events.find(({ kind }) => kind === 'sighting');
  assert.ok(arrival && arrival.observedAt <= sightingBy,
    `No possible sighting ${LOST_FOUND_HOLD_AT - LOST_FOUND_START_AT} s after Start watching: ` + JSON.stringify({ liveAt: liveAt - start, events }));
  console.log(`Lost and Found: camera live at ${(liveAt - start).toFixed(2)} s, possible sighting at ${(arrival.observedAt - start).toFixed(2)} s, clip ${arrival.clipAt.toFixed(3)} s`);

  // The entry's pictures are read before the hold, so the move into view is the hold's first step.
  const card = `.watch-list__body [data-alert-card][data-kind="sighting"][data-alert-at="${arrival.at}"]`;
  const entry = page.locator(card);
  const petPhoto = entry.getByRole('img', { name: `${PET}’s saved photo`, exact: true });
  await petPhoto.waitFor({ timeout: 2 * SECOND });
  await petPhoto.evaluate((image) => image.decode());
  // The close-up and the camera's picture come into the entry a moment after the sighting, from the
  // alert's own copies; until then the pair holds the saved photo alone.
  const kept = [`${card} .alert-picture__pair img`, ...(view.size === 'wide' ? [`${card} .alert-picture__frame img`] : [])];
  await page.waitForFunction((selectors) => selectors.every((selector) => document.querySelector(selector)?.getAttribute('src')?.startsWith('blob:')),
    kept, { timeout: 3 * SECOND, polling: 50 });
  await readPicture(entry.locator('.alert-picture__pair img').first());
  const keep = view.size === 'wide'
    ? [`${card} .alert-picture__frame img`, `${card} .alert-picture__pair`, `${card} .alert-picture__words`]
    : [`${card} .alert-picture__pair`, `${card} .alert-picture__lead`];
  if (view.size === 'wide') await readPicture(entry.locator('.alert-picture__frame img').first());

  // 5–9 seconds: the possible sighting's entry, the camera's picture beside the saved photo.
  await sleepUntil(page, start, LOST_FOUND_HOLD_AT);
  await scrollSubject(page, view.size === 'wide' ? card : `${card} .alert-picture__pair`, crop.y + 6, 0);
  await settleEdges(page, crop, keep);
  const checkEntry = async () => {
    const boxes = await Promise.all(keep.map((selector) => page.locator(selector).first().boundingBox()));
    assert.ok(boxes.every((box) => fits(box, crop)), 'The possible sighting left the frame: ' + JSON.stringify({ boxes, crop }));
    await whole('The held possible sighting');
  };
  await checkEntry();
  const words = await sample();
  const pictureAt = await frameAfter(page, { nextFrameAfter, captureFrame }, await browserTime(page));
  assert.ok(end - pictureAt >= ALERT_HOLD_SECONDS, 'The possible sighting did not stay in frame for 2.5 seconds');
  await holdThrough(page, end, checkEntry);
  const seen = await page.evaluate(() => window.homeWatchEvents);
  assert.deepEqual(seen.map(({ kind }) => kind), ['sighting'], 'The Lost and Found recording must show one possible sighting and no other alert: ' + JSON.stringify(seen));
  const notices = await page.evaluate(() => window.homeRunNotifications);
  return {
    start, end, poster: pictureAt, words, event: arrival.observedAt, pictureAt,
    notices, watchEvents: seen,
  };
}

export const recipes = [
  {
    id: 'watching',
    key: 'Watching',
    route: WATCH,
    state: 'motion-alert',
    clip: 'home/sample-clip.wide.mp4',
    inputOffset: WATCH_CLIP_START,
    settings: {
      ...settings,
      severityCooldowns: { info: 10, low: 10, medium: 10, high: 10, critical: 10 },
    },
    seconds: 9,
    anchor: '.watch-frame__screen',
    description: 'On a kitten clip, the kitten walks past, Motion crosses its line and the alert arrives.',
    longDescription: [
      'The kitten faces the camera on a grey carpet, then gets up and walks past.',
      'Motion crosses its line and a movement alert arrives.',
      'The watch scrolls to Alerts and holds the movement alert and its picture in view.',
    ],
    prepare: prepareWatching,
    record: watching,
  },
  {
    id: 'dashboard',
    key: 'Dashboard',
    route: '/dashboard/',
    state: 'B',
    clip: 'home/sample-clip.mp4',
    seconds: 7,
    settings: {
      ...settings,
      globalSettings: { ...settings.globalSettings, motionSensitivity: 0 },
      timingSettings: { cooldownPeriod: 30, minimumMotionDuration: 200, emergencyEscalationDelay: 300 },
    },
    description: "The kitten clip's movement and sound alerts, and the picture one of them kept.",
    longDescription: [
      '0–2 seconds. Since you last looked shows movement and sound alerts from the kitten clip.',
      '2–7 seconds. The movement alert opens its kept picture of the kitten with its face in view.',
    ],
    prepare: prepareDashboard,
    record: dashboard,
  },
  {
    id: 'lost-found',
    key: 'Lost and Found',
    route: WATCH,
    state: 'sighting',
    clip: 'home/sample-clip.mp4',
    photos: LOST_FOUND_PHOTOS,
    // The microphone hears nothing, so the clip's bark at 0:06 raises no sound alert over the entry.
    microphone: 'silence',
    seconds: 9,
    anchor: '.watch-for',
    settings: {
      ...settings,
      globalSettings: { ...settings.globalSettings, motionSensitivity: 0 },
    },
    description: 'The kitten clip compared with a photo from another day, and a possible sighting.',
    longDescription: [
      '0–2 seconds. Lost and Found holds Toffee’s one saved photo, a kitten lying on a beige carpet.',
      '2–5 seconds. The watch compares the kitten clip, on a grey carpet, with that photo twice a second.',
      '5–9 seconds. A possible sighting asks "Could this be Toffee?" with the camera’s picture beside the saved photo, to check by eye.',
    ],
    prepare: prepareLostFound,
    record: lostFound,
  },
  {
    id: 'settings',
    key: 'Settings',
    route: '/settings/',
    state: 'list',
    clip: null,
    seconds: 6,
    anchor: 'nav[aria-label="Settings pages"]',
    description: 'Settings say what the device watches for and what raises an alert.',
    longDescription: [
      '0–2 seconds. Settings shows Detection first, then the settings that follow it.',
      '2–5 seconds. The page scrolls through the list of settings.',
      '5–6 seconds. The final settings remain on screen.',
    ],
    async prepare({ page, baseUrl }) {
      await open(page, baseUrl, '/settings/');
      const list = page.getByRole('navigation', { name: 'Settings pages', exact: true });
      await list.locator('a').first().filter({ hasText: /^Detection/ }).waitFor();
    },
    record: siteSettings,
  },
];
