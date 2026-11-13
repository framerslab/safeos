// Captures screenshots of the built static site for review.
//
//   node scripts/capture-pictures.mjs <base-url> <out-dir> <route> [<route> ...]
//
// Each route is captured at 390 and 1280 pixels wide, in the light and the
// dark look (the browser's prefers-color-scheme, which the app follows when no
// theme is saved), as a full-page PNG named <route>-<width>-<look>.png.
// The pictures workflow (.github/workflows/pictures.yml) runs it in CI.
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
  // A profile save the server does not take, and one this browser cannot write. The base build shows
  // its own words for the same saves; in the head build CI checks the words.
  const saves = [
    ...(routes.includes('/settings/notifications/') ? [
      { name: 'notifications-server-refused', route: '/settings/notifications/', button: 'Save changes', localFails: false,
        words: 'Saved on this device. The server did not take the change. Save again when you are connected.' },
      { name: 'notifications-not-saved', route: '/settings/notifications/', button: 'Save changes', localFails: true,
        words: 'Notification settings were not saved. Try again.' },
    ] : []),
    ...(routes.includes('/settings/') ? [
      { name: 'settings-failed', route: '/settings/', button: 'Save Changes', localFails: false,
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
          localStorage.setItem('safeos_backend_config', JSON.stringify({ apiUrl: 'https://pictures.example.test' }));
          // A returning person: the dashboard opens, and its account button makes the session.
          localStorage.setItem('safeos-onboarding', JSON.stringify({ state: {
            isComplete: true, selectedScenario: 'pet',
            acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
          }, version: 0 }));
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
          // The server refuses the profile change unless the scenario is a failed local write.
          if (method === 'PATCH') return request.fulfill({ status: save.localFails ? 200 : 500, headers: cors,
            contentType: 'application/json', body: JSON.stringify({ success: save.localFails }) });
          return request.fulfill({ headers: cors, contentType: 'application/json', body: JSON.stringify({ status: 'ok', data: {
            sessionId: 'picture-session', token: 'picture-token', isGuest: false, expiresAt: '2099-01-01T00:00:00Z',
            profile: { id: 'picture-person', displayName: 'Picture person', preferences: {}, notificationSettings: {} },
          } }) });
        });
        const page = await context.newPage();
        const file = path.join(outDir, `${save.name}-${size.width}-${look}.png`);
        try {
          // The settings pages do not start a session themselves: sign in on the dashboard, then
          // move to the page inside the app, so the profile stays in memory as when a person clicks there.
          await page.goto(new URL('/dashboard/', baseUrl).toString(), { waitUntil: 'networkidle', timeout: 60_000 });
          await page.getByRole('button', { name: 'Account menu for Picture person' }).waitFor({ state: 'attached', timeout: 20_000 });
          await page.locator('a[href="/settings/"]:visible, a[href="/settings"]:visible').first().click();
          await page.getByRole('button', { name: 'Save Changes', exact: true }).waitFor({ timeout: 20_000 });
          if (save.route === '/settings/notifications/') {
            await page.locator('a[href^="/settings/notifications"]:visible').first().click();
          }
          await page.getByRole('button', { name: save.button, exact: true }).click({ timeout: 20_000 });
          const message = process.env.PICTURE_VERSION === 'after'
            ? page.getByText(save.words, { exact: true })
            : page.getByText(/^(Notification settings|Saved |Settings saved|Failed to save)/);
          await message.first().waitFor({ timeout: 10_000 });
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: file, style: 'nav { visibility: hidden !important; }' });
          console.log(`captured ${file}`);
        } catch (err) {
          failures += 1;
          console.error(`failed ${save.name} at ${size.width} ${look}: ${err.message}`);
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
