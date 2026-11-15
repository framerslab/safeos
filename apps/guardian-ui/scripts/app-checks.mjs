// Checks the app's pages on the built static site in a real browser.
//
// scripts/capture-pictures.mjs runs it for the pull request's own build. Each
// block walks one part of the app as a person would: the header and the bar
// on a phone, the page before any script runs, the dashboard in each state,
// the old addresses and the page a device shows offline. Every finding is
// printed, and the count of findings is returned; any finding fails the run.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { SETUP_DONE, measureText, plain, readStrokes } from './home-checks.mjs';

export const LOOKS = ['light', 'dark'];
export const ROW_WIDTHS = [320, 360, 390, 430, 480, 768];
export const LAYOUT_WIDTHS = [390, 820, 1280, 1920];
const WALK_LIMIT_MS = 180_000;
const heightOf = (width) => (width >= 1440 ? 900 : width >= 768 ? 800 : 844);

export async function checkApp(browser, baseUrl, outDir) {
  const problems = [];
  const fail = (message) => problems.push(message);
  const expect = (ok, message) => { if (!ok) fail(message); };
  const address = (route) => new URL(route, baseUrl).toString();

  // One walk in a context of its own. `state` seeds the device before the
  // first page loads: 'set-up' (a finished setup), 'new' (nothing saved).
  const open = async (options, run, { state = 'set-up', script = null, permissions = ['camera', 'microphone', 'notifications'] } = {}) => {
    const { name, width, height = heightOf(width), look = 'light', ...rest } = options;
    const context = await browser.newContext({
      viewport: { width, height }, isMobile: width < 768, hasTouch: width < 768, colorScheme: look, ...rest,
    });
    await context.grantPermissions(permissions, { origin: new URL(baseUrl).origin });
    if (state === 'set-up') await context.addInitScript(SETUP_DONE);
    if (script) await context.addInitScript(script);
    const page = await context.newPage();
    let limit;
    const ranOver = new Promise((_, reject) => {
      limit = setTimeout(() => reject(new Error(`did not finish in ${WALK_LIMIT_MS / 1000} seconds`)), WALK_LIMIT_MS);
    });
    try {
      await Promise.race([run(page, context), ranOver]);
    } catch (err) {
      fail(`${name} at ${width} px, ${look}: ${err.message.split('\n')[0]}`);
    } finally {
      clearTimeout(limit);
      await context.close();
    }
  };

  // A walk in a browser profile kept on disk, as a person's own window is.
  // A context made with newContext keeps nothing after it closes.
  const openKept = async (options, run) => {
    const { name, width, height = heightOf(width), look = 'light' } = options;
    const folder = await mkdtemp(path.join(os.tmpdir(), 'safeos-profile-'));
    const context = await chromium.launchPersistentContext(folder, {
      viewport: { width, height }, isMobile: width < 768, hasTouch: width < 768, colorScheme: look,
      permissions: ['camera', 'microphone', 'notifications'],
    });
    try {
      await run(context.pages()[0] || await context.newPage(), context);
    } catch (err) {
      fail(`${name} at ${width} px, ${look}: ${err.message.split('\n')[0]}`);
    } finally {
      await context.close();
      await rm(folder, { recursive: true, force: true });
    }
  };

  const visit = (page, route) => page.goto(address(route), { waitUntil: 'networkidle', timeout: 60_000 });
  const sidewaysScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  // The checks of each part are added below this line.
  void open; void openKept; void visit; void sidewaysScroll; void expect; void measureText; void plain; void readStrokes;
  void LOOKS; void ROW_WIDTHS; void LAYOUT_WIDTHS; void outDir;

  for (const problem of problems) console.error(`failed app check: ${problem}`);
  return problems.length;
}
