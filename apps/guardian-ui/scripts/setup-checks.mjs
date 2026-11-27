// Walks setup's two steps on the built static site in a real browser, in a
// job of their own (the Pictures workflow's "Walk setup"), so the capture of
// the other pages keeps inside its time.
//
//   node scripts/setup-checks.mjs <base-url> <out-dir>
//
// It runs the walks of scripts/app-checks.mjs whose names start with
// "setup", saves their pictures in <out-dir>, prints every finding and fails
// when there is one.
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const [baseUrl, outDir] = process.argv.slice(2);
if (!baseUrl || !outDir) {
  console.error('usage: setup-checks.mjs <base-url> <out-dir>');
  process.exit(2);
}

process.env.APP_CHECKS_PART = 'setup';
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
let failures = 0;
try {
  const { checkApp } = await import('./app-checks.mjs');
  failures = await checkApp(browser, baseUrl, outDir);
} catch (err) {
  failures += 1;
  console.error(`failed app check: setup's walks did not run: ${err.message}`);
} finally {
  await browser.close();
}
console.log(failures > 0 ? `${failures} setup findings` : 'setup walked with no finding');
process.exit(failures > 0 ? 1 : 0);
