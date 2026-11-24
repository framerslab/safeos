import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const address = 'https://safeos.sh/';
const expected = process.argv[2];
assert.match(expected ?? '', /^[a-f0-9]{64}$/, 'Pass the Pages build’s SHA-256 of out/index.html');

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
    let verified = false;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const context = await browser.newContext({
        viewport: { width, height }, isMobile: width === 390, hasTouch: width === 390,
        reducedMotion: 'reduce', serviceWorkers: 'block',
        extraHTTPHeaders: { 'Cache-Control': 'no-cache' },
      });
      try {
        const page = await context.newPage();
        try {
          const response = await page.goto(address, { waitUntil: 'domcontentloaded', timeout: 20_000 });
          served = response?.ok()
            ? createHash('sha256').update(await response.body()).digest('hex')
            : `HTTP ${response?.status() ?? 'no response'}`;
        } catch (error) {
          served = `navigation failed: ${String(error).split('\n')[0]}`;
        }
        if (served === expected) {
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
          console.log(`Published home at ${width} px serves ${served} with the diagram and setup links`);
          verified = true;
          break;
        }
        console.log(`Published home at ${width} px, attempt ${attempt}: expected ${expected}, served ${served}`);
      } finally {
        await context.close();
      }
      if (attempt < 6) await wait(10_000);
    }
    assert.ok(verified, `Published home at ${width} px: expected ${expected}, served ${served}`);
  }
} finally {
  await browser.close();
}
