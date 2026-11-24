import assert from 'node:assert/strict';
import { settings } from './home-run-seed.mjs';

export const omittedRuns = [
  { id: 'alert', reason: 'Requires saved alert pictures and the live box on the Motion and sound page.' },
  { id: 'lost-found', reason: 'Requires the sample photos, the saved pet’s fingerprint and the possible sighting on the watch.' },
];

const SECOND = 1000;
const WATCH = '/monitor/';
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

function trackWatchAlerts(page) {
  return page.evaluate(() => {
    const watch = document.querySelector('.watch-list__body');
    if (!watch) throw Error('The watch has no alert list');
    window.homeWatchEvents = [];
    const seen = new Set();
    const observer = new MutationObserver(() => {
      const clipAt = document.querySelector('.watch-frame__picture video')?.currentTime;
      if (!Number.isFinite(clipAt)) return;
      for (const card of watch.querySelectorAll('[data-alert-card][data-kind][data-alert-at]')) {
        const { kind, alertAt: at } = card.dataset;
        const identity = kind + ':' + at;
        if (seen.has(identity)) continue;
        seen.add(identity);
        window.homeWatchEvents.push({ kind, at, clipAt });
      }
    });
    observer.observe(watch, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-alert-at'] });
  });
}

async function prepareDashboard({ page, baseUrl }) {
  await openWatch(page, baseUrl);
  await trackWatchAlerts(page);
  await markStart(page);
  await pose(page, 'Stop watching').waitFor({ timeout: 15 * SECOND });
  await watchEvent(page, 'sound').waitFor({ timeout: 20 * SECOND });
  await watchEvent(page, 'motion').waitFor({ timeout: 35 * SECOND });
  await page.waitForFunction(() => window.homeWatchEvents.some(
    ({ kind, clipAt }) => kind === 'sound' && clipAt >= 5.5 && clipAt <= 10,
  ), null, { timeout: 5 * SECOND }).catch(() => { throw Error('No recorded sound alert during the bark'); });
  await page.waitForFunction(() => window.homeWatchEvents.some(
    ({ kind, clipAt }) => kind === 'motion' && clipAt >= 24 && clipAt <= 28.5,
  ), null, { timeout: 32 * SECOND }).catch(() => { throw Error('No recorded motion alert as the kitten passed the camera'); });
  const events = await page.evaluate(() => window.homeWatchEvents);
  await pose(page, 'Stop watching').click();
  await pose(page, 'Start watching').waitFor();
  const notices = await page.evaluate(() => window.homeRunNotifications);
  assert.ok(notices?.length, 'The watch saved alerts without a recorded notification');
  await open(page, baseUrl, '/dashboard/');
  await page.getByRole('heading', { name: 'Not watching', exact: true }).waitFor();
  await page.locator('.dash-new').getByText(/new alerts? since you last looked/).waitFor();
  const ways = page.getByRole('region', { name: 'Ways to watch' });
  assert.equal(await ways.getByRole('link').count(), 4, 'Expected all four ways to watch');
  const since = page.getByRole('region', { name: 'Since you last looked' });
  const motion = since.getByRole('link', { name: /Movement at/ }).first();
  await motion.waitFor();
  await motion.locator('img').waitFor({ state: 'attached' });
  await since.getByRole('link', { name: /Sound at/ }).first().waitFor();
  return { notices, events };
}

async function viewingTop(page, selector) {
  return page.evaluate((selector) => {
    const subject = document.querySelector(selector);
    if (!subject) throw Error(`Missing recording subject ${selector}`);
    return subject.getBoundingClientRect().top + scrollY;
  }, selector);
}

export async function placeSubject(page, recipe, view) {
  const anchor = view.size === 'square' && view.width < 390 && recipe.narrowAnchor
    ? recipe.narrowAnchor
    : recipe.anchor;
  const top = await viewingTop(page, anchor);
  const header = await page.locator('.app-header').first().boundingBox();
  const headerHeight = header?.height ?? 0;
  const offset = view.size === 'square' ? 6 : headerHeight + 4;
  if (view.size === 'wide') {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.max(0, top - offset));
    return 0;
  }
  const box = await page.locator(anchor).first().boundingBox();
  const footer = await page.locator('.phone-bar').first().boundingBox();
  // The fixed phone navigation must not intersect the crop; scroll the
  // actual route to hold its subject above the bar when needed.
  const maxTop = Math.floor(Math.min(view.height, footer?.y ?? view.height) - view.width);
  const visibleTop = Math.min(maxTop, Math.max(headerHeight, Math.floor(box.y - offset)));
  if (box.y - offset > maxTop) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), top - visibleTop - offset);
  }
  return Math.round(visibleTop);
}

async function scrollSubject(page, selector, top, seconds, edge = 'start', frameHeight = 0) {
  return page.evaluate(({ selector, top, seconds, edge, frameHeight }) => {
    const subject = document.querySelector(selector);
    if (!subject) throw Error(`Missing scroll destination ${selector}`);
    const box = subject.getBoundingClientRect();
    const start = scrollY;
    const target = edge === 'end' ? start + box.bottom - top - frameHeight : start + box.top - top;
    return new Promise((resolve) => {
      const began = performance.now();
      const tick = (now) => {
        const progress = Math.min(1, (now - began) / (seconds * 1000));
        window.scrollTo({ top: start + (target - start) * progress, behavior: 'instant' });
        if (progress < 1) requestAnimationFrame(tick);
        else resolve({ from: start, to: scrollY, target });
      };
      requestAnimationFrame(tick);
    });
  }, { selector, top, seconds, edge, frameHeight });
}

async function dashboard({ page, view, top, prepared, sample }) {
  const start = await browserTime(page);
  await sleepUntil(page, start, 1);
  const initial = await sample();
  const shown = initial.map(({ word }) => word).join(' ');
  for (const way of ['Motion and sound', 'Lost and Found', 'People', 'Wildlife']) {
    assert.ok(shown.includes(way), `The Dashboard poster does not show ${way} at ${view.width} px: ${shown}`);
  }
  await sleepUntil(page, start, 2.5);
  const header = await page.locator('.app-header').first().boundingBox();
  const subjectTop = Math.max(top + 6, (header?.height ?? 0) + 4);
  let scroll;
  if (view.size === 'wide') {
    const from = await page.evaluate(() => scrollY);
    const target = await viewingTop(page, '#since-label') - subjectTop;
    await page.mouse.move(1, Math.min(subjectTop + 20, view.height - 1));
    const wheelStart = await browserTime(page);
    let previous = from;
    // One steady wheel gesture, with time for the compositor to paint it.
    for (let step = 1; step <= 12; step += 1) {
      const at = Math.round(from + (target - from) * step / 12);
      await page.mouse.wheel(0, at - previous);
      previous = at;
      await sleepUntil(page, wheelStart, step / 12);
    }
    await page.waitForFunction((target) => Math.abs(scrollY - target) <= 3, target, { timeout: 1000 });
    scroll = { from, to: await page.evaluate(() => scrollY), target };
  } else {
    scroll = await scrollSubject(page, '#since-label', subjectTop, 1);
  }
  assert.ok(Math.abs(scroll.to - scroll.from) > 16, 'The dashboard did not scroll to its new alerts');
  const entry = await page.locator('.since__list li').first().boundingBox();
  assert.ok(entry && entry.y >= subjectTop && entry.y < top + (view.size === 'square' ? view.width : view.height),
    'The dashboard scroll did not bring a new alert into the recording');
  console.log(`Dashboard scroll: ${JSON.stringify(scroll)}, newest alert starts at ${entry.y}`);
  const event = await browserTime(page);
  const image = page.getByRole('region', { name: 'Since you last looked' })
    .getByRole('link', { name: /Movement at/ }).first().locator('img');
  await sleepUntil(page, start, 5);
  const picture = await image.boundingBox();
  const decoded = await image.evaluate((element) => element.complete && element.naturalWidth > 0);
  assert.ok(decoded && picture && picture.y >= top && picture.y + picture.height <= top
    + (view.size === 'square' ? view.width : view.height), 'The newest motion picture is outside the Dashboard poster');
  const words = await sample();
  const poster = await browserTime(page);
  await sleepUntil(page, start, 6);
  return {
    start, poster, event, words, scroll,
    notices: prepared.notices, watchEvents: prepared.events,
  };
}

async function watching({ page, view, sample }) {
  await page.evaluate(() => {
    const frame = document.querySelector('.watch-frame');
    if (!frame) throw Error('The watch has no camera frame');
    const observer = new MutationObserver(() => {
      if (frame.dataset.phase === 'live') {
        window.homeCameraLiveAt = (performance.timeOrigin + performance.now()) / 1000;
        observer.disconnect();
      }
    });
    observer.observe(frame, { attributes: true, attributeFilter: ['data-phase'] });
  });
  const start = await markStart(page);
  const stop = pose(page, 'Stop watching');
  await stop.waitFor({ timeout: 4 * SECOND });
  const camera = page.locator('.watch-frame__picture video').first();
  await camera.waitFor({ state: 'visible', timeout: 4 * SECOND });
  const peaks = { motion: 0, sound: 0 };
  const threshold = 100 - settings.globalSettings.audioSensitivity;
  let poster;
  let words;
  let lastBarkReading;
  const nominalEnd = start + view.seconds;
  let end = nominalEnd;
  let reachedEnd = false;
  while ((await browserTime(page)) < nominalEnd + 1.5) {
    const reading = await page.evaluate(() => {
      const video = document.querySelector('.watch-frame__picture video');
      const level = (name) => Number(document.querySelector(`[role="meter"][aria-label="${name}"]`)?.getAttribute('aria-valuenow') ?? 0);
      return {
        at: (performance.timeOrigin + performance.now()) / 1000,
        clipAt: video.currentTime,
        motion: level('Motion level'),
        sound: level('Sound level'),
      };
    });
    peaks.motion = Math.max(peaks.motion, reading.motion);
    peaks.sound = Math.max(peaks.sound, reading.sound);
    if (reading.clipAt >= 6 && reading.clipAt <= 9 && reading.sound >= threshold) {
      lastBarkReading = reading.at;
      if (!poster) {
        poster = reading.at;
        words = await sample();
      }
    }
    if (lastBarkReading) end = Math.max(nominalEnd, lastBarkReading + 1);
    if (reading.clipAt > 9 && reading.at >= end) {
      reachedEnd = true;
      break;
    }
    await sleepUntil(page, reading.at, 0.08);
  }
  assert.ok(peaks.motion > 0, 'The Motion meter never rose');
  assert.ok(poster, `The Sound meter did not go over its line during the bark (peak ${peaks.sound}, line ${threshold})`);
  assert.ok(reachedEnd, 'The watch did not hold through the second after the bark');
  const trimSeconds = end - nominalEnd;
  let trim;
  if (trimSeconds > 0) {
    const liveAt = await page.evaluate(() => window.homeCameraLiveAt);
    const trimStart = liveAt - trimSeconds;
    assert.ok(trimStart - start >= 1 / 15, `The ${(liveAt - start).toFixed(3)} s camera-start wait cannot accommodate a ${trimSeconds.toFixed(3)} s trim`);
    trim = { start: trimStart, end: liveAt };
  }
  console.log(`Last above-line bark reading after ${(lastBarkReading - start).toFixed(3)} s, then ${(end - lastBarkReading).toFixed(3)} s of hold; trimmed ${trimSeconds.toFixed(3)} s before the camera went live`);
  const raised = await watchEvent(page, 'sound').count();
  const notices = await page.evaluate(() => window.homeRunNotifications);
  assert.ok(!raised || notices?.length, 'The watch saved a sound alert without a recorded notification');
  return { start, end, poster, words, event: poster, peaks, notices, trim, lastBarkReading };
}

async function siteSettings({ page, view, top, sample }) {
  const start = await browserTime(page);
  await sleepUntil(page, start, 1);
  const words = await sample();
  await sleepUntil(page, start, 2);
  const selector = 'nav[aria-label="Settings pages"]';
  await scrollSubject(page, selector, top, 3, 'end', view.size === 'square' ? view.width : view.height);
  await sleepUntil(page, start, 6);
  return { start, words, poster: start + 1, event: start + 2 };
}

export const recipes = [
  {
    id: 'dashboard',
    key: 'Dashboard',
    route: '/dashboard/',
    state: 'B',
    clip: 'home/sample-clip.mp4',
    seconds: 6,
    anchor: '#ways-label',
    narrowAnchor: '.ways__list',
    description: 'The dashboard after a watch on the kitten clip: its new alerts since you last looked, and the four ways to watch.',
    longDescription: [
      '0–2 seconds. The dashboard shows the four ways to watch after a watch on the kitten clip.',
      '2–4 seconds. The page scrolls to Since you last looked.',
      '4–6 seconds. The new movement and sound alerts remain on screen.',
    ],
    prepare: prepareDashboard,
    record: dashboard,
  },
  {
    id: 'watching',
    key: 'Watching',
    route: WATCH,
    state: 'starting',
    clip: 'home/sample-clip.mp4',
    seconds: 10,
    anchor: '.watch-frame__screen',
    description: 'A watch starting on the kitten clip: the Motion and Sound meters rise as a dog barks.',
    longDescription: [
      '0–2 seconds. Start watching opens the camera on a kitten on a grey carpet.',
      '2–6 seconds. The kitten grooms itself and its movement raises the Motion meter.',
      '6–9 seconds. The Sound meter rises over its line as a dog barks off camera.',
      '9–10 seconds. The watch continues on the kitten.',
    ],
    prepare: ({ page, baseUrl }) => openWatch(page, baseUrl),
    record: watching,
  },
  {
    id: 'settings',
    key: 'Settings',
    route: '/settings/',
    state: 'list',
    clip: null,
    seconds: 6,
    anchor: 'nav[aria-label="Settings pages"]',
    description: 'Settings say how this device is set: what it watches for and what raises an alert.',
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
