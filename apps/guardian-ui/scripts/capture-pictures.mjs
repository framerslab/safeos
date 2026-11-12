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
            contentType: 'application/json', body: JSON.stringify({ status: 'ok' }),
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
} finally {
  await browser.close();
}
process.exit(failures > 0 ? 1 : 0);
