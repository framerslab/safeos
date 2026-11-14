// Captures screenshots of the built static site for review.
//
//   node scripts/capture-pictures.mjs <base-url> <out-dir> <route> [<route> ...]
//
// Each route is captured at 390 and 1280 pixels wide, in the light and the
// dark look (the browser's prefers-color-scheme, which the app follows when no
// theme is saved), as a full-page PNG named <route>-<width>-<look>.png.
// The pictures workflow (.github/workflows/pictures.yml) runs it in CI.
//
// When the home page is captured for the pull request's own build
// (PICTURE_VERSION=after), it also checks a first visit in a real browser:
// the header stays one row with every control inside the screen from 320 to
// 1280 pixels, its text is 13 pixels or more and its phone targets 44 pixels;
// the theme button changes the page; no notification prompt appears; and the
// three headings that measured under 2 to 1 reach 4.5 to 1; at 320 by 480
// the open menu's last control is on screen or reachable by scrolling the
// menu, Escape closes the menu and focus returns to the Menu button; the
// Security card opens the Security page; and the alert key on the Test Alerts
// page starts the alert's two generated tones on a running audio context,
// an analyser on the way to the speakers reads samples that are not all zero,
// and the page makes no request under /sounds/. Any failure fails the run.
//
// When /dashboard/ is captured, both versions also capture the dashboard as a
// person who has finished setup sees it (dashboard-setup-<width>-<look>.png)
// and its header menu open at 390 pixels (dashboard-menu-390-<look>.png). The
// pull request's own build then checks that the dashboard's Lost & Found,
// Security and Wildlife cards are visible at 390 and 1280 pixels and each
// opens its page, whose own heading shows; and that from 320 to 768 pixels
// the header row stays one row with none of those three in it, while the open
// menu lists all three under its four page links.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [baseUrl, outDir, ...routes] = process.argv.slice(2);
if (!baseUrl || !outDir || routes.length === 0) {
  console.error('usage: capture-pictures.mjs <base-url> <out-dir> <route> [<route> ...]');
  process.exit(2);
}

const WIDTHS = [
  { width: 390, height: 844, isMobile: true },
  { width: 1280, height: 800, isMobile: false },
];
const LOOKS = ['light', 'dark'];

function slug(route) {
  const s = route.replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9]+/g, '-');
  return s || 'home';
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
let failures = 0;
try {
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
  }
  if (routes.includes('/dashboard/')) {
    failures += await captureDashboardAfterSetup(browser, baseUrl, outDir);
    if (process.env.PICTURE_VERSION === 'after') failures += await checkModeLinks(browser, baseUrl, outDir);
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
    ...(routes.includes('/settings/') ? [
      { name: 'settings-failed', route: '/settings/', button: 'Save Changes', browserOnly: false, localFails: false,
        words: 'Failed to save settings.' },
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
          await page.getByRole('button', { name: 'Save Changes', exact: true }).waitFor({ timeout: 20_000 });
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
          await page.screenshot({ path: file, fullPage: true, style: 'nav.fixed { display: none !important; }' });
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

async function checkFirstVisit(browser, baseUrl, outDir) {
  const HEADER_WIDTHS = [320, 360, 390, 430, 480, 768, 820, 1024, 1280];
  const problems = [];
  const home = new URL('/', baseUrl).toString();

  // The header: one row, every control on screen, no text under 13 px,
  // 44 px targets on phones and tablets.
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
      const header = page.locator('nav[aria-label="Main"]');
      await header.screenshot({ path: path.join(outDir, `header-${width}-light.png`) });
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
        if (controls.length < 3) out.push(`only ${controls.length} controls in the row`);
        for (const el of controls) {
          const box = el.getBoundingClientRect();
          const name = el.getAttribute('aria-label') || el.textContent.trim() || el.tagName;
          if (box.left < -0.5 || box.right > screenWidth + 0.5) {
            out.push(`${name} runs off the screen (${Math.round(box.left)} to ${Math.round(box.right)} of ${screenWidth})`);
          }
          if (box.top < rowBox.top - 0.5 || box.bottom > rowBox.bottom + 0.5) out.push(`${name} is outside the row`);
          if (phone && (box.width < 44 || box.height < 44)) {
            out.push(`${name} is ${Math.round(box.width)} by ${Math.round(box.height)} px`);
          }
        }
        const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const words = walker.currentNode.textContent.trim();
          const parent = walker.currentNode.parentElement;
          if (!words || parent.getBoundingClientRect().width === 0) continue;
          const size = parseFloat(getComputedStyle(parent).fontSize);
          if (size < 13) out.push(`"${words}" is ${size} px`);
        }
        return out;
      }, width < 1280);
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

      // The headings that measured under 2 to 1 in the light look.
      const guardian = page.locator('h1 span').nth(1);
      const tag = page.getByText('COCO-SSD · TensorFlow.js', { exact: true });
      for (const [name, locator] of [['hero "Guardian"', guardian], ['tag "COCO-SSD · TensorFlow.js"', tag]]) {
        const ratio = await contrastOf(locator);
        if (ratio < 4.5) problems.push(`${look}: ${name} contrast ${ratio.toFixed(2)} is below 4.5`);
      }

      // No notification prompt on a first visit, however long it stays.
      await page.waitForTimeout(6_000);
      if (await page.getByText('Enable notifications').count()) {
        problems.push(`${look}: the home page shows a notification prompt before setup`);
      }

      // The theme button changes the page, not only its icon.
      const other = look === 'light' ? 'dark' : 'light';
      const before = await page.evaluate(() => document.documentElement.className);
      if (!before.split(/\s+/).includes(look)) problems.push(`${look}: the page starts as "${before}"`);
      await page.getByRole('button', { name: `Switch to ${other} mode` }).click();
      await page.waitForFunction((want) => document.documentElement.classList.contains(want), other, { timeout: 5_000 })
        .catch(() => problems.push(`${look}: the theme button left the page as "${before}"`));
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

  // The header menu on a short phone screen: its last control is on screen or
  // reachable by scrolling the menu itself (a fixed header cannot be reached
  // by scrolling the page); Escape closes it; focus goes back to the Menu
  // button whenever it closes.
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
      const toggle = page.locator('nav[aria-label="Main"] button.nav-mobile-toggle');
      const menu = page.locator('.nav-mobile-menu');
      await toggle.click();
      await menu.waitFor({ timeout: 5_000 });
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
      if (await menu.count()) problems.push('menu at 320 by 480: Escape leaves the menu open');
      else if (!(await toggle.evaluate((element) => element === document.activeElement))) {
        problems.push('menu at 320 by 480: after Escape, focus is not on the Menu button');
      }
      if (!(await menu.count())) {
        await toggle.click();
        await menu.waitFor({ timeout: 5_000 });
        await menu.getByRole('button', { name: /Light Mode|Dark Mode/ }).click();
        if (await menu.count()) problems.push('menu at 320 by 480: the theme action leaves the menu open');
        else if (!(await toggle.evaluate((element) => element === document.activeElement))) {
          problems.push('menu at 320 by 480: after the theme action closes the menu, focus is not on the Menu button');
        }
      }
      console.log('checked the header menu at 320 by 480');
    } catch (err) {
      problems.push(`menu at 320 by 480: ${err.message}`);
    } finally {
      await context.close();
    }
  }

  // The home page's Security card opens the page where person detection runs.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
    const page = await context.newPage();
    try {
      await page.goto(home, { waitUntil: 'networkidle', timeout: 60_000 });
      const card = page.locator('div.rounded-xl')
        .filter({ has: page.getByRole('heading', { name: 'Security', exact: true }) })
        .filter({ has: page.getByRole('link', { name: /Quick Start/ }) })
        .last();
      await Promise.all([
        page.waitForURL((url) => url.pathname !== '/', { timeout: 15_000 }),
        card.getByRole('link', { name: /Quick Start/ }).click(),
      ]);
      const address = new URL(page.url());
      if (!/^\/security\/?$/.test(address.pathname)) {
        problems.push(`the Security card opens ${address.pathname}${address.search}, not the Security page`);
      }
      console.log(`checked the Security card: it opens ${address.pathname}`);
    } catch (err) {
      problems.push(`Security card: ${err.message}`);
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
// The dashboard after setup, and the modes it and the header menu link
// -----------------------------------------------------------------------------

// A person who has finished setup, so /dashboard/ opens the dashboard, not Setup.
async function finishedSetupContext(browser, options) {
  const context = await browser.newContext(options);
  await context.addInitScript(() => {
    localStorage.setItem('safeos-onboarding', JSON.stringify({ state: {
      isComplete: true, selectedScenario: 'pet',
      acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
    }, version: 0 }));
    localStorage.setItem('guardian-onboarding-complete', 'true');
  });
  return context;
}

async function openDashboard(page, baseUrl) {
  await page.goto(new URL('/dashboard/', baseUrl).toString(), { waitUntil: 'networkidle', timeout: 60_000 });
  const quickActions = page.locator('.panel')
    .filter({ has: page.getByRole('heading', { name: 'Quick Actions', exact: true }) });
  await quickActions.waitFor({ timeout: 20_000 });
  return quickActions;
}

// Both versions: the dashboard at 390 and 1280 pixels in both looks, and its
// header menu open at 390 pixels, so the pull request has before and after.
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
        if (size.isMobile) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.locator('nav[aria-label="Main"] button.nav-mobile-toggle').click();
          await page.locator('.nav-mobile-menu').waitFor({ timeout: 5_000 });
          const menuFile = path.join(outDir, `dashboard-menu-${size.width}-${look}.png`);
          await page.screenshot({ path: menuFile });
          console.log(`captured ${menuFile}`);
        }
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

// Pull request build only: Lost & Found, Security and Wildlife are reachable
// from the dashboard and from the header menu, and the header row stays one row.
async function checkModeLinks(browser, baseUrl, outDir) {
  const MODES = [
    { name: 'Lost & Found', path: '/lost-found', heading: 'Lost & Found' },
    { name: 'Security', path: '/security', heading: 'Security Mode' },
    { name: 'Wildlife', path: '/wildlife', heading: 'Wildlife Detection' },
  ];
  const MENU_WIDTHS = [320, 360, 390, 430, 480, 768];
  const PAGE_LINKS = ['/dashboard', '/monitor', '/history', '/settings', ...MODES.map((mode) => mode.path)];
  const problems = [];
  const bare = (href) => (href || '').replace(/\/$/, '');

  // Each card is visible in Quick Actions and opens its page, whose own heading shows.
  for (const size of WIDTHS) {
    const context = await finishedSetupContext(browser, {
      viewport: { width: size.width, height: size.height },
      isMobile: size.isMobile, hasTouch: size.isMobile, colorScheme: 'light',
    });
    const page = await context.newPage();
    try {
      for (const mode of MODES) {
        try {
          const quickActions = await openDashboard(page, baseUrl);
          const card = quickActions.getByRole('link', { name: new RegExp(`^${mode.name}`) });
          if (!(await card.count())) {
            problems.push(`dashboard at ${size.width} px: no ${mode.name} card in Quick Actions`);
            continue;
          }
          if (!(await card.isVisible())) {
            problems.push(`dashboard at ${size.width} px: the ${mode.name} card is not visible`);
            continue;
          }
          await Promise.all([
            page.waitForURL((url) => bare(url.pathname) === mode.path, { timeout: 15_000 }),
            card.click(),
          ]);
          await page.getByRole('heading', { level: 1, name: mode.heading, exact: true }).waitFor({ timeout: 20_000 });
          console.log(`checked the ${mode.name} card at ${size.width} px: it opens ${new URL(page.url()).pathname}, heading "${mode.heading}"`);
        } catch (err) {
          problems.push(`dashboard at ${size.width} px, ${mode.name} card: ${err.message}`);
        }
      }
    } finally {
      await context.close();
    }
  }

  // The header row is one row with none of the three in it; the open menu
  // lists them under its four page links.
  for (const width of MENU_WIDTHS) {
    const context = await finishedSetupContext(browser, {
      viewport: { width, height: 800 },
      isMobile: width < 768, hasTouch: width < 768, colorScheme: 'light',
    });
    const page = await context.newPage();
    try {
      await openDashboard(page, baseUrl);
      const header = page.locator('nav[aria-label="Main"]');
      const rowProblems = () => header.evaluate((nav, paths) => {
        const out = [];
        const row = nav.firstElementChild;
        const rowBox = row.getBoundingClientRect();
        if (rowBox.height > 64.5) out.push(`row is ${Math.round(rowBox.height)} px tall`);
        for (const el of row.querySelectorAll('a, button')) {
          const box = el.getBoundingClientRect();
          if (box.width === 0 || box.height === 0 || getComputedStyle(el).visibility === 'hidden') continue;
          const name = el.getAttribute('aria-label') || el.textContent.trim() || el.tagName;
          if (box.top < rowBox.top - 0.5 || box.bottom > rowBox.bottom + 0.5) out.push(`${name} is outside the row`);
          if (paths.includes((el.getAttribute('href') || '').replace(/\/$/, ''))) out.push(`${name} is in the row`);
        }
        return out;
      }, MODES.map((mode) => mode.path));
      for (const p of await rowProblems()) problems.push(`header at ${width} px: ${p}`);
      await header.locator('button.nav-mobile-toggle').click();
      const menu = page.locator('.nav-mobile-menu');
      await menu.waitFor({ timeout: 5_000 });
      for (const p of await rowProblems()) problems.push(`header at ${width} px with the menu open: ${p}`);
      for (const mode of MODES) {
        const link = menu.getByRole('link', { name: mode.name, exact: true });
        if (!(await link.count())) {
          problems.push(`menu at ${width} px: no ${mode.name} link`);
        } else if (bare(await link.getAttribute('href')) !== mode.path) {
          problems.push(`menu at ${width} px: ${mode.name} links ${await link.getAttribute('href')}`);
        }
      }
      const pages = (await menu.getByRole('link').evaluateAll((links) => links.map((a) => a.getAttribute('href') || '')))
        .map(bare).filter((href) => href.startsWith('/')).slice(0, PAGE_LINKS.length);
      if (pages.join(' ') !== PAGE_LINKS.join(' ')) {
        problems.push(`menu at ${width} px: its first page links are ${pages.join(' ')}, not ${PAGE_LINKS.join(' ')}`);
      }
      await page.screenshot({ path: path.join(outDir, `dashboard-menu-check-${width}-light.png`) });
      console.log(`checked the header row and menu on the dashboard at ${width} px`);
    } catch (err) {
      problems.push(`header and menu at ${width} px: ${err.message}`);
    } finally {
      await context.close();
    }
  }

  for (const p of problems) console.error(`failed mode-link check: ${p}`);
  return problems.length;
}
