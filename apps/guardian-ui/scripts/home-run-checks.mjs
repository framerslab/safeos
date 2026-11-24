import assert from 'node:assert/strict';

export const RUNS_NAME = 'Recorded runs of SafeOS Guardian';
const PLAYER = 'section[aria-label="Recorded runs of SafeOS Guardian"]';

export async function waitForPlaying(page, after = 0, timeout = 5000) {
  await page.waitForFunction(({ selector, after }) => {
    const movie = document.querySelector(`${selector} video`);
    return movie?.readyState >= 2 && movie.currentTime > after && !movie.paused;
  }, { selector: PLAYER, after }, { timeout });
}

export async function checkHomeRuns(browser, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
    serviceWorkers: 'block',
  });
  try {
    const page = await context.newPage();
    await page.mouse.move(0, 0);
    const dashboard = '/home/runs/dashboard-wide-dark.mp4';
    const requested = page.waitForResponse((response) => response.url() === new URL(dashboard, baseUrl).href
      && [200, 206].includes(response.status()), { timeout: 15000 });
    const response = await page.goto(new URL('/', baseUrl).href, { waitUntil: 'domcontentloaded' });
    assert.ok(response?.ok(), 'Home must serve the exported page');
    const region = page.getByRole('region', { name: RUNS_NAME, exact: true });
    await region.waitFor({ timeout: 5000 }).catch(() => { throw Error(`${RUNS_NAME} missing`); });
    await requested;
    await waitForPlaying(page);
    const first = await region.locator('video').evaluate((movie) => ({
      time: movie.currentTime, width: movie.videoWidth, muted: movie.muted, source: movie.currentSrc,
    }));
    assert.ok(first.muted && first.width > 0, 'Dashboard must have a decoded muted video');
    assert.equal(first.source, new URL(dashboard, baseUrl).href);
    await waitForPlaying(page, first.time);
    const video = region.locator('video');
    await region.getByRole('button', { name: 'Pause the recordings' }).click();
    const held = await video.evaluate((movie) => movie.currentTime);
    await page.waitForTimeout(300);
    assert.equal(await video.evaluate((movie) => movie.currentTime), held, 'Pause must keep the current frame');
    await region.getByRole('button', { name: 'Play the recordings' }).click();
    await page.mouse.move(0, 0);
    await page.locator('h1').click({ position: { x: 0, y: 2 } });
    await region.locator('[data-run="watching"][aria-current="step"]').waitFor({ timeout: 16000 });
    await waitForPlaying(page);
    assert.match(await video.evaluate((movie) => movie.currentSrc), /watching-wide-dark\.mp4$/);

    console.log('The exported home plays muted Dashboard video, freezes on Pause, and advances to Watching');
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

const installedPosters = async (page, paths) => page.waitForFunction(async (paths) => (
  await Promise.all(paths.map((url) => caches.match(url)))
).every(Boolean), paths, { timeout: 45000 });

export async function checkRunPolicies(browser, baseUrl, runs) {
  const issues = [];
  const home = new URL('/', baseUrl).href;
  const ids = runs.map((run) => run.id);
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
      issues.push(name + ': ' + error.message);
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
    await waitForPoster(page, 'dashboard', 'square', 'light');
    assert.deepEqual(log.document, ['/home/runs/dashboard-square-light.webp']);
    await page.setViewportSize({ width: 1280, height: 900 });
    await waitForPoster(page, 'dashboard', 'wide', 'light');
    await page.getByRole('button', { name: 'Switch to the dark look', exact: true }).click();
    await waitForPoster(page, 'dashboard', 'wide', 'dark');
    assert.deepEqual(log.document, [
      '/home/runs/dashboard-square-light.webp', '/home/runs/dashboard-wide-light.webp', '/home/runs/dashboard-wide-dark.webp',
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
      await waitForPoster(page, 'dashboard', 'square', 'dark');
      await button(page, 'Play the recordings').waitFor();
      if (restriction !== 'reduce') await player(page).getByText('Press Play to load this recording.', { exact: true }).waitFor();
      assert.deepEqual(log.document, ['/home/runs/dashboard-square-dark.webp']);
      assert.deepEqual(log.worker, []);
      await button(page, 'Play the recordings').click();
      await waitForPlaying(page);
      assert.deepEqual([...new Set(log.document)], [
        '/home/runs/dashboard-square-dark.webp', '/home/runs/dashboard-square-dark.mp4',
      ]);
      assert.deepEqual(log.worker, []);
      assert.equal(await page.evaluate(async () => Boolean(await caches.match('/home/runs/dashboard-square-dark.mp4'))), false);
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
      assert.deepEqual([...new Set(log.worker)].sort(), [...paths].sort());
    });
  }

  for (const width of [390, 1440]) {
    for (const look of ['dark', 'light']) {
      await inContext('saved square posters offline at ' + width + ' in ' + look, {
        viewport: { width, height: width === 390 ? 844 : 900 }, isMobile: width === 390, hasTouch: width === 390, colorScheme: look,
      }, async (page, context) => {
        const log = mediaLog(context, page);
        await open(page);
        await installedPosters(page, paths);
        await context.setOffline(true);
        await page.reload({ waitUntil: 'load' });
        await waitForPoster(page, ids[0], 'square', look);
        for (const id of ids.slice(1)) {
          await selector(page, id).click();
          await waitForPoster(page, id, 'square', look);
        }
        await button(page, 'Play the recordings').click();
        await player(page).getByText('The recordings need a connection. Each picture shows its moment.', { exact: true }).waitFor();
        assert.ok(log.worker.every((url) => paths.includes(url)), 'Only square WebP media may be saved by the worker');
        assert.equal(await page.evaluate(async () => {
          const keys = await Promise.all((await caches.keys()).map(async (name) => (await caches.open(name)).keys()));
          return keys.flat().some((request) => /\.mp4(?:$|\?)/.test(request.url));
        }), false);
        if (width === 1440) {
          assert.equal(await page.evaluate(async (look) => {
            const answer = await fetch('/home/runs/dashboard-wide-' + look + '.avif');
            return answer.headers.get('Content-Type');
          }, look), 'image/webp', 'Worker serves the saved square’s media type');
        }
      });
    }
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

  await inContext('manual loop, arrows and polite selection', { serviceWorkers: 'block' }, async (page) => {
    await open(page);
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
    await button(page, 'Next run').click();
    await waitForPlaying(page);
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
    await button(page, 'Play the recordings').waitFor();
  });

  await inContext('delayed and failed video, then failed poster', { serviceWorkers: 'block' }, async (page, context) => {
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    await context.route('**/home/runs/dashboard-wide-dark.mp4', async (route) => {
      await held;
      await route.abort().catch(() => {});
    });
    try {
      await page.goto(home, { waitUntil: 'domcontentloaded' });
      await waitForPoster(page, 'dashboard', 'wide', 'dark');
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

  for (const issue of issues) console.error('Home recordings: ' + issue);
  return issues.length;
}
