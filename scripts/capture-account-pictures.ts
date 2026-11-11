// Run only in CI. Capture the account forms served by the real Express app.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { SafeOSServer } from '../src/api/server.js';

const output = process.argv[2];
if (!output) throw new Error('An output directory is required');
await mkdir(output, { recursive: true });
const instance = new SafeOSServer();
const server = instance.getApp().listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('No HTTP address');
const browser = await chromium.launch();
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    for (const action of ['verify', 'reset-password']) {
      // GET validates the token format but never consumes a token or needs an account.
      const response = await page.goto(
        `http://127.0.0.1:${address.port}/api/auth/email/${action}?token=${'a'.repeat(64)}`
      );
      if (response?.status() !== 200) throw new Error(`Could not load ${action}`);
      await page.locator('form button').waitFor();
      await page.screenshot({ path: join(output, `${action}-${width}.png`), fullPage: true });
    }
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  await instance.stop();
}
