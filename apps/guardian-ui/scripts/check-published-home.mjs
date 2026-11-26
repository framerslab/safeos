import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { RUNS_NAME, waitForPlaying } from './home-run-checks.mjs';

const address = 'https://safeos.sh/';
const expected = process.argv[2];
assert.match(expected ?? '', /^[a-f0-9]{64}$/, 'Pass the Pages build’s SHA-256 of out/index.html');

const manifestUrl = new URL('/home/runs/runs.json', address).href;
const manifestBytes = await readFile(new URL('../public/home/runs/runs.json', import.meta.url));
const manifest = JSON.parse(manifestBytes);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const files = manifest.runs.flatMap(({ variants }) =>
  Object.values(variants).flatMap((look) => Object.values(look).flatMap(({ video, poster }) => [video, ...Object.values(poster)])));

async function deliveredMedia(request) {
  const answers = await Promise.all(files.map(async (file) => {
    try {
      const response = await request.get(new URL('/' + file.path, address).href, { timeout: 20000 });
      if (!response.ok()) return file.path + ' returned HTTP ' + response.status();
      const bytes = await response.body();
      const actual = digest(bytes);
      if (bytes.length !== file.bytes || actual !== file.sha256) {
        return file.path + ': expected ' + file.bytes + ' bytes, SHA ' + file.sha256
          + '; served ' + bytes.length + ' bytes, SHA ' + actual;
      }
    } catch (error) {
      return file.path + ': ' + error.message.split('\n')[0];
    }
  }));
  return answers.filter(Boolean);
}

async function decoded(page, region, file) {
  await page.waitForFunction((url) => {
    const movie = document.querySelector('.home-runs video');
    return movie?.currentSrc === url && movie.videoWidth > 0 && !movie.paused;
  }, new URL('/' + file.path, address).href, { timeout: 15000 });
  const first = await region.locator('video').evaluate((movie) => movie.currentTime);
  await waitForPlaying(page, first);
}

const uses = [
  ['Set it up for a nap', 'monitor'],
  ['Set it up for your pet', 'monitor'],
  ['Set it up together', 'monitor'],
  ['Set it up for a lost pet', 'lost-found'],
  ['Set it up for wildlife', 'wildlife'],
];

const browser = await chromium.launch();
try {
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    let served = 'no response';
    let source = 'no manifest response';
    let mediaErrors = [];
    let verified = false;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const context = await browser.newContext({
        viewport: { width, height }, isMobile: width === 390, hasTouch: width === 390,
        colorScheme: width === 390 ? 'light' : 'dark',
        reducedMotion: 'no-preference', serviceWorkers: 'block',
        extraHTTPHeaders: { 'Cache-Control': 'no-cache' },
      });
      try {
        const page = await context.newPage();
        await page.mouse.move(0, 0);
        let matchingManifest = false;
        try {
          const answer = await context.request.get(manifestUrl, { timeout: 20000 });
          if (answer.ok()) {
            const bytes = await answer.body();
            matchingManifest = bytes.equals(manifestBytes);
            source = JSON.parse(bytes).commit || 'no source commit';
          } else {
            source = 'HTTP ' + answer.status();
          }
        } catch (error) {
          source = error.message.split('\n')[0];
        }
        mediaErrors = matchingManifest && width === 390 ? await deliveredMedia(context.request) : [];
        try {
          const response = await page.goto(address, { waitUntil: 'domcontentloaded', timeout: 20_000 });
          served = response?.ok()
            ? createHash('sha256').update(await response.body()).digest('hex')
            : `HTTP ${response?.status() ?? 'no response'}`;
        } catch (error) {
          served = `navigation failed: ${String(error).split('\n')[0]}`;
        }
        if (matchingManifest && served === expected && !mediaErrors.length) {
          const size = width === 390 ? 'square' : 'wide';
          const look = width === 390 ? 'light' : 'dark';
          const player = page.getByRole('region', { name: RUNS_NAME, exact: true });
          assert.equal(await player.locator('video').evaluate((movie) => movie.muted), true);
          await decoded(page, player, manifest.runs[0].variants[size][look].video);
          for (const run of manifest.runs.slice(1)) {
            await player.getByRole('button', { name: run.key, exact: true }).click();
            await decoded(page, player, run.variants[size][look].video);
          }
          const lockup = page.locator('.home-lockup[role="img"][aria-label="SafeOS Guardian"]');
          assert.equal(await lockup.count(), 1, 'Published home must serve the Guardian lockup');
          assert.equal(await lockup.isVisible(), width >= 768, 'Published lockup visibility');
          const section = page.locator('#how-it-works');
          const heading = section.getByRole('heading', { level: 2, name: 'Deep learning, in your browser.', exact: true });
          assert.equal(await heading.count(), 1, 'Published technical heading');
          assert.equal(await section.locator('details').count(), 6, 'Published disclosure count');
          for (const [label, way] of uses) {
            const key = page.locator('#uses').getByRole('link', { name: label, exact: true });
            assert.equal(await key.getAttribute('href', { timeout: 5_000 }), `/setup/?next=${way}`, label);
          }
          const setup = page.locator('.home-first').getByRole('link', { name: 'Start setup', exact: true });
          assert.equal(await setup.getAttribute('href', { timeout: 5_000 }), '/setup/');
          await page.goto(`${address}#how-it-works`, { waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => {
            const header = document.querySelector('.site-header').getBoundingClientRect();
            const title = document.querySelector('#detection-title').getBoundingClientRect();
            return title.top >= header.bottom && title.bottom <= window.innerHeight;
          }, null, { timeout: 10_000 });
          await Promise.all([
            page.waitForURL((url) => url.pathname === '/setup/', { timeout: 15000 }),
            setup.click(),
          ]);
          console.log('Published home at ' + width + ' px serves ' + source + ' and plays each recorded run');
          verified = true;
          break;
        }
        console.log('Published home at ' + width + ' px, attempt ' + attempt + ': expected source '
          + manifest.commit + ' and HTML ' + expected + ', served source ' + source + ' and HTML ' + served);
        for (const error of mediaErrors) console.log(error);
      } finally {
        await context.close();
      }
      if (attempt < 6) await wait(10_000);
    }
    assert.ok(verified, 'Published home at ' + width + ' px: expected source ' + manifest.commit
      + ' and HTML ' + expected + ', served source ' + source + ' and HTML ' + served
      + (mediaErrors.length ? '\n' + mediaErrors.join('\n') : ''));
  }
} finally {
  await browser.close();
}
