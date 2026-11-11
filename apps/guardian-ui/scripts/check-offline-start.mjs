// Run against the real static export in CI. Visit only home before going offline.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

const root = path.resolve('out');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  let pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    let registration;
    let timer;
    // Collect diagnostics without letting that lookup extend the deadline.
    navigator.serviceWorker.getRegistration().then(value => { registration = value; }, () => {});
    try {
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            const worker = registration?.installing || registration?.waiting || registration?.active;
            const state = registration ? worker?.state || 'no worker' : 'no registration';
            reject(new Error(`Service worker did not become ready within 30 seconds (${state}).`));
          }, 30_000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  });
  await context.setOffline(true);
  const offlinePage = await context.newPage();
  await offlinePage.goto(base + '/wildlife/');
  await offlinePage.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(offlinePage.getByRole('heading', { name: 'Wildlife Settings', exact: true })).toBeVisible();
  console.log('Previously unopened Wildlife page starts and responds offline.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
