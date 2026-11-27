import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';

export const RUNS_NAME = 'Recorded runs of SafeOS Guardian';
const PLAYER = 'section[aria-label="Recorded runs of SafeOS Guardian"]';

export async function waitForPlaying(page, after = 0, timeout = 5000) {
  await page.waitForFunction(({ selector, after }) => {
    const movie = document.querySelector(`${selector} video`);
    return movie?.readyState >= 2 && movie.currentTime > after && !movie.paused;
  }, { selector: PLAYER, after }, { timeout });
}

export async function checkHomeRuns(browser, baseUrl, [opening, following]) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
    serviceWorkers: 'block',
  });
  try {
    const page = await context.newPage();
    await page.mouse.move(0, 0);
    const firstVideo = new URL('/' + opening.variants.wide.dark.video.path, baseUrl).href;
    const nextVideo = new URL('/' + following.variants.wide.dark.video.path, baseUrl).href;
    const requested = page.waitForResponse((response) => response.url() === firstVideo
      && [200, 206].includes(response.status()), { timeout: 15000 });
    // A walk that fails before it reads the video closes the context, which
    // rejects this wait. Handle that here so the failure is the one reported.
    requested.catch(() => {});
    const response = await page.goto(new URL('/', baseUrl).href, { waitUntil: 'domcontentloaded' });
    assert.ok(response?.ok(), 'Home must serve the exported page');
    const region = page.getByRole('region', { name: RUNS_NAME, exact: true });
    await region.waitFor({ timeout: 5000 }).catch(() => { throw Error(`${RUNS_NAME} missing`); });
    await requested;
    await waitForPlaying(page);
    const first = await region.locator('video').evaluate((movie) => ({
      time: movie.currentTime, width: movie.videoWidth, muted: movie.muted, source: movie.currentSrc,
    }));
    assert.ok(first.muted && first.width > 0, opening.key + ' must have a decoded muted video');
    assert.equal(first.source, firstVideo);
    await waitForPlaying(page, first.time);
    const video = region.locator('video');
    await region.locator('.home-run__toggle').hover();
    await page.waitForFunction((selector) => document.querySelector(selector + ' video')?.paused, PLAYER, { timeout: 5000 });
    await region.getByRole('button', { name: 'Play the recordings' }).click();
    await waitForPlaying(page).catch(() => { throw Error('Play must start the recording held under the pointer'); });
    await region.getByRole('button', { name: 'Pause the recordings' }).click();
    const held = await video.evaluate((movie) => movie.currentTime);
    await page.waitForTimeout(300);
    assert.equal(await video.evaluate((movie) => movie.currentTime), held, 'Pause must keep the current frame');
    await region.getByRole('button', { name: 'Play the recordings' }).click();
    await page.mouse.move(0, 0);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Pause the recordings');
    await waitForPlaying(page, held).catch(() => { throw Error('Play must continue when the pointer leaves the focused toggle'); });
    await region.locator(`[data-run="${following.id}"][aria-current="step"]`).waitFor({ timeout: 16000 });
    await waitForPlaying(page);
    assert.equal(await video.evaluate((movie) => movie.currentSrc), nextVideo);

    console.log('The exported home pauses, resumes and advances its muted recordings');
    return 0;
  } catch (error) {
    console.error(`Home playback: ${error.message}`);
    return 1;
  } finally {
    await context.close();
  }
}

const player = (page) => page.getByRole('region', { name: RUNS_NAME, exact: true });
const button = (page, name) => player(page).getByRole('button', { name, exact: true });
const selector = (page, id) => player(page).locator('[data-run="' + id + '"]');

async function waitForPoster(page, id, size, look, format = 'webp') {
  await page.waitForFunction(({ id, size, look, format }) => {
    const image = document.querySelector('.home-run__poster img');
    return image?.currentSrc.endsWith('/' + id + '-' + size + '-' + look + '.' + format)
      && image.complete && image.naturalWidth > 0;
  }, { id, size, look, format }, { timeout: 15000 });
}

async function toggleReads(page, name, reason) {
  const key = await player(page).locator('.home-run__toggle')
    .evaluate((element) => ({ label: element.getAttribute('aria-label'), text: element.textContent }));
  assert.deepEqual(key, { label: name + ' the recordings', text: name }, reason);
}

async function timeStaysPut(page, reason) {
  const video = player(page).locator('video');
  await page.waitForFunction((selector) => document.querySelector(selector + ' video')?.paused,
    PLAYER, { timeout: 5000 });
  const at = await video.evaluate((movie) => movie.currentTime);
  await page.waitForTimeout(300);
  assert.equal(await video.evaluate((movie) => movie.currentTime), at, reason);
  return at;
}

function mediaLog(context, page) {
  const document = [];
  const worker = [];
  const media = (request) => {
    const path = new URL(request.url()).pathname;
    return path.startsWith('/home/runs/') && /\.(?:webp|avif|mp4)$/.test(path) ? path : null;
  };
  page.on('request', (request) => {
    const url = media(request);
    if (url) document.push(url);
  });
  context.on('request', (request) => {
    const url = media(request);
    if (request.serviceWorker() && url) worker.push(url);
  });
  return { document, worker };
}

const installedPosters = (page, paths, cacheName) => expect.poll(() => page.evaluate(async ({ paths, cacheName }) => {
  const store = cacheName ? await caches.open(cacheName) : caches;
  return (await Promise.all(paths.map((url) => store.match(url)))).every(Boolean);
}, { paths, cacheName }), { timeout: 45000 }).toBe(true);

export async function checkRunPolicies(browser, baseUrl, runs) {
  const issues = [];
  const home = new URL('/', baseUrl).href;
  const ids = runs.map((run) => run.id);
  const opening = ids[0];
  const openingFile = '/home/runs/' + opening;
  const paths = runs.flatMap(({ variants }) => ['dark', 'light'].map((look) => '/' + variants.square[look].poster.webp.path));
  const inContext = async (name, options, check) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'no-preference', ...options,
    });
    try {
      const page = await context.newPage();
      await page.mouse.move(0, 0);
      await check(page, context);
      console.log('Home recordings: ' + name);
    } catch (error) {
      const issue = name + ': ' + error.message;
      issues.push(issue);
      console.error('Home recordings: ' + issue);
    } finally {
      await context.close();
    }
  };
  const open = (page) => page.goto(home, { waitUntil: 'load', timeout: 30000 });

  await inContext('saved look, appearance and 1280 px switches', {
    viewport: { width: 1279, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block',
  }, async (page, context) => {
    await page.addInitScript(() => localStorage.setItem('guardian-theme', JSON.stringify({
      state: { themeMode: 'light', resolvedTheme: 'light', accessibility: {} }, version: 0,
    })));
    const log = mediaLog(context, page);
    await open(page);
    await waitForPoster(page, opening, 'square', 'light');
    assert.deepEqual(log.document, [openingFile + '-square-light.webp']);
    await page.setViewportSize({ width: 1280, height: 900 });
    await waitForPoster(page, opening, 'wide', 'light');
    await page.getByRole('button', { name: 'Switch to the dark look', exact: true }).click();
    await waitForPoster(page, opening, 'wide', 'dark');
    assert.deepEqual(log.document, [
      openingFile + '-square-light.webp', openingFile + '-wide-light.webp', openingFile + '-wide-dark.webp',
    ]);
  });

  for (const restriction of ['reduce', 'save-data', '2g', 'slow-2g']) {
    await inContext(restriction + ' defers video and the worker batch', {
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      reducedMotion: restriction === 'reduce' ? 'reduce' : 'no-preference',
    }, async (page, context) => {
      if (restriction !== 'reduce') {
        await page.addInitScript((restriction) => {
          const connection = new EventTarget();
          connection.saveData = restriction === 'save-data';
          connection.effectiveType = connection.saveData ? '4g' : restriction;
          Object.defineProperty(navigator, 'connection', { configurable: true, value: connection });
        }, restriction);
      }
      const log = mediaLog(context, page);
      await open(page);
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 45000 });
      await waitForPoster(page, opening, 'square', 'dark');
      await button(page, 'Play the recordings').waitFor();
      if (restriction !== 'reduce') await player(page).getByText('Press Play to load this recording.', { exact: true }).waitFor();
      assert.deepEqual(log.document, [openingFile + '-square-dark.webp']);
      assert.deepEqual(log.worker, []);
      await button(page, 'Play the recordings').click();
      await waitForPlaying(page);
      assert.deepEqual([...new Set(log.document)], [
        openingFile + '-square-dark.webp', openingFile + '-square-dark.mp4',
      ]);
      assert.deepEqual(log.worker, []);
      assert.equal(await page.evaluate(async (movie) => Boolean(await caches.match(movie)), openingFile + '-square-dark.mp4'), false);
      if (restriction === 'reduce') {
        await page.emulateMedia({ reducedMotion: 'no-preference' });
      } else {
        await page.evaluate(() => {
          navigator.connection.saveData = false;
          navigator.connection.effectiveType = '4g';
          navigator.connection.dispatchEvent(new Event('change'));
        });
      }
      await installedPosters(page, paths);
      assert.ok(log.worker.every((url) => paths.includes(url)), 'Only saved posters may be requested by the worker');
    });
  }

  for (const width of [390, 1440]) {
    for (const look of ['dark', 'light']) {
      await inContext('saved square posters offline at ' + width + ' in ' + look, {
        viewport: { width, height: width === 390 ? 844 : 900 }, isMobile: width === 390, hasTouch: width === 390, colorScheme: look,
      }, async (page, context) => {
        const log = mediaLog(context, page);
        await open(page);
        await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 45000 });
        await installedPosters(page, paths);
        await context.setOffline(true);
        await page.reload({ waitUntil: 'load' });
        await waitForPoster(page, ids[0], 'square', look);
        for (const id of ids.slice(1)) {
          await selector(page, id).click();
          await waitForPoster(page, id, 'square', look);
        }
        await button(page, 'Play the recordings').click();
        const message = 'The recordings need a connection. Each picture shows its moment.';
        await player(page).getByRole('status').filter({ hasText: message }).waitFor();
        assert.equal(await player(page).getByText(message, { exact: true }).count(), 1);
        assert.ok(log.worker.every((url) => paths.includes(url)), 'Only square WebP media may be saved by the worker');
        assert.equal(await page.evaluate(async () => {
          const keys = await Promise.all((await caches.keys()).map(async (name) => (await caches.open(name)).keys()));
          return keys.flat().some((request) => /\.mp4(?:$|\?)/.test(request.url));
        }), false);
        if (width === 1440) {
          const widePoster = openingFile + '-wide-' + look + '.avif';
          // Block the upstream request as well as going offline in the page.
          // The worker's own fetch can otherwise reach the test server.
          await context.route('**' + widePoster, async (route) => {
            if (route.request().serviceWorker()) await route.abort('internetdisconnected');
            else await route.continue();
          });
          const fallback = await page.evaluate(async (url) => {
            const answer = await fetch(url);
            return { status: answer.status, type: answer.headers.get('Content-Type') };
          }, widePoster);
          assert.deepEqual(fallback, { status: 200, type: 'image/webp' });
        }
      });
    }
  }

  await inContext('a visit that reaches home through a link saves the posters', {}, async (page) => {
    await page.goto(new URL('/about/', baseUrl).href, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 45000 });
    await page.evaluate(() => { window.homeLinkVisit = true; });
    await page.getByRole('link', { name: 'SafeOS Guardian, home', exact: true }).first().click();
    await player(page).waitFor({ timeout: 15000 });
    assert.equal(new URL(page.url()).pathname, '/');
    assert.equal(await page.evaluate(() => window.homeLinkVisit), true, 'The brand link must open home without a page load');
    await installedPosters(page, paths).catch(() => {
      throw Error('A visit that opens home through a link must save the posters');
    });
  });

  const nextVersion = 'home-poster-rollover';
  const exportWorker = new URL('../out/sw.js', import.meta.url);
  const nextWorker = new URL('sw-rollover.js', exportWorker);
  const nextPath = '/' + nextWorker.pathname.split('/').at(-1);
  const worker = await readFile(exportWorker, 'utf8');
  const marker = 'const manifest = self.__SAFEOS_PRECACHE;';
  assert.ok(worker.includes(marker), 'The exported worker has no precache manifest');
  await writeFile(nextWorker, worker.replace(marker, `self.__SAFEOS_PRECACHE.version = '${nextVersion}';\n${marker}`));
  try {
    await inContext('a new service worker saves posters for the open home', {}, async (page, context) => {
      await open(page);
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 45000 });
      await installedPosters(page, paths);
      await page.evaluate((path) => navigator.serviceWorker.register(path, { scope: '/' }).then(() => {}), nextPath);
      await page.waitForFunction((path) => navigator.serviceWorker.controller?.scriptURL.endsWith(path),
        nextPath, { timeout: 45000 });
      await installedPosters(page, paths, 'safeos-shell-' + nextVersion).catch(() => {
        throw Error('The new build did not save posters in its own cache on taking control');
      });
      await context.setOffline(true);
      await page.reload({ waitUntil: 'load' });
      await waitForPoster(page, ids[0], 'square', 'dark');
    });
  } finally {
    await rm(nextWorker, { force: true });
  }

  await inContext('hover, keyboard focus, viewport and document visibility suspend playback', {
    serviceWorkers: 'block',
  }, async (page) => {
    await open(page);
    await waitForPlaying(page);
    await player(page).locator('.home-run__frame').hover();
    let at = await timeStaysPut(page, 'Hover paused the recording');
    await page.mouse.move(0, 0);
    await waitForPlaying(page, at);
    await selector(page, ids[0]).focus();
    at = await timeStaysPut(page, 'Keyboard focus paused the recording');
    await page.evaluate(() => document.activeElement.blur());
    await waitForPlaying(page, at);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    at = await timeStaysPut(page, 'Leaving the viewport paused the recording');
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForPlaying(page, at);
    const shown = await player(page).evaluate((section) => {
      const top = section.getBoundingClientRect().top;
      // The page scrolls smoothly; jump so the share is read where the scroll ends.
      window.scrollTo({ top: window.scrollY + top + section.offsetHeight * 0.9, behavior: 'instant' });
      const box = section.getBoundingClientRect();
      return (Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0)) / box.height;
    });
    assert.ok(shown > 0 && shown < 0.25, 'The scroll must leave under a quarter of the player in view, left ' + shown);
    at = await timeStaysPut(page, 'Under a quarter of the player in view paused the recording');
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForPlaying(page, at);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    at = await timeStaysPut(page, 'A hidden document paused the recording');
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitForPlaying(page, at);
  });

  await inContext('the toggle key reads Play while hover or focus holds the recording, and one press plays', {
    serviceWorkers: 'block',
  }, async (page) => {
    const toggle = player(page).locator('.home-run__toggle');
    const reads = (name, reason) => toggleReads(page, name, reason);
    await open(page);
    await waitForPlaying(page);
    await reads('Pause', 'A playing recording offers Pause');
    await toggle.hover();
    let at = await timeStaysPut(page, 'The pointer on the key held the recording');
    await reads('Play', 'A recording held under the pointer offers Play');
    await toggle.click();
    await waitForPlaying(page, at).catch(() => { throw Error('One press on Play must play under the pointer'); });
    await reads('Pause', 'The pressed key offers Pause while the recording plays');
    await toggle.click();
    at = await timeStaysPut(page, 'Pause held the frame under the pointer');
    await reads('Play', 'A paused recording offers Play');
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.activeElement.blur());
    assert.equal(await timeStaysPut(page, 'Leaving a paused player cannot start it'), at);

    await page.reload({ waitUntil: 'load' });
    await waitForPlaying(page);
    await toggle.focus();
    at = await timeStaysPut(page, 'Keyboard focus on the key held the recording');
    await reads('Play', 'A recording held by keyboard focus offers Play');
    await page.keyboard.press('Enter');
    await waitForPlaying(page, at).catch(() => { throw Error('One Enter on Play must play while the key has focus'); });
    await reads('Pause', 'The focused key offers Pause while the recording plays');
    await page.keyboard.press('Enter');
    await timeStaysPut(page, 'Enter on Pause held the frame');
    await reads('Play', 'A paused recording offers Play to the keyboard');
  });

  await inContext('a tap on the key does what the key reads on a touch screen', {
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block',
  }, async (page) => {
    const toggle = player(page).locator('.home-run__toggle');
    await open(page);
    await waitForPlaying(page);
    await toggleReads(page, 'Pause', 'A playing recording offers Pause to a tap');
    await toggle.tap();
    const at = await timeStaysPut(page, 'A tap on Pause held the frame').catch((error) => {
      throw Error('A tap on Pause must pause the recording: ' + error.message.split('\n')[0]);
    });
    await toggleReads(page, 'Play', 'A tap on Pause leaves the key offering Play');
    await toggle.tap();
    await waitForPlaying(page, at).catch(() => { throw Error('A tap on Play must play the recording'); });
    await toggleReads(page, 'Pause', 'A tap on Play leaves the key offering Pause');
  });

  await inContext('Play loads a chosen recording again after it failed', { serviceWorkers: 'block' }, async (page, context) => {
    let blocked = true;
    await context.route('**/home/runs/' + ids[1] + '-wide-dark.mp4', async (route) => {
      if (blocked) await route.abort().catch(() => {});
      else await route.continue().catch(() => {});
    });
    await open(page);
    await waitForPlaying(page);
    await selector(page, ids[1]).click();
    await player(page).getByText('This recording did not load. Its picture shows the moment it records.', { exact: true }).waitFor();
    await toggleReads(page, 'Play', 'A failed recording offers Play');
    blocked = false;
    await player(page).locator('.home-run__toggle').click();
    await waitForPlaying(page).catch(() => { throw Error('Play must load the failed recording again'); });
    assert.equal(await player(page).locator('video').evaluate((movie, ending) => movie.currentSrc.endsWith(ending),
      '/' + ids[1] + '-wide-dark.mp4'), true, 'Play must load the chosen recording, not another');
    await toggleReads(page, 'Pause', 'A recording loaded again offers Pause');
  });

  await inContext('manual loop, arrows and polite selection', { serviceWorkers: 'block' }, async (page) => {
    await open(page);
    await waitForPlaying(page);
    await player(page).locator('.home-run__toggle').hover();
    await button(page, 'Play the recordings').click();
    await waitForPlaying(page);
    await button(page, 'Pause the recordings').click();
    const held = await timeStaysPut(page, 'Explicit Pause held the frame');
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.activeElement.blur());
    assert.equal(await timeStaysPut(page, 'Leaving a paused player cannot start it'), held);
    assert.equal(await button(page, 'Previous run').isDisabled(), true);
    await button(page, 'Next run').click();
    await waitForPlaying(page);
    assert.equal(await selector(page, ids[1]).getAttribute('aria-current'), 'step');
    const polite = player(page).locator('[aria-live="polite"]');
    assert.equal(await polite.count(), 1);
    assert.equal(await polite.textContent(), 'Showing ' + runs[1].key + ', 2 of ' + runs.length);
    for (let step = 2; step < ids.length; step += 1) {
      await button(page, 'Next run').click();
      await waitForPlaying(page);
      assert.equal(await selector(page, ids[step]).getAttribute('aria-current'), 'step');
    }
    assert.equal(await button(page, 'Next run').isDisabled(), true);
    const video = player(page).locator('video');
    assert.equal(await video.evaluate((movie) => movie.loop), true);
    await page.waitForFunction((query) => {
      const movie = document.querySelector(query + ' video');
      return movie.currentTime > movie.duration - 0.5;
    }, PLAYER, { timeout: 10000 });
    await page.waitForFunction((query) => {
      const movie = document.querySelector(query + ' video');
      return movie.currentTime < 0.5 && !movie.paused;
    }, PLAYER, { timeout: 2000 });
    assert.equal(await selector(page, ids.at(-1)).getAttribute('aria-current'), 'step');
  });

  await inContext('two full passes and a quiet reset', { serviceWorkers: 'block' }, async (page) => {
    await page.addInitScript(() => {
      const selected = [];
      window.homeRunSelections = selected;
      addEventListener('DOMContentLoaded', () => {
        const region = document.querySelector('.home-runs');
        const read = () => {
          const id = region.querySelector('[data-run][aria-current="step"]')?.dataset.run;
          if (id && selected.at(-1) !== id) selected.push(id);
        };
        new MutationObserver(read).observe(region, { attributes: true, attributeFilter: ['aria-current'], subtree: true });
        read();
      });
    });
    await open(page);
    await waitForPlaying(page);
    await page.waitForFunction(({ query, count }) => {
      const region = document.querySelector(query);
      return window.homeRunSelections.length >= count && !region.querySelector('video').hasAttribute('src');
    }, { query: PLAYER, count: ids.length * 2 + 1 }, {
      timeout: 20000 + 2000 * runs.reduce((total, run) => total + run.seconds, 0),
    });
    assert.deepEqual(await page.evaluate(() => window.homeRunSelections), [...ids, ...ids, ids[0]]);
    assert.equal(await player(page).locator('[aria-live="polite"]').textContent(), '');
    await button(page, 'Play the recordings').click();
    await page.mouse.move(0, 0);
    await waitForPlaying(page).catch(() => { throw Error('Play must resume the opening run after two passes'); });
    assert.equal(await selector(page, ids[0]).getAttribute('aria-current'), 'step');
  });

  await inContext('delayed and failed video, then failed poster', { serviceWorkers: 'block' }, async (page, context) => {
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    await context.route('**' + openingFile + '-wide-dark.mp4', async (route) => {
      await held;
      await route.abort().catch(() => {});
    });
    try {
      await page.goto(home, { waitUntil: 'domcontentloaded' });
      await waitForPoster(page, opening, 'wide', 'dark');
      const frame = player(page).locator('.home-run__frame');
      const before = await frame.boundingBox();
      await frame.and(page.locator('[data-loading="true"]')).waitFor();
      assert.equal(await frame.locator('img').isVisible(), true);
      release();
      await player(page).getByText('This recording did not load. Its picture shows the moment it records.', { exact: true }).waitFor();
      assert.equal(await frame.locator('.home-run__problem').count(), 0);
      assert.deepEqual(await frame.boundingBox(), before);
      await waitForPlaying(page);
      assert.equal(await selector(page, ids[1]).getAttribute('aria-current'), 'step');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await context.route('**/home/runs/settings-wide-dark.*', (route) => route.abort());
      await selector(page, 'settings').click();
      await frame.locator('.home-run__problem').waitFor();
      assert.deepEqual(await frame.boundingBox(), before);
      assert.equal(await player(page).locator('[data-run-caption]').textContent(), runs.at(-1).description);
    } finally {
      release();
    }
  });

  // The run keys stay one row at every phone and tablet width: a key that
  // does not fit scrolls the row sideways behind its fade, with the previous
  // and next arrows either side; nothing wraps to a second line.
  for (const width of [320, 360, 390, 430, 480, 768]) {
    await inContext('the run keys keep one row at ' + width + ' px', {
      viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: width < 768, reducedMotion: 'reduce', serviceWorkers: 'block',
    }, async (page) => {
      await open(page);
      await player(page).locator('.home-run__strip button[data-run]').first().waitFor();
      const row = await player(page).locator('.home-run__controls').evaluate((controls) => {
        const middle = (element) => {
          const box = element.getBoundingClientRect();
          return box.top + box.height / 2;
        };
        const strip = controls.querySelector('.home-run__strip');
        const keys = [...strip.querySelectorAll('button[data-run]')];
        const middles = [...controls.children, ...keys].map(middle);
        return {
          keys: keys.map((key) => key.textContent.trim()),
          spread: Math.max(...middles) - Math.min(...middles),
          tall: keys.filter((key) => {
            const range = document.createRange();
            range.selectNodeContents(key);
            return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size > 1;
          }).map((key) => key.textContent.trim()),
          arrows: ['Previous run', 'Next run'].map((name) => Boolean(controls.querySelector('[aria-label="' + name + '"]'))),
          overflows: strip.scrollWidth > strip.clientWidth + 1,
          fadeAfter: strip.parentElement.hasAttribute('data-more-after'),
          page: document.documentElement.scrollWidth,
        };
      });
      assert.deepEqual(row.keys, ['Watching', 'Dashboard', 'Lost and Found', 'Settings'], 'The run keys at ' + width + ' px');
      assert.ok(row.spread <= 2, 'The run keys and arrows sit on more than one row at ' + width + ' px: ' + JSON.stringify(row));
      assert.deepEqual(row.tall, [], 'A run key wraps at ' + width + ' px');
      assert.deepEqual(row.arrows, [true, true], 'The previous and next arrows at ' + width + ' px');
      if (row.overflows) assert.ok(row.fadeAfter, 'The row scrolls with no fade at its end at ' + width + ' px');
      assert.equal(row.page, width, 'The page scrolls sideways at ' + width + ' px');
    });
  }

  await inContext('each 320 px Tab stop stays clear of the strip edges', {
    viewport: { width: 320, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block',
  }, async (page) => {
    await open(page);
    await button(page, 'Play the recordings').focus();
    for (const id of ids) {
      await page.keyboard.press('Tab');
      const focused = await selector(page, id).evaluate((key) => {
        const strip = key.parentElement;
        const outer = strip.getBoundingClientRect();
        const box = key.getBoundingClientRect();
        return {
          active: document.activeElement === key,
          inside: box.left >= outer.left + (strip.scrollLeft > 1 ? 8 : 0) - 1
            && box.right <= outer.right - (strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1 ? 8 : 0) + 1,
          scrolled: strip.scrollLeft,
        };
      });
      assert.ok(focused.active && focused.inside, id + ' must be fully visible on focus');
      if (id === ids.at(-1)) assert.ok(focused.scrolled > 0, 'The last stop scrolls the strip');
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
  });

  return issues.length;
}
