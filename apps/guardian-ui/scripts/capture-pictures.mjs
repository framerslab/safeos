// Captures screenshots of the built static site for review.
//
//   node scripts/capture-pictures.mjs <base-url> <out-dir> <route> [<route> ...]
//
// Each route is captured at 390, 820, 1280 and 1920 pixels wide, in the light
// and the dark look (the browser's prefers-color-scheme, which the app follows
// when no theme is saved), as a full-page PNG named <route>-<width>-<look>.png.
// The pictures workflow (.github/workflows/pictures.yml) runs it in CI.
//
// When the home page is captured for the pull request's own build
// (PICTURE_VERSION=after), it also checks a first visit in a real browser:
// the visitor header (the navigation named "Site") stays one row with every
// control inside the screen from 320 to 1280 pixels, its text is 16 pixels or
// more and its targets 44 pixels tall; the look switch ("Switch to the dark
// look" or "Switch to the light look") changes the page; no notification
// prompt appears; the new H1 and setup's second heading reach their contrast;
// at 320 by 480 the open Menu's last row is on screen or reachable by
// scrolling the Menu, Escape closes it and focus returns to the Menu key; and
// the alert key on the Test Alerts page starts the alert's two generated tones
// on a running audio context, an analyser on the way to the speakers reads
// samples that are not all zero, and the page makes no request under /sounds/.
// It then walks the home page part by part (scripts/home-checks.mjs) and
// what every public page shares: the header's row, the GitHub link with its
// star count, the keys and the makers' marks
// (scripts/public-chrome-checks.mjs). Any failure fails the run. Both versions
// also capture the public header and footer on their own
// (site-header-<width>-<look>.png, site-footer-<width>-<look>.png), the open
// Menu at 390 pixels (site-menu-390-<look>.png) and, with /about/, About's
// part on who builds SafeOS (about-builders-<width>-<look>.png). The
// dashboard's link to the Security page is checked with the dashboard, below.
//
// When /dashboard/ is captured, both versions also capture the dashboard as a
// person who has finished setup sees it (dashboard-setup-<width>-<look>.png).
// The pull request's own build then checks that each of the four ways to
// watch is visible at each width and opens its page, whose own heading
// carries the row's name.
//
// When /monitor/ is captured, both versions also capture the watch's first
// screen on a device whose setup chose Lost & Found, with no pet saved and
// with a pet of three photos (monitor-lost-found-<none|pet>-<width>-<look>.png);
// the pull request's own build is checked to show Lost and Found checked with
// "No pet saved" or the pet's count of photos.
//
// When /setup/ is captured, both versions also capture setup's camera step
// after a refused camera request (setup-camera-refused-<width>-<look>.png).
// The pull request's own build is then walked from a first visit to the
// dashboard with no camera: after a refused request, with no camera found and
// with the runner's own browser, which has no camera and nothing answering
// for it.
// Each walk reads what the step says, presses "Continue without the camera",
// finishes setup, lands on the dashboard and reloads it, and the dashboard
// stays. At 320, 390 and 1280 pixels it checks that Back, the request key and
// "Continue without the camera" are whole and on screen, that the new key is
// a button reached with Tab and pressed with Enter, 44 pixels tall on a phone,
// and that the line under it is 16 pixels or more at 4.5 to 1; and that the
// scenario step shows "Continue" beside Back for a scenario already chosen.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { skipsInBase } from './base-routes.mjs';

const [baseUrl, outDir, ...routes] = process.argv.slice(2);
if (!baseUrl || !outDir || routes.length === 0) {
  console.error('usage: capture-pictures.mjs <base-url> <out-dir> <route> [<route> ...]');
  process.exit(2);
}

// One width for each layout: phone, tablet, desktop and wide.
const WIDTHS = [
  { width: 390, height: 844, isMobile: true },
  { width: 820, height: 800, isMobile: false },
  { width: 1280, height: 800, isMobile: false },
  { width: 1920, height: 1080, isMobile: false },
];
const LOOKS = ['light', 'dark'];

// A window opened here keeps nothing on disk, and a headless browser reads
// notifications as blocked; the dashboard says each of the two to a person.
// A picture stands for a person's own window, so the page is told that its
// storage is kept and that notifications are allowed.
const OWN_WINDOW = () => {
  try { sessionStorage.setItem('safeos-window-storage', 'kept'); } catch (e) { /* storage refused */ }
  try {
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' });
  } catch (e) { /* this browser has no notifications */ }
};

function slug(route) {
  const s = route.replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9]+/g, '-');
  return s || 'home';
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
let failures = 0;
try {
  if (routes.includes('/')) failures += await captureHomeFirst(browser, baseUrl, outDir);
  for (const route of routes) {
    for (const size of WIDTHS) {
      for (const look of LOOKS) {
        const context = await browser.newContext({
          viewport: { width: size.width, height: size.height },
          isMobile: size.isMobile,
          hasTouch: size.isMobile,
          colorScheme: look,
          deviceScaleFactor: 1,
        });
        await context.addInitScript(OWN_WINDOW);
        if (route === '/export/') {
          // Render the signed-in server export screen in both base and head builds.
          await context.addInitScript(() => {
            localStorage.setItem('safeos_backend_config', JSON.stringify({ apiUrl: 'https://pictures.example.test' }));
            localStorage.setItem('safeos-auth', JSON.stringify({ state: {
              isInitialized: true, isAuthenticated: true, sessionToken: 'picture-session',
            }, version: 0 }));
          });
          await context.route('https://pictures.example.test/**', request => request.fulfill({
            contentType: 'application/json', body: JSON.stringify({ status: 'ok', data: {
              sessionId: 'picture-session', token: 'picture-token', isGuest: false,
              expiresAt: '2099-01-01T00:00:00Z', profile: {
                id: 'picture-person', displayName: 'Picture person', preferences: {}, notificationSettings: {},
              },
            } }),
          }));
          await context.route('https://pictures.example.test/api/export/**', request => request.fulfill({
            contentType: 'application/json',
            headers: {
              'Content-Disposition': 'attachment; filename="safeos-profile.json"',
              'Access-Control-Expose-Headers': 'Content-Disposition',
            },
            body: JSON.stringify({ success: true, data: {
              monitoringSettingsOmitted: 2,
              notificationSettingsOmitted: 1,
              profile: { notification_settings: null },
              monitoringProfiles: [
                { id: 'picture-profile-one', settings: null },
                { id: 'picture-profile-two', settings: null },
              ],
            } }),
          }));
        }
        const page = await context.newPage();
        const url = new URL(route, baseUrl).toString();
        const file = path.join(outDir, `${slug(route)}-${size.width}-${look}.png`);
        try {
          const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
          if (!response || !response.ok()) {
            // The base build of a pull request that adds a page has no such
            // page: it is noted and skipped, not failed. A page the base
            // commit holds fails (scripts/base-routes.mjs).
            if (response && skipsInBase({ route, status: response.status(), version: process.env.PICTURE_VERSION, appDir: process.cwd() })) {
              console.log(`not in the base build: ${route}`);
              continue;
            }
            throw new Error(`HTTP ${response ? response.status() : 'no response'}`);
          }
          if (route === '/export/') {
            await page.getByRole('button', { name: 'Download Export' }).waitFor();
            const exportContent = page.locator('#main-content > div').filter({
              has: page.getByRole('heading', { name: 'Export Data', exact: true }),
            });
            await exportContent.screenshot({ path: file, style: 'nav { visibility: hidden !important; }' });
            await page.getByRole('button', { name: /Profile & Settings/ }).click();
            await Promise.all([
              page.waitForEvent('download'),
              page.getByRole('button', { name: 'Download Export' }).click(),
            ]);
            await page.getByText(/Downloaded safeos-profile.json/).waitFor();
            const noticeFile = path.join(outDir, `export-notice-${size.width}-${look}.png`);
            await exportContent.screenshot({ path: noticeFile, style: 'nav { visibility: hidden !important; }' });
            console.log(`captured ${noticeFile}`);
          } else if (route === '/privacy/') {
            await page.locator('#main-content').screenshot({ path: file, style: 'nav { visibility: hidden !important; }' });
          } else {
            await page.screenshot({ path: file, fullPage: true });
          }
          console.log(`captured ${file}`);
          // The public header, the footer and the open Menu on their own, and
          // About's part on who builds SafeOS, so the two versions read side
          // by side. The footer's pictures load when it comes into view. The
          // bars fixed to the screen would cover a part taller than it, so
          // they are left out of the pictures of a part.
          const noBars = 'nav[aria-label="Site"], nav[aria-label="Mobile navigation"] { visibility: hidden !important; }';
          if (route === '/') {
            await page.locator('nav[aria-label="Site"]').screenshot({ path: path.join(outDir, `site-header-${size.width}-${look}.png`) });
            const footer = page.locator('footer.site-footer');
            await footer.scrollIntoViewIfNeeded();
            await page.waitForFunction(() => [...document.querySelectorAll('footer.site-footer img')]
              .filter((image) => getComputedStyle(image).display !== 'none').every((image) => image.complete), null, { timeout: 15_000 });
            await footer.screenshot({ path: path.join(outDir, `site-footer-${size.width}-${look}.png`), style: noBars });
            if (size.width < 768) {
              await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
              await page.locator('nav[aria-label="Site"] button.site-header__menu-key').click();
              const menu = page.locator('#site-menu');
              await menu.waitFor({ timeout: 5_000 });
              await menu.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)).then(() => true));
              await page.screenshot({ path: path.join(outDir, `site-menu-${size.width}-${look}.png`) });
            }
          }
          if (route === '/about/') {
            const builders = page.locator('section').filter({ has: page.getByRole('heading', { name: /Who builds SafeOS|Built by Frame\.dev/ }) }).first();
            await builders.scrollIntoViewIfNeeded();
            await page.waitForFunction((section) => [...section.querySelectorAll('img')]
              .filter((image) => getComputedStyle(image).display !== 'none').every((image) => image.complete), await builders.elementHandle(), { timeout: 15_000 });
            await builders.screenshot({ path: path.join(outDir, `about-builders-${size.width}-${look}.png`), style: noBars });
          }
        } catch (err) {
          failures += 1;
          console.error(`failed ${url} at ${size.width} ${look}: ${err.message}`);
        } finally {
          await context.close();
        }
      }
    }
  }
  if (process.env.PICTURE_VERSION === 'after' && routes.includes('/')) {
    failures += await checkFirstVisit(browser, baseUrl, outDir);
    // The base build has no such file, so it is loaded only for the pull
    // request's own build.
    const { checkHomePage } = await import('./home-checks.mjs');
    failures += await checkHomePage(browser, baseUrl, outDir);
    failures += await checkHomeUseSetup(browser, baseUrl);
  }
  // The app's own pages, for the pull request's own build. The base build
  // has no such file, so it is loaded only here.
  if (process.env.PICTURE_VERSION === 'after') {
    const { checkApp } = await import('./app-checks.mjs');
    failures += await checkApp(browser, baseUrl, outDir);
  }
  if (routes.includes('/dashboard/')) {
    failures += await captureDashboardAfterSetup(browser, baseUrl, outDir);
    if (process.env.PICTURE_VERSION === 'after') failures += await checkModeLinks(browser, baseUrl, outDir);
  }
  // Setup's camera step after a refused request, in both versions. The pull
  // request's own build is then walked to the dashboard with no camera.
  if (routes.includes('/setup/')) {
    failures += await captureCameraStepRefused(browser, baseUrl, outDir);
    if (process.env.PICTURE_VERSION === 'after') failures += await checkSetupWithoutCamera(browser, baseUrl, outDir);
  }
  // Exercise the real database lifecycle in fresh contexts. The base build has
  // no notice, so its pictures show the same screen while the upgrade waits.
  if (routes.includes('/monitor/')) {
    for (const scenario of ['updated', 'blocked', 'failed']) {
      for (const size of WIDTHS) {
        for (const look of LOOKS) {
          const context = await browser.newContext({
            viewport: { width: size.width, height: size.height },
            isMobile: size.isMobile, hasTouch: size.isMobile, colorScheme: look,
          });
          const page = await context.newPage();
          try {
            if (scenario === 'blocked') {
              await page.addInitScript(() => {
                const request = indexedDB.open('safeos-guardian', 4);
                request.onsuccess = () => { window.pictureOldDatabase = request.result; };
              });
            }
            if (scenario === 'failed') {
              // A version 4 history with one alert, whose upgrade cannot rewrite it.
              await page.addInitScript(() => {
                const request = indexedDB.open('safeos-guardian', 4);
                request.onupgradeneeded = () => {
                  const alerts = request.result.createObjectStore('alert_cache', { keyPath: 'id' });
                  alerts.createIndex('by-stream', 'streamId');
                  alerts.createIndex('by-created', 'createdAt');
                  alerts.put({ id: 'picture-saved', streamId: 'camera', severity: 'low', message: 'Saved before the update',
                    monitoring: true, acknowledged: false, createdAt: '2026-10-01T00:00:00.000Z' });
                };
                request.onsuccess = () => {
                  request.result.onversionchange = () => request.result.close();
                  request.result.close();
                };
                IDBCursor.prototype.update = () => { throw new DOMException('No space left', 'QuotaExceededError'); };
              });
            }
            await page.goto(new URL('/monitor/', baseUrl).toString(), { waitUntil: 'networkidle' });
            if (scenario === 'updated') {
              await page.evaluate(() => new Promise((resolve, reject) => {
                const observer = indexedDB.open('safeos-guardian');
                observer.onerror = () => reject(observer.error);
                observer.onsuccess = () => {
                  const version = observer.result.version;
                  observer.result.close();
                  const newer = indexedDB.open('safeos-guardian', version + 1);
                  newer.onsuccess = () => { newer.result.close(); resolve(); };
                  newer.onblocked = () => resolve();
                  newer.onerror = () => reject(newer.error);
                };
              }));
            }
            if (process.env.PICTURE_VERSION === 'after') {
              await page.getByRole('button', { name: 'Reload SafeOS' }).waitFor();
              const notice = page.getByRole('alert').filter({ has: page.getByRole('button', { name: 'Reload SafeOS' }) });
              const words = scenario === 'blocked' ? 'Close other SafeOS tabs'
                : scenario === 'failed' ? 'SafeOS could not finish updating your saved history, so it is not shown in this tab.'
                  : 'updated in another tab';
              if (!(await notice.textContent()).includes('Until you reload, new alerts in this tab are shown but not saved, and acknowledging, dismissing or clearing alerts is not saved.')) throw new Error('Missing unsaved-alert disclosure');
              if (scenario !== 'failed' && !(await notice.textContent()).includes('Everything already saved comes back as it was after you reload.')) throw new Error('Missing unsaved-alert disclosure');
              if (!(await notice.textContent()).includes(words)) throw new Error('Missing database update guidance');
              const contrast = await notice.evaluate(element => {
                const luminance = color => {
                  const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
                    const channel = value / 255;
                    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
                  });
                  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
                };
                const foreground = luminance(getComputedStyle(element.querySelector('p')).color);
                const background = luminance(getComputedStyle(element).backgroundColor);
                return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
              });
              if (contrast < 4.5) throw new Error(`Database notice contrast ${contrast.toFixed(2)} is below 4.5`);
            }
            await page.locator('#main-content').screenshot({ path: path.join(outDir, `monitor-${scenario}-${size.width}-${look}.png`),
              style: 'nav { visibility: hidden !important; }' });
          } catch (err) {
            failures += 1;
            console.error(`failed monitor ${scenario} at ${size.width} ${look}: ${err.message}`);
          } finally {
            await context.close();
          }
        }
      }
    }
    failures += await captureLostAndFoundWatch(browser, baseUrl, outDir);
  }
  // A profile save of a server session that the server does not take, and one of a browser-only
  // session that this browser cannot write. The base build shows its own words for the same saves;
  // in the head build CI checks the words.
  const saves = [
    ...(routes.includes('/settings/notifications/') ? [
      { name: 'notifications-server-refused', route: '/settings/notifications/', button: 'Save changes',
        browserOnly: false, localFails: false,
        words: 'The server did not take the change. Save again when you are connected.' },
      { name: 'notifications-not-saved', route: '/settings/notifications/', button: 'Save changes',
        browserOnly: true, localFails: true,
        words: 'Notification settings were not saved. Try again.' },
    ] : []),
  ];
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Session-Token',
  };
  for (const save of saves) {
    for (const size of WIDTHS) {
      for (const look of LOOKS) {
        const context = await browser.newContext({
          viewport: { width: size.width, height: size.height },
          isMobile: size.isMobile, hasTouch: size.isMobile, colorScheme: look,
        });
        await context.addInitScript(({ localFails }) => {
          // With a server and its socket address saved, the dashboard starts the session.
          localStorage.setItem('safeos_backend_config', JSON.stringify({
            apiUrl: 'https://pictures.example.test', wsUrl: 'wss://pictures.example.test/ws' }));
          // A returning person, so the dashboard opens without the first-run screens.
          localStorage.setItem('safeos-onboarding', JSON.stringify({ state: {
            isComplete: true, selectedScenario: 'pet',
            acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
          }, version: 0 }));
          localStorage.setItem('guardian-onboarding-complete', 'true');
          if (localFails) {
            // This browser cannot write the profile cache, as when storage is full.
            const put = IDBObjectStore.prototype.put;
            IDBObjectStore.prototype.put = function (...args) {
              if (this.name === 'profile_cache') throw new DOMException('No space left', 'QuotaExceededError');
              return put.apply(this, args);
            };
          }
        }, { localFails: save.localFails });
        await context.route('https://pictures.example.test/**', request => {
          const method = request.request().method();
          if (method === 'OPTIONS') return request.fulfill({ status: 204, headers: cors });
          // The server refuses the profile change.
          if (method === 'PATCH') return request.fulfill({ status: 500, headers: cors,
            contentType: 'application/json', body: JSON.stringify({ success: false }) });
          // For a browser-only session the server does not make the session, so the tab makes a guest
          // session in this browser.
          if (method === 'POST' && save.browserOnly) return request.fulfill({ status: 500, headers: cors,
            contentType: 'application/json', body: '{"success":false}' });
          // The server is up and answers the session route; its other reads find nothing.
          const pathname = new URL(request.request().url()).pathname;
          if (pathname === '/health') return request.fulfill({ headers: cors, contentType: 'application/json', body: '{"status":"ok"}' });
          if (!pathname.startsWith('/api/auth/session')) {
            return request.fulfill({ status: 404, headers: cors, contentType: 'application/json', body: '{"success":false}' });
          }
          return request.fulfill({ headers: cors, contentType: 'application/json', body: JSON.stringify({ status: 'ok', data: {
            sessionId: 'picture-session', token: 'picture-token', isGuest: false, expiresAt: '2099-01-01T00:00:00Z',
            profile: { id: 'picture-person', displayName: 'Picture person', avatarUrl: null,
              preferences: { defaultScenario: 'pet', motionSensitivity: 0.5, audioSensitivity: 0.5, alertVolume: 0.7, theme: 'system' },
              notificationSettings: { browserPush: true, sms: false, telegram: false, emailDigest: false,
                quietHoursStart: null, quietHoursEnd: null } },
          } }) });
        });
        const page = await context.newPage();
        // What the page asked the fixture server, reported when a capture fails.
        const asked = [];
        page.on('requestfinished', async request => {
          if (!request.url().startsWith('https://pictures.example.test/')) return;
          const response = await request.response().catch(() => null);
          asked.push(`${request.method()} ${new URL(request.url()).pathname} ${response ? response.status() : '-'}`);
        });
        page.on('pageerror', error => asked.push(`page error: ${error.message}`));
        page.on('requestfailed', request => {
          if (request.url().startsWith('https://pictures.example.test/')) {
            asked.push(`${request.method()} ${new URL(request.url()).pathname} failed: ${request.failure()?.errorText}`);
          }
        });
        const file = path.join(outDir, `${save.name}-${size.width}-${look}.png`);
        try {
          // The settings pages do not start a session themselves: the dashboard does, then the page
          // is opened inside the app, so the profile stays in memory as when a person clicks there.
          const sessionMade = page.waitForResponse(response => response.url().endsWith('/api/auth/session')
            && response.request().method() === 'POST', { timeout: 60_000 });
          await page.goto(new URL('/dashboard/', baseUrl).toString(), { waitUntil: 'load', timeout: 60_000 });
          await sessionMade;
          // The session is saved in this browser before the tab holds it.
          await page.waitForTimeout(1_000);
          await page.locator('a[href="/settings/"]:visible, a[href="/settings"]:visible').first().click();
          // Settings links to Notifications (the base build's section link, the list's row in
          // this one); the press waits until the page has mounted, with no value still loading.
          await page.locator('a[href^="/settings/notifications"]:visible').first().waitFor({ timeout: 20_000 });
          await page.waitForFunction(() => !document.querySelector('.set-row__loading'), null, { timeout: 20_000 });
          if (save.route === '/settings/notifications/') {
            await page.locator('a[href^="/settings/notifications"]:visible').first().click();
          }
          await page.getByRole('button', { name: save.button, exact: true }).click({ timeout: 20_000 });
          const message = process.env.PICTURE_VERSION === 'after'
            ? page.getByText(save.words, { exact: true })
            : page.getByText(/^(Notification settings|Saved |Settings saved|Failed to save|The server did not take)/);
          await message.first().waitFor({ timeout: 10_000 });
          // The whole page, so the message shows wherever it sits. The site's fixed bars are left out,
          // since the Settings message sits at the top right, where the top bar covers it.
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: file, fullPage: true, style: 'nav.fixed, nav[aria-label="App"], nav.phone-bar { display: none !important; }' });
          console.log(`captured ${file}`);
        } catch (err) {
          failures += 1;
          console.error(`failed ${save.name} at ${size.width} ${look}: ${err.message}`);
          console.error(`  at ${page.url()}; asked: ${JSON.stringify(asked)}`);
        } finally {
          await context.close();
        }
      }
    }
  }
} finally {
  await browser.close();
}
process.exit(failures > 0 ? 1 : 0);

// -----------------------------------------------------------------------------
// First-visit checks (pull request build only)
// -----------------------------------------------------------------------------

// WCAG contrast of an element's text against the colour behind it, with
// translucent text and backgrounds composited over the layers beneath.
function contrastOf(locator) {
  return locator.evaluate((element) => {
    const parse = (value) => {
      const n = value.match(/[\d.]+/g).map(Number);
      return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
    };
    const over = (top, bottom) => ({
      r: top.r * top.a + bottom.r * (1 - top.a),
      g: top.g * top.a + bottom.g * (1 - top.a),
      b: top.b * top.a + bottom.b * (1 - top.a),
      a: 1,
    });
    const layers = [];
    for (let node = element; node; node = node.parentElement) {
      const background = parse(getComputedStyle(node).backgroundColor);
      if (background.a > 0) layers.push(background);
      if (background.a >= 1) break;
    }
    let background = { r: 255, g: 255, b: 255, a: 1 };
    for (const layer of layers.reverse()) background = over(layer, background);
    const text = over(parse(getComputedStyle(element).color), background);
    const luminance = (c) => [c.r, c.g, c.b]
      .map((v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; })
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const a = luminance(text);
    const b = luminance(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
}

async function captureHomeFirst(browser, baseUrl, outDir) {
  let failures = 0;
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    for (const look of LOOKS) {
      const context = await browser.newContext({
        viewport: { width, height }, deviceScaleFactor: 2, reducedMotion: 'no-preference',
        colorScheme: look, isMobile: width === 390, hasTouch: width === 390,
      });
      try {
        const page = await context.newPage();
        await page.goto(new URL('/', baseUrl).toString(), { waitUntil: 'networkidle', timeout: 60_000 });
        await page.evaluate(() => document.fonts.ready);
        const first = `home-first-${width}-${look}.png`;
        await page.screenshot({ path: path.join(outDir, first), scale: 'device', caret: 'hide' });
        console.log(`captured ${first}`);

        if (process.env.PICTURE_VERSION !== 'after') continue;
        const hideBar = 'nav[aria-label="Site"] { visibility: hidden !important; }';
        const picture = async (locator, name) => {
          const file = `home-${name}-${width}-${look}.png`;
          await locator.screenshot({ path: path.join(outDir, file), scale: 'device', style: hideBar, timeout: 15_000 });
          console.log(`captured ${file}`);
        };
        if ((width === 390 && look === 'light') || (width === 1440 && look === 'dark')) {
          await picture(page.locator('.home-diagram'), 'how-it-works');
        }
        if (width === 1440 && look === 'dark') {
          const lostAndFound = page.locator('[data-card="lost-found"]');
          await lostAndFound.locator('summary').press('Space');
          await picture(lostAndFound, 'lost-and-found');
          const device = page.locator('#one-device');
          await device.locator('img').scrollIntoViewIfNeeded();
          await device.locator('img').evaluate((image) => image.decode());
          await picture(device, 'device');
          await picture(page.locator('#uses'), 'uses');
          await picture(page.locator('section:has(.home-closing)'), 'closing');
        }
      } catch (error) {
        failures += 1;
        console.error(`failed home pictures at ${width} px, ${look}: ${error.message}`);
      } finally {
        await context.close();
      }
    }
  }
  return failures;
}

async function checkFirstVisit(browser, baseUrl, outDir) {
  const HEADER_WIDTHS = [320, 360, 390, 430, 480, 768, 820, 1024, 1280];
  const problems = [];
  const home = new URL('/', baseUrl).toString();

  // The visitor header: one row, every control on screen, no text under
  // 16 px, targets 44 px tall (the look switch and Menu 44 px wide too).
  for (const width of HEADER_WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: 800 },
      isMobile: width < 768,
      hasTouch: width < 768,
      colorScheme: 'light',
    });
    const page = await context.newPage();
    try {
      await page.goto(home, { waitUntil: 'networkidle', timeout: 60_000 });
      const header = page.locator('nav[aria-label="Site"]');
      const found = await header.evaluate((nav, phone) => {
        const out = [];
        const row = nav.firstElementChild;
        const rowBox = row.getBoundingClientRect();
        const screenWidth = document.documentElement.clientWidth;
        if (rowBox.height > 64.5) out.push(`row is ${Math.round(rowBox.height)} px tall`);
        const controls = [...row.querySelectorAll('a, button')].filter((el) => {
          const box = el.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        });
        if (phone && !controls.some((el) => el.classList.contains('look-switch'))) out.push('the look switch is missing');
        if (phone && !controls.some((el) => el.classList.contains('site-header__menu-key'))) out.push('Menu is missing');
        for (const el of controls) {
          const box = el.getBoundingClientRect();
          const name = el.getAttribute('aria-label') || el.textContent.trim() || el.tagName;
          if (box.left < -0.5 || box.right > screenWidth + 0.5) {
            out.push(`${name} runs off the screen (${Math.round(box.left)} to ${Math.round(box.right)} of ${screenWidth})`);
          }
          if (box.top < rowBox.top - 0.5 || box.bottom > rowBox.bottom + 0.5) out.push(`${name} is outside the row`);
          if (box.height < 43.5 || (el.tagName === 'BUTTON' && box.width < 43.5)) {
            out.push(`${name} is ${Math.round(box.width)} by ${Math.round(box.height)} px`);
          }
        }
        const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const words = walker.currentNode.textContent.trim();
          const parent = walker.currentNode.parentElement;
          if (!words || parent.getBoundingClientRect().width === 0) continue;
          const size = parseFloat(getComputedStyle(parent).fontSize);
          if (size < 16) out.push(`"${words}" is ${size} px`);
        }
        return out;
      }, width < 768);
      for (const p of found) problems.push(`header at ${width} px: ${p}`);
      console.log(`checked header at ${width} px`);
    } catch (err) {
      problems.push(`header at ${width} px: ${err.message}`);
    } finally {
      await context.close();
    }
  }

  for (const look of LOOKS) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      colorScheme: look,
    });
    const page = await context.newPage();
    try {
      await page.goto(home, { waitUntil: 'networkidle', timeout: 60_000 });

      // The headline: body text and headings read at 12 to 1 or more.
      const headline = page.getByRole('heading', { level: 1, name: 'Free motion and sound alerts from an old phone or laptop', exact: true });
      const headlineRatio = await contrastOf(headline);
      if (headlineRatio < 12) problems.push(`${look}: the headline's contrast ${headlineRatio.toFixed(2)} is below 12`);

      // No notification prompt on a first visit, however long it stays.
      await page.waitForTimeout(6_000);
      if (await page.getByText('Enable notifications').count()) {
        problems.push(`${look}: the home page shows a notification prompt before setup`);
      }

      // The look switch changes the page, not only its icon.
      const other = look === 'light' ? 'dark' : 'light';
      const before = await page.evaluate(() => document.documentElement.className);
      if (!before.split(/\s+/).includes(look)) problems.push(`${look}: the page starts as "${before}"`);
      await page.getByRole('button', { name: `Switch to the ${other} look`, exact: true }).click();
      await page.waitForFunction((want) => document.documentElement.classList.contains(want), other, { timeout: 5_000 })
        .catch(() => problems.push(`${look}: the look switch left the page as "${before}"`));
      await page.screenshot({ path: path.join(outDir, `home-after-theme-button-390-${look}.png`) });

      // Setup's second step heading.
      await page.goto(new URL('/setup/', baseUrl).toString(), { waitUntil: 'networkidle', timeout: 60_000 });
      await page.evaluate(() => localStorage.removeItem('guardian-theme'));
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /Begin Setup/i }).click();
      const warning = page.getByText('This is a supplementary monitoring tool.', { exact: true });
      await warning.waitFor({ timeout: 10_000 });
      const ratio = await contrastOf(warning);
      if (ratio < 4.5) problems.push(`${look}: setup step 2 heading contrast ${ratio.toFixed(2)} is below 4.5`);
      console.log(`checked first visit in the ${look} look`);
    } catch (err) {
      problems.push(`first visit in the ${look} look: ${err.message}`);
    } finally {
      await context.close();
    }
  }

  // The Menu on a short phone screen: its last row is on screen or reachable
  // by scrolling the Menu itself (a fixed header cannot be reached by
  // scrolling the page); Escape closes it; focus goes back to the Menu key
  // whenever it closes.
  {
    const context = await browser.newContext({
      viewport: { width: 320, height: 480 },
      isMobile: true,
      hasTouch: true,
      colorScheme: 'light',
    });
    const page = await context.newPage();
    try {
      await page.goto(home, { waitUntil: 'networkidle', timeout: 60_000 });
      const toggle = page.locator('nav[aria-label="Site"] button[aria-controls="site-menu"]');
      const menu = page.locator('#site-menu');
      await toggle.click();
      await menu.waitFor({ timeout: 5_000 });
      // The picture shows the Menu as a visitor reads it, after its fade.
      await menu.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)).then(() => true));
      const drawn = await menu.evaluate((element) => ({
        opacity: getComputedStyle(element).opacity,
        fading: element.getAnimations().filter((animation) => animation.playState === 'running').length,
      }));
      if (drawn.opacity !== '1' || drawn.fading !== 0) {
        problems.push(`menu at 320 by 480: the open Menu is pictured while its panel fades in (opacity ${drawn.opacity})`);
      }
      await page.screenshot({ path: path.join(outDir, 'menu-open-320x480-light.png') });
      const last = await menu.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
        const controls = [...element.querySelectorAll('a, button')];
        const box = controls[controls.length - 1].getBoundingClientRect();
        return { top: box.top, bottom: box.bottom, height: window.innerHeight, name: controls[controls.length - 1].textContent.trim() };
      });
      if (last.bottom > last.height + 0.5 || last.top < 0) {
        problems.push(`menu at 320 by 480: "${last.name}" sits at ${Math.round(last.top)} to ${Math.round(last.bottom)} px of ${last.height} and the menu does not scroll to it`);
      }
      await page.screenshot({ path: path.join(outDir, 'menu-scrolled-320x480-light.png') });
      await menu.locator('a, button').last().focus();
      await page.keyboard.press('Escape');
      if (await menu.isVisible()) problems.push('menu at 320 by 480: Escape leaves the menu open');
      else if (!(await toggle.evaluate((element) => element === document.activeElement))) {
        problems.push('menu at 320 by 480: after Escape, focus is not on the Menu key');
      }
      if ((await toggle.getAttribute('aria-expanded')) !== 'false') problems.push('menu at 320 by 480: the closed Menu key is still marked as open');
      console.log('checked the Menu at 320 by 480');
    } catch (err) {
      problems.push(`menu at 320 by 480: ${err.message}`);
    } finally {
      await context.close();
    }
  }

  // The Test Alerts page's alert key plays the generated alert: its two tones
  // start on a running audio context, signal reaches the speakers, and the
  // page asks for no sound file.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
    await context.addInitScript(() => {
      // peak: the largest sample that reached the context's destination;
      // gainPeak: the largest value of a gain connected to the destination.
      const heard = { started: 0, contexts: new Set(), peak: 0, gainPeak: 0 };
      window.pictureAudio = heard;
      const start = OscillatorNode.prototype.start;
      OscillatorNode.prototype.start = function (...args) {
        heard.started += 1;
        heard.contexts.add(this.context);
        return start.apply(this, args);
      };

      // Everything the page connects to a context's destination goes through
      // one bus per context instead; the bus feeds the destination and an
      // analyser. A node that is disconnected, or a gain held at zero, gives
      // the analyser nothing but zeros.
      const connect = AudioNode.prototype.connect;
      const buses = new Map();
      const toDestination = new Set();
      const busFor = (audio) => {
        if (!buses.has(audio)) {
          const bus = audio.createGain();
          const analyser = audio.createAnalyser();
          const sink = audio.createGain();
          sink.gain.value = 0;
          connect.call(bus, audio.destination);
          connect.call(bus, analyser);
          // The analyser feeds a silent sink, so the graph pulls it.
          connect.call(analyser, sink);
          connect.call(sink, audio.destination);
          const samples = new Float32Array(analyser.fftSize);
          setInterval(() => {
            analyser.getFloatTimeDomainData(samples);
            for (const sample of samples) heard.peak = Math.max(heard.peak, Math.abs(sample));
            for (const node of toDestination) {
              if (node instanceof GainNode) heard.gainPeak = Math.max(heard.gainPeak, node.gain.value);
            }
          }, 10);
          buses.set(audio, bus);
        }
        return buses.get(audio);
      };
      AudioNode.prototype.connect = function (target, ...rest) {
        if (target instanceof AudioDestinationNode) {
          toDestination.add(this);
          return connect.call(this, busFor(this.context), ...rest);
        }
        return connect.call(this, target, ...rest);
      };
      const disconnect = AudioNode.prototype.disconnect;
      AudioNode.prototype.disconnect = function (...args) {
        if (args.length === 0 || args[0] instanceof AudioDestinationNode) toDestination.delete(this);
        if (args[0] instanceof AudioDestinationNode) return disconnect.call(this, busFor(this.context), ...args.slice(1));
        return disconnect.apply(this, args);
      };
    });
    const soundFiles = [];
    context.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/sounds/')) soundFiles.push(new URL(request.url()).pathname);
    });
    const page = await context.newPage();
    try {
      await page.goto(new URL('/settings/test-alerts/', baseUrl).toString(), { waitUntil: 'networkidle', timeout: 60_000 });
      const soundTests = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Sound Tests', exact: true }) });
      await soundTests.getByRole('button', { name: /^alert$/i }).click();
      await page.waitForFunction(() => window.pictureAudio.started >= 2, null, { timeout: 5_000 }).catch(() => {});
      // Give a file request that the press starts time to show.
      await page.waitForTimeout(1_000);
      const heard = await page.evaluate(() => ({
        started: window.pictureAudio.started,
        states: [...window.pictureAudio.contexts].map((audio) => audio.state),
        peak: window.pictureAudio.peak,
        gainPeak: window.pictureAudio.gainPeak,
      }));
      const states = heard.states.join(', ') || 'none';
      if (heard.started < 2) problems.push(`alert sound: ${heard.started} tones started, the alert has 2`);
      if (heard.states.length === 0 || heard.states.some((state) => state !== 'running')) {
        problems.push(`alert sound: audio context state is ${states}, not running`);
      }
      if (!(heard.peak > 0)) {
        problems.push(`alert sound: every sample that reached the speakers was zero (largest connected gain ${heard.gainPeak})`);
      }
      if (soundFiles.length) problems.push(`alert sound: the page asked for ${soundFiles.join(', ')}`);
      console.log(`checked the alert sound: ${heard.started} tones started, audio context ${states}, largest sample ${heard.peak.toFixed(3)}, largest connected gain ${heard.gainPeak}, ${soundFiles.length} sound files asked for`);
    } catch (err) {
      problems.push(`alert sound: ${err.message}`);
    } finally {
      await context.close();
    }
  }

  for (const p of problems) console.error(`failed first-visit check: ${p}`);
  return problems.length;
}

// -----------------------------------------------------------------------------
// The watch with Lost and Found chosen
// -----------------------------------------------------------------------------

// Saves Miso, a pet with three photos, into this browser's database as the
// Lost & Found page saves one. The page must have opened the database first.
async function savePicturePet(page) {
  for (let tries = 0; tries < 60; tries += 1) {
    const ready = await page.evaluate(async () => {
      const known = await indexedDB.databases();
      if (!known.some((database) => database.name === 'safeos-guardian')) return false;
      return new Promise((resolve) => {
        const opening = indexedDB.open('safeos-guardian');
        opening.onerror = () => resolve(false);
        opening.onsuccess = () => {
          const has = opening.result.objectStoreNames.contains('subject_profile');
          opening.result.close();
          resolve(has);
        };
      });
    });
    if (ready) break;
    await page.waitForTimeout(500);
  }
  await page.evaluate(async () => {
    // A stand-in photo: a light floor with a brown and white dog's shape.
    const photo = (shift) => {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#d9c3a0';
      ctx.fillRect(0, 0, 240, 240);
      ctx.fillStyle = '#8a5a2b';
      ctx.beginPath();
      ctx.ellipse(120 + shift, 150, 70, 45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(120 + shift, 80, 38, 34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f5f1ea';
      ctx.beginPath();
      ctx.ellipse(120 + shift, 95, 18, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      return canvas.toDataURL('image/png');
    };
    const database = await new Promise((resolve, reject) => {
      const opening = indexedDB.open('safeos-guardian');
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    const saving = database.transaction('subject_profile', 'readwrite');
    saving.objectStore('subject_profile').put({
      id: 'picture-miso', name: 'Miso', type: 'pet', description: '',
      fingerprint: { id: 'picture-miso-fingerprint', name: 'Miso', colorHistogram: [], dominantColors: [],
        averageColor: { r: 138, g: 90, b: 43 }, colorVariance: 0, estimatedSizeRatio: 0.3, edgeSignature: [],
        referenceImages: [], createdAt: '2026-11-02T10:00:00.000Z' },
      referenceImages: [photo(0), photo(-20), photo(20)],
      createdAt: '2026-11-02T10:00:00.000Z', lastActiveAt: null, matchCount: 0,
    });
    await new Promise((resolve, reject) => {
      saving.oncomplete = resolve;
      saving.onerror = () => reject(saving.error);
    });
    database.close();
  });
}

// The watch's first screen with Lost and Found chosen, with no pet saved
// (monitor-lost-found-none-<width>-<look>.png) and with Miso
// (monitor-lost-found-pet-<width>-<look>.png), on a device whose setup chose
// Lost & Found. The base build has no Watch for, so its pictures show its
// watch for the same device; the pull request's own build is checked first:
// Lost and Found checked, and "No pet saved" or Miso's count of photos shown.
async function captureLostAndFoundWatch(browser, baseUrl, outDir) {
  let failed = 0;
  for (const pets of ['none', 'pet']) {
    for (const size of WIDTHS) {
      for (const look of LOOKS) {
        const context = await browser.newContext({
          viewport: { width: size.width, height: size.height },
          isMobile: size.isMobile, hasTouch: size.isMobile, colorScheme: look,
        });
        await context.addInitScript(() => {
          if (localStorage.getItem('safeos-onboarding') !== null) return;
          localStorage.setItem('safeos-onboarding', JSON.stringify({ state: {
            isComplete: true, selectedScenario: 'pet', lostFoundChosen: true,
            acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
          }, version: 0 }));
          localStorage.setItem('guardian-onboarding-complete', 'true');
          localStorage.setItem('safeos-notification-prompt-dismissed', String(Date.now()));
          localStorage.setItem('safeos-pwa-prompt-dismissed', String(Date.now()));
        });
        const page = await context.newPage();
        const file = path.join(outDir, `monitor-lost-found-${pets}-${size.width}-${look}.png`);
        try {
          await page.goto(new URL('/monitor/', baseUrl).toString(), { waitUntil: 'networkidle', timeout: 60_000 });
          if (pets === 'pet') {
            await savePicturePet(page);
            await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
          }
          if (process.env.PICTURE_VERSION === 'after') {
            const lostAndFound = page.getByRole('radiogroup', { name: 'Watch for' }).getByRole('radio', { name: 'Lost and Found' });
            await lostAndFound.waitFor({ state: 'attached', timeout: 20_000 });
            if (!(await lostAndFound.isChecked())) throw new Error('Lost and Found is not checked');
            const shown = pets === 'pet' ? page.getByText('3 photos', { exact: true }) : page.getByText('No pet saved', { exact: true });
            await shown.filter({ visible: true }).waitFor({ timeout: 20_000 });
          }
          await page.screenshot({ path: file });
          console.log(`captured ${file}`);
        } catch (err) {
          failed += 1;
          console.error(`failed monitor Lost and Found ${pets} at ${size.width} ${look}: ${err.message}`);
        } finally {
          await context.close();
        }
      }
    }
  }
  return failed;
}

// -----------------------------------------------------------------------------
// The dashboard after setup, and the ways to watch it links
// -----------------------------------------------------------------------------

// A person who has finished setup, so /dashboard/ opens the dashboard, not Setup.
async function finishedSetupContext(browser, options) {
  const context = await browser.newContext(options);
  await context.addInitScript(OWN_WINDOW);
  await context.addInitScript(() => {
    localStorage.setItem('safeos-onboarding', JSON.stringify({ state: {
      isComplete: true, selectedScenario: 'pet',
      acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
    }, version: 0 }));
    localStorage.setItem('guardian-onboarding-complete', 'true');
  });
  return context;
}

// The dashboard a finished setup opens. It is the redesigned screen, whose
// first heading says the watching state, or the earlier screen with its Quick
// Actions panel, so the base commit's build is pictured with the same script.
async function openDashboard(page, baseUrl) {
  await page.goto(new URL('/dashboard/', baseUrl).toString(), { waitUntil: 'networkidle', timeout: 60_000 });
  const state = page.getByRole('heading', { level: 1, name: /^(Not watching|Watching in another tab)$/ });
  const quickActions = page.locator('.panel')
    .filter({ has: page.getByRole('heading', { name: 'Quick Actions', exact: true }) });
  // When neither shows, the error names why each wait ended.
  await Promise.any([state.waitFor({ timeout: 20_000 }), quickActions.waitFor({ timeout: 20_000 })]).catch((err) => {
    const reasons = (err.errors || [err]).map((reason) => reason.message.split('\n')[0]);
    throw new Error(`the dashboard showed neither its watching state nor Quick Actions: ${reasons.join('; ')}`);
  });
  return { redesigned: (await state.count()) > 0, quickActions };
}

// Both versions: the dashboard after setup at each of the four widths in both
// looks, so the pull request has before and after.
async function captureDashboardAfterSetup(browser, baseUrl, outDir) {
  let failed = 0;
  for (const size of WIDTHS) {
    for (const look of LOOKS) {
      const context = await finishedSetupContext(browser, {
        viewport: { width: size.width, height: size.height },
        isMobile: size.isMobile, hasTouch: size.isMobile, colorScheme: look, deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      try {
        await openDashboard(page, baseUrl);
        const file = path.join(outDir, `dashboard-setup-${size.width}-${look}.png`);
        await page.screenshot({ path: file, fullPage: true });
        console.log(`captured ${file}`);
      } catch (err) {
        failed += 1;
        console.error(`failed dashboard after setup at ${size.width} ${look}: ${err.message}`);
      } finally {
        await context.close();
      }
    }
  }
  return failed;
}

// Pull request build only: the dashboard's four ways to watch are visible at
// each width and each opens its page, whose own heading carries the row's name.
async function checkModeLinks(browser, baseUrl, outDir) {
  const WAYS = [
    { name: 'Motion and sound', path: '/monitor' },
    { name: 'Lost and Found', path: '/lost-found' },
    { name: 'People', path: '/security' },
    { name: 'Wildlife', path: '/wildlife' },
  ];
  const problems = [];
  const bare = (href) => (href || '').replace(/\/$/, '');
  for (const size of WIDTHS) {
    const context = await finishedSetupContext(browser, {
      viewport: { width: size.width, height: size.height },
      isMobile: size.isMobile, hasTouch: size.isMobile, colorScheme: 'light',
    });
    const page = await context.newPage();
    try {
      for (const way of WAYS) {
        try {
          await openDashboard(page, baseUrl);
          const row = page.getByRole('link', { name: new RegExp(`^${way.name}:`) });
          if (!(await row.isVisible())) {
            problems.push(`dashboard at ${size.width} px: the ${way.name} row is not visible`);
            continue;
          }
          await Promise.all([
            page.waitForURL((url) => bare(url.pathname) === way.path, { timeout: 15_000 }),
            row.click(),
          ]);
          await page.getByRole('heading', { level: 1, name: way.name, exact: true }).waitFor({ timeout: 20_000 });
          console.log(`checked the ${way.name} row at ${size.width} px: it opens ${new URL(page.url()).pathname}`);
        } catch (err) {
          problems.push(`dashboard at ${size.width} px, ${way.name} row: ${err.message.split('\n')[0]}`);
        }
      }
    } finally {
      await context.close();
    }
  }
  for (const p of problems) console.error(`failed mode-link check: ${p}`);
  return problems.length;
}

// -----------------------------------------------------------------------------
// Setup when the camera request fails
// -----------------------------------------------------------------------------

// The headless browser has no prompt to answer and the runner has no camera,
// so for the named cases the page's camera request is answered here the way a
// browser answers it: NotAllowedError when the request is refused,
// NotFoundError (and an empty device list) when the device has no camera.
// With no answer given, the request goes to the runner's own browser.
async function cameraContext(browser, options, answer) {
  const context = await browser.newContext(options);
  if (answer) {
    await context.addInitScript((name) => {
      const media = navigator.mediaDevices;
      if (!media) return;
      media.getUserMedia = () => Promise.reject(new DOMException(
        name === 'NotAllowedError' ? 'Permission denied' : 'Requested device not found', name));
      if (name === 'NotFoundError') media.enumerateDevices = () => Promise.resolve([]);
    }, answer);
  }
  return context;
}

// The step in view: setup's own <main>, inside the layout's wrapper.
function setupStep(page) {
  return page.locator('main#main-content');
}

// A first visit, through the welcome, the notice and the Pet Monitoring
// choice, to the camera step.
async function openCameraStep(page, baseUrl) {
  await page.goto(new URL('/setup/', baseUrl).toString(), { waitUntil: 'networkidle', timeout: 60_000 });
  await reachCameraStep(page);
}

async function reachCameraStep(page) {
  const step = setupStep(page);
  await step.getByRole('button', { name: /Begin Setup/ }).click();
  await step.getByRole('checkbox').check();
  await step.getByRole('button', { name: /Accept & Continue/ }).click();
  await step.getByRole('button', { name: /Pet Monitoring/ }).click();
  await step.getByRole('heading', { name: /Device Access/ }).waitFor({ timeout: 10_000 });
}

async function reachSetupComplete(step) {
  await step.getByRole('heading', { name: /Notification Settings/ }).waitFor({ timeout: 10_000 });
  await step.getByRole('button', { name: /Enable & Continue/ }).click();
  await step.getByRole('heading', { name: /Setup Complete/ }).waitFor({ timeout: 10_000 });
}

async function checkHomeUseSetup(browser, baseUrl) {
  let failures = 0;
  for (const [start, finish, way] of [
    ['Set it up for a lost pet', 'Open Lost and Found', 'lost-found'],
    ['Set it up for wildlife', 'Open Wildlife', 'wildlife'],
  ]) {
    const context = await cameraContext(browser, {
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'light',
    }, 'NotFoundError');
    try {
      const page = await context.newPage();
      await page.goto(new URL('/', baseUrl).toString(), { waitUntil: 'networkidle', timeout: 60_000 });
      const key = page.locator('#uses').getByRole('link', { name: start, exact: true });
      if (!(await key.isVisible())) throw new Error(`${start} missing`);
      await Promise.all([
        page.waitForURL((url) => url.pathname === '/setup/' && url.searchParams.get('next') === way, { timeout: 10_000 }),
        key.click(),
      ]);
      await reachCameraStep(page);
      const step = setupStep(page);
      await step.getByRole('button', { name: 'Continue without the camera', exact: true }).click();
      await reachSetupComplete(step);
      await Promise.all([
        page.waitForURL((url) => url.pathname === `/${way}/`, { timeout: 20_000 }),
        step.getByRole('button', { name: finish, exact: true }).click({ timeout: 10_000 }),
      ]);
      console.log(`checked home setup: ${start} led to ${finish} at /${way}/`);
    } catch (err) {
      failures += 1;
      console.error(`failed home setup: ${err.message}`);
    } finally {
      await context.close();
    }
  }
  return failures;
}

// A full-page picture is taken from the top of the page (the fixed header is
// drawn where the screen is), once the progress bar has finished moving.
async function settleForPicture(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
}

// Both versions: the camera step after a refused request, at each of the four
// widths in both looks, so the pull request has before and after.
async function captureCameraStepRefused(browser, baseUrl, outDir) {
  let failed = 0;
  for (const size of WIDTHS) {
    for (const look of LOOKS) {
      const context = await cameraContext(browser, {
        viewport: { width: size.width, height: size.height },
        isMobile: size.isMobile, hasTouch: size.isMobile, colorScheme: look, deviceScaleFactor: 1,
      }, 'NotAllowedError');
      const page = await context.newPage();
      try {
        await openCameraStep(page, baseUrl);
        const step = setupStep(page);
        await step.getByRole('button', { name: 'Grant Permissions', exact: true }).click();
        // The base build has its own words for a refused request.
        await step.getByText(/^(Permission denied\.|The browser blocked the camera for this site\.)/).waitFor({ timeout: 10_000 });
        const file = path.join(outDir, `setup-camera-refused-${size.width}-${look}.png`);
        await settleForPicture(page);
        await page.screenshot({ path: file, fullPage: true });
        console.log(`captured ${file}`);
      } catch (err) {
        failed += 1;
        console.error(`failed setup camera step after a refused request at ${size.width} ${look}: ${err.message}`);
      } finally {
        await context.close();
      }
    }
  }
  return failed;
}

// Pull request build only: setup can be finished with no camera.
async function checkSetupWithoutCamera(browser, baseUrl, outDir) {
  // What the camera step says after a failed request.
  const CAMERA_WORDS = {
    refused: 'The browser blocked the camera for this site. To allow it, open the site settings from the address bar, set Camera to Allow, then press Try again.',
    notStarted: 'The camera did not start. Another app or tab may be using it. Close it, then press Try again.',
    noneFound: 'No camera was found on this device.',
    savedGone: 'The selected camera is unavailable. Choose another camera.',
    noSupport: 'This browser cannot use a camera on this page.',
    other: 'Unable to access the camera or microphone. Check the device and try again.',
  };
  const CAMERA_LATER = 'You can allow the camera later, on the Motion and sound page.';
  const CAMERA_SKIP = 'Continue without the camera';
  const problems = [];
  const PHONE = { width: 390, height: 844, isMobile: true };
  const DESKTOP = { width: 1280, height: 800, isMobile: false };
  const NARROW = { width: 320, height: 640, isMobile: true };
  const shown = (locator) => locator.count().then((n) => n > 0);
  const words = (locator) => locator.innerText().then((text) => text.replace(/\s+/g, ' ').trim().slice(0, 400));

  // Back, the request key and the new key are whole and on screen; the new
  // key is a button, 44 px tall on a phone; the line under it reads at 16 px.
  const layoutProblems = (page, size, primary) => setupStep(page).evaluate((root, given) => {
    const out = [];
    const screenWidth = document.documentElement.clientWidth;
    const named = (name) => [...root.querySelectorAll('button')].find((el) => el.textContent.trim() === name);
    for (const name of ['Back', given.primary, given.skip]) {
      const el = named(name);
      if (!el) { out.push(`no "${name}" button`); continue; }
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0 || getComputedStyle(el).visibility === 'hidden') out.push(`"${name}" is not shown`);
      if (box.left < -0.5 || box.right > screenWidth + 0.5) {
        out.push(`"${name}" runs off the screen (${Math.round(box.left)} to ${Math.round(box.right)} of ${screenWidth})`);
      }
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) out.push(`the words of "${name}" are cut off`);
      if (el.disabled) out.push(`"${name}" is disabled`);
      if (name === given.skip && given.phone && box.height < 43.5) out.push(`"${name}" is ${Math.round(box.height)} px tall`);
    }
    const line = [...root.querySelectorAll('p')].find((el) => el.textContent.trim() === given.later);
    if (!line) out.push(`no line "${given.later}"`);
    else {
      const size = parseFloat(getComputedStyle(line).fontSize);
      if (size < 16) out.push(`"${given.later}" is ${size} px`);
      const box = line.getBoundingClientRect();
      if (box.left < -0.5 || box.right > screenWidth + 0.5) out.push(`"${given.later}" runs off the screen`);
      const key = named(given.skip);
      if (key && box.top < key.getBoundingClientRect().bottom - 0.5) out.push(`"${given.later}" is not under the keys`);
    }
    return out;
  }, { primary, skip: CAMERA_SKIP, later: CAMERA_LATER, phone: size.isMobile });

  // One walk: a first visit to the camera step, the request (unless
  // request is false), "Continue without the camera", the rest of setup, the
  // dashboard, and a reload of the dashboard.
  const walk = async ({ name, picture, size, look, answer = null, request = true, expected, keyboard = false, scenario = false }) => {
    const label = `${name} at ${size.width} px`;
    const fail = (problem) => problems.push(`${label}: ${problem}`);
    const context = await cameraContext(browser, {
      viewport: { width: size.width, height: size.height },
      isMobile: size.isMobile, hasTouch: size.isMobile, colorScheme: look, deviceScaleFactor: 1,
    }, answer);
    const page = await context.newPage();
    try {
      await openCameraStep(page, baseUrl);
      const step = setupStep(page);
      const skip = step.getByRole('button', { name: CAMERA_SKIP, exact: true });

      if (scenario) {
        // Back shows the scenario chosen; "Continue" beside Back confirms it.
        await step.getByRole('button', { name: 'Back', exact: true }).click();
        await step.getByRole('heading', { name: /Select Monitoring Scenario/ }).waitFor({ timeout: 10_000 });
        const go = step.getByRole('button', { name: 'Continue', exact: true });
        if (!(await shown(go))) {
          fail('the scenario step has no "Continue" for the scenario already chosen');
          return;
        }
        const back = await step.getByRole('button', { name: 'Back', exact: true }).boundingBox();
        const beside = await go.boundingBox();
        if (Math.abs(back.y - beside.y) > 1 || beside.x < back.x + back.width) {
          fail(`the scenario step's "Continue" is not beside Back (Back at ${Math.round(back.x)}, ${Math.round(back.y)}; Continue at ${Math.round(beside.x)}, ${Math.round(beside.y)})`);
        }
        await settleForPicture(page);
        await page.screenshot({ path: path.join(outDir, `setup-scenario-continue-${size.width}-${look}.png`), fullPage: true });
        await go.click();
        await step.getByRole('heading', { name: /Device Access/ }).waitFor({ timeout: 10_000 });
        const saved = await page.evaluate(() => (JSON.parse(localStorage.getItem('safeos-onboarding') || '{}').state || {}).selectedScenario);
        if (saved !== 'pet') fail(`after the scenario step's "Continue" the saved scenario is ${saved}, not pet`);
      }

      let primary = 'Grant Permissions';
      if (request) {
        await step.getByRole('button', { name: 'Grant Permissions', exact: true }).click();
        const again = step.getByRole('button', { name: 'Try again', exact: true });
        await again.waitFor({ timeout: 10_000 }).catch(() => {});
        const said = [];
        for (const sentence of Object.values(CAMERA_WORDS)) {
          if (await shown(step.getByText(sentence, { exact: true }))) said.push(sentence);
        }
        primary = 'Try again';
        if (!(await shown(again))) fail(`after the failed request the request key does not read "Try again"; the step reads: ${await words(step)}`);
        if (said.length !== 1 || said[0] !== expected) fail(`the step does not say only "${expected}"; it reads: ${await words(step)}`);
        else console.log(`${label}: the step says "${said[0]}"`);
      }

      if (!(await shown(skip))) {
        fail(`the camera step has no "${CAMERA_SKIP}" button, so setup cannot go on; the step reads: ${await words(step)}`);
        return;
      }
      for (const p of await layoutProblems(page, size, primary)) fail(p);
      const line = step.getByText(CAMERA_LATER, { exact: true });
      if (await shown(line)) {
        const ratio = await contrastOf(line);
        if (ratio < 4.5) fail(`the contrast of "${CAMERA_LATER}" is ${ratio.toFixed(2)}, below 4.5, in the ${look} look`);
      }
      await settleForPicture(page);
      await page.screenshot({ path: path.join(outDir, `setup-camera-${picture}-check-${size.width}-${look}.png`), fullPage: true });

      if (keyboard) {
        // From Back, Tab reaches the new key; Enter presses it.
        await step.getByRole('button', { name: 'Back', exact: true }).focus();
        let reached = false;
        for (let presses = 0; presses < 4 && !reached; presses += 1) {
          await page.keyboard.press('Tab');
          reached = await skip.evaluate((el) => el === document.activeElement && el.tagName === 'BUTTON');
        }
        if (!reached) {
          fail(`Tab from Back does not reach "${CAMERA_SKIP}" as a button`);
          return;
        }
        await page.keyboard.press('Enter');
      } else {
        await skip.click();
      }

      await reachSetupComplete(step);
      await Promise.all([
        page.waitForURL((url) => /^\/dashboard\/?$/.test(url.pathname), { timeout: 20_000 }),
        step.getByRole('button', { name: 'Open dashboard', exact: true }).click(),
      ]);
      const state = page.getByRole('heading', { level: 1, name: /^(Not watching|Watching in another tab)$/ });
      if (!(await state.waitFor({ timeout: 20_000 }).then(() => true, () => false))) {
        fail(`after setup the dashboard is not shown; the address is ${new URL(page.url()).pathname}`);
        return;
      }

      // A reload of the dashboard stays on the dashboard.
      await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
      await state.waitFor({ timeout: 20_000 }).catch(() => {});
      const address = new URL(page.url()).pathname;
      if (!/^\/dashboard\/?$/.test(address) || !(await shown(state))) {
        fail(`after a reload the dashboard is not shown; the address is ${address}`);
      }
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('safeos-onboarding') || '{}').state || {});
      if (saved.isComplete !== true) fail(`setup is saved as isComplete ${saved.isComplete}`);
      if (saved.cameraPermissionGranted !== false || saved.microphonePermissionGranted !== false) {
        fail(`the permissions are saved as camera ${saved.cameraPermissionGranted}, microphone ${saved.microphonePermissionGranted}, not false and false`);
      }
      console.log(`checked setup with no camera: ${label}, ended at ${address} and stayed after a reload`);
    } catch (err) {
      fail(`${err.message.split('\n')[0]} (at ${new URL(page.url()).pathname})`);
    } finally {
      await context.close();
    }
  };

  // A refused request, at both widths and in both looks.
  await walk({ name: 'camera refused', picture: 'refused', size: PHONE, look: 'dark', answer: 'NotAllowedError', expected: CAMERA_WORDS.refused });
  await walk({ name: 'camera refused', picture: 'refused', size: DESKTOP, look: 'light', answer: 'NotAllowedError', expected: CAMERA_WORDS.refused });
  // No camera on the device, with "Default camera" chosen.
  await walk({ name: 'no camera found', picture: 'none-found', size: PHONE, look: 'light', answer: 'NotFoundError', expected: CAMERA_WORDS.noneFound });
  // The runner's own headless browser, with nothing answering for it. The
  // runner has no camera, so its browser finds none.
  await walk({ name: "the runner's own browser", picture: 'own-browser', size: DESKTOP, look: 'dark', expected: CAMERA_WORDS.noneFound });
  // No request at all, at the narrowest width, by keyboard, with the scenario
  // step's "Continue" on the way.
  await walk({ name: 'no request, by keyboard', picture: 'first', size: NARROW, look: 'dark', request: false, keyboard: true, scenario: true });
  // After a refused request at the narrowest width, by keyboard.
  await walk({ name: 'camera refused, by keyboard', picture: 'refused', size: NARROW, look: 'light', answer: 'NotAllowedError', expected: CAMERA_WORDS.refused, keyboard: true });

  for (const p of problems) console.error(`failed setup-without-camera check: ${p}`);
  return problems.length;
}
