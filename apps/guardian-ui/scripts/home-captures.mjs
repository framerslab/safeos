// Makes the home page's pictures from the built site: the capture of the
// monitor in the first screen, the two install screenshots the web app
// manifest names and the shared-link card.
//
//   node scripts/home-captures.mjs <base-url> <out-dir> <clip.y4m> <clip.wav>
//
// The Pictures workflow's "Capture the home page pictures" job runs it. No
// picture is drawn by hand or made by an image model: Chromium is started with
// its fake camera and microphone fed from the committed sample clip
// (public/home/sample-clip.mp4, converted to .y4m and .wav inside the job), so
// the unchanged monitor reads the clip through its real camera path.
//
// For each look it seeds a finished setup and the Custom preset (the default
// preset, Maximum Alert, with pixel detection turned off, so the motion and
// sound lines are the default 20 and the pixel-alert path stays off), opens
// /monitor/, presses the monitor's own "Start Monitoring" key and waits until
// the alert list holds a motion alert. It then saves:
//
//   home/capture-phone-<look>.png      the 390 px monitor's camera view, 16:9
//   home/capture-portrait-<look>.png   the camera view with its readings, 4:5
//   home/capture-landscape-<look>.png  the 1280 px monitor's camera view
//                                      beside its alert list, 16:10
//
// each at twice the size the home page shows it or more, with a .webp beside it, then screenshots/dashboard.png and
// screenshots/monitoring.png (1280 by 720), home/card.jpg (1200 by 630, JPEG
// quality 85, from scripts/home-card.html, a page the site does not serve)
// and home/provenance.json: the run, the commit, the clip's sha256 and each
// file's viewport, width, height and bytes. The files are committed under
// public/ from the run's artifact; tests/home-capture-files.test.ts fails a
// file that is missing or differs from that record.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const [baseUrl, outDir, videoFile, audioFile] = process.argv.slice(2);
if (!baseUrl || !outDir || !videoFile || !audioFile) {
  console.error('usage: home-captures.mjs <base-url> <out-dir> <clip.y4m> <clip.wav>');
  process.exit(2);
}

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIP = path.join(APP_ROOT, 'public', 'home', 'sample-clip.mp4');
const LOOKS = ['light', 'dark'];

// The capture's preset (scripts/home-capture-settings.json). It is what
// updateGlobalSettings({ pixelDetectionEnabled: false }) gives from the default
// preset (src/stores/settings-store.ts); tests/home-capture-files.test.ts
// holds it to the store.
const CAPTURE_SETTINGS = JSON.parse(await readFile(path.join(APP_ROOT, 'scripts', 'home-capture-settings.json'), 'utf8'));

const MOTION_ALERT = /Motion detected: \d+% \(threshold: 20%/;
const SOUND_ALERT = /Audio detected: \d+% \(threshold: 20%/;

const files = [];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function pngSize(bytes) {
  if (bytes.toString('ascii', 1, 4) !== 'PNG') throw new Error('not a PNG file');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function record(relative, details) {
  const bytes = await readFile(path.join(outDir, relative));
  files.push({ path: relative, ...details, bytes: bytes.length, sha256: sha256(bytes) });
  console.log(`saved ${relative}: ${details.width} by ${details.height}, ${bytes.length} bytes`);
}

// A person who has finished setup, with the capture's preset saved, and the
// two cards that appear unasked already put away.
async function seededContext(browser, options) {
  const context = await browser.newContext({ ...options, permissions: ['camera', 'microphone'] });
  await context.addInitScript((settings) => {
    localStorage.setItem('safeos-onboarding', JSON.stringify({ state: {
      isComplete: true, selectedScenario: 'pet',
      acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
    }, version: 0 }));
    localStorage.setItem('guardian-onboarding-complete', 'true');
    localStorage.setItem('safeos-settings', JSON.stringify({ state: settings, version: 0 }));
    localStorage.setItem('safeos-notification-prompt-dismissed', String(Date.now()));
    localStorage.setItem('safeos-pwa-prompt-dismissed', String(Date.now()));
  }, CAPTURE_SETTINGS);
  return context;
}

// Opens the monitor, presses its own start key and waits for the alert list
// to hold a motion alert. Returns once the Motion indicator is over its line.
async function watchUntilMotionAlert(page, name) {
  await page.goto(new URL('/monitor/', baseUrl).toString(), { waitUntil: 'networkidle', timeout: 60_000 });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('safeos-settings') || '{}').state || {});
  if (saved.activePresetId !== 'custom' || saved.globalSettings?.pixelDetectionEnabled !== false) {
    throw new Error(`${name}: the monitor is not on the Custom preset with pixel detection off`);
  }
  console.log(`${name}: seeded the Custom preset with pixel detection off (motion and sound lines ${100 - saved.globalSettings.motionSensitivity} and ${100 - saved.globalSettings.audioSensitivity})`);
  await page.getByRole('button', { name: 'Start Monitoring', exact: true }).click();
  console.log(`${name}: pressed "Start Monitoring"`);
  await page.getByText('LIVE', { exact: true }).waitFor({ timeout: 30_000 }).catch(async (err) => {
    const shown = await page.locator('text=Camera Error').first().locator('xpath=..').textContent().catch(() => null);
    throw new Error(shown ? `the camera did not start: ${shown.replace(/\s+/g, ' ').trim()}` : err.message);
  });
  const started = Date.now();
  await page.getByText(MOTION_ALERT).first().waitFor({ timeout: 120_000 });
  const motionAt = ((Date.now() - started) / 1000).toFixed(1);
  const sound = await page.getByText(SOUND_ALERT).count();
  console.log(`${name}: the alert list holds a motion alert ${motionAt} s after the camera went live, and ${sound} sound alert${sound === 1 ? '' : 's'}`);
  console.log(`${name}: motion alert reads "${(await page.getByText(MOTION_ALERT).first().textContent()).trim()}"`);
  // The Motion indicator turns to its alert colour while the reading is at or
  // over the line; the capture is saved while it is.
  const indicator = page.getByRole('status', { name: /^Motion level/ });
  await page.getByRole('status', { name: /motion detected/ }).waitFor({ timeout: 60_000 });
  console.log(`${name}: Motion indicator before saving: "${await indicator.getAttribute('aria-label')}"`);
  return { indicator, sound };
}

async function saveCrop(page, relative, clip, details) {
  const file = path.join(outDir, relative);
  await page.screenshot({ path: file, clip });
  const size = pngSize(await readFile(file));
  await record(relative, { ...details, ...size });
  const webp = relative.replace(/\.png$/, '.webp');
  execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', file, '-c:v', 'libwebp', '-quality', '86', '-compression_level', '6', path.join(outDir, webp)]);
  await record(webp, { ...details, ...size });
}

await mkdir(path.join(outDir, 'home'), { recursive: true });
await mkdir(path.join(outDir, 'screenshots'), { recursive: true });

// The headless browser has no prompt to answer a camera request and refuses
// it ("Not supported") unless the request is granted by the fake prompt.
const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-video-capture=${path.resolve(videoFile)}`,
    `--use-file-for-fake-audio-capture=${path.resolve(audioFile)}`,
  ],
});
let failures = 0;
const portraitForCard = {};
try {
  for (const look of LOOKS) {
    // The 390 px monitor: the camera view itself, and the portrait crop that
    // also holds the readout tiles under it.
    {
      const viewport = { width: 390, height: 1100 };
      const scale = 3;
      const context = await seededContext(browser, {
        viewport, deviceScaleFactor: scale, isMobile: true, hasTouch: true, colorScheme: look,
      });
      const page = await context.newPage();
      const name = `390 px monitor, ${look}`;
      try {
        const { indicator } = await watchUntilMotionAlert(page, name);
        const view = await page.locator('video').first().locator('xpath=..').boundingBox();
        if (!view || view.width < 300 || view.width > 390) throw new Error(`${name}: the camera view is ${view ? Math.round(view.width) : 'not'} px wide`);
        const width = Math.floor(view.width);
        const details = { look, viewport: `${viewport.width}x${viewport.height}`, deviceScaleFactor: scale };
        await saveCrop(page, `home/capture-phone-${look}.png`,
          { x: view.x, y: view.y, width, height: Math.round(width * 9 / 16) }, { ...details, crop: 'camera view, 16:9' });
        console.log(`${name}: Motion indicator after the camera view was saved: "${await indicator.getAttribute('aria-label')}"`);
        await page.getByRole('status', { name: /motion detected/ }).waitFor({ timeout: 60_000 });
        await saveCrop(page, `home/capture-portrait-${look}.png`,
          { x: view.x, y: view.y, width, height: Math.round(width * 5 / 4) }, { ...details, crop: 'camera view with its readings, 4:5' });
        console.log(`${name}: Motion indicator after the portrait crop was saved: "${await indicator.getAttribute('aria-label')}"`);
        portraitForCard[look] = path.join(outDir, `home/capture-portrait-${look}.png`);
      } catch (err) {
        failures += 1;
        console.error(`failed ${name}: ${err.message}`);
        await page.screenshot({ path: path.join(outDir, `failed-monitor-390-${look}.png`), fullPage: true }).catch(() => {});
      } finally {
        await context.close();
      }
    }

    // The 1280 px monitor: the camera view beside its alert list.
    {
      const viewport = { width: 1280, height: 1000 };
      const scale = 1.5;
      const context = await seededContext(browser, { viewport, deviceScaleFactor: scale, colorScheme: look });
      const page = await context.newPage();
      const name = `1280 px monitor, ${look}`;
      try {
        const { indicator, sound } = await watchUntilMotionAlert(page, name);
        if (sound === 0) throw new Error(`${name}: the alert list holds no sound alert`);
        const grid = await page.locator('main > div.grid').first().boundingBox();
        if (!grid || grid.width < 1100 || grid.width > 1280) throw new Error(`${name}: the monitor's grid is ${grid ? Math.round(grid.width) : 'not'} px wide`);
        const width = Math.floor(grid.width);
        await saveCrop(page, `home/capture-landscape-${look}.png`,
          { x: grid.x, y: grid.y, width, height: Math.round(width * 10 / 16) },
          { look, viewport: `${viewport.width}x${viewport.height}`, deviceScaleFactor: scale, crop: 'camera view beside the alert list, 16:10' });
        console.log(`${name}: Motion indicator after saving: "${await indicator.getAttribute('aria-label')}"`);
      } catch (err) {
        failures += 1;
        console.error(`failed ${name}: ${err.message}`);
        await page.screenshot({ path: path.join(outDir, `failed-monitor-1280-${look}.png`), fullPage: true }).catch(() => {});
      } finally {
        await context.close();
      }
    }
  }

  // The two install screenshots the web app manifest names, 1280 by 720.
  {
    const viewport = { width: 1280, height: 720 };
    const context = await seededContext(browser, { viewport, deviceScaleFactor: 1, colorScheme: 'dark' });
    const page = await context.newPage();
    const details = { look: 'dark', viewport: '1280x720', deviceScaleFactor: 1 };
    try {
      await page.goto(new URL('/dashboard/', baseUrl).toString(), { waitUntil: 'networkidle', timeout: 60_000 });
      await page.getByRole('heading', { name: 'Quick Actions', exact: true }).waitFor({ timeout: 20_000 });
      await page.screenshot({ path: path.join(outDir, 'screenshots/dashboard.png') });
      await record('screenshots/dashboard.png', { ...details, crop: 'the dashboard after setup', ...pngSize(await readFile(path.join(outDir, 'screenshots/dashboard.png'))) });

      await watchUntilMotionAlert(page, 'install screenshot of the monitor');
      await page.screenshot({ path: path.join(outDir, 'screenshots/monitoring.png') });
      await record('screenshots/monitoring.png', { ...details, crop: 'the monitor while it watches the clip', ...pngSize(await readFile(path.join(outDir, 'screenshots/monitoring.png'))) });
    } catch (err) {
      failures += 1;
      console.error(`failed install screenshots: ${err.message}`);
    } finally {
      await context.close();
    }
  }

  // The shared-link card: the mark, the wordmark, the headline's words and the
  // real capture, on the dark page colour.
  if (portraitForCard.dark) {
    const context = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: 'dark' });
    const page = await context.newPage();
    try {
      // Open the home page for its headline and its styles, so the card's
      // words and faces are the page's own.
      await page.goto(new URL('/', baseUrl).toString(), { waitUntil: 'networkidle', timeout: 60_000 });
      const site = await page.evaluate(() => ({
        headline: document.querySelector('h1')?.textContent?.trim() || '',
        fonts: document.documentElement.className.split(/\s+/).filter((name) => name.includes('variable')).join(' '),
        styles: [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => link.href),
      }));
      if (!site.headline) throw new Error('the home page has no headline');
      const capture = `data:image/png;base64,${(await readFile(portraitForCard.dark)).toString('base64')}`;
      const template = await readFile(path.join(APP_ROOT, 'scripts', 'home-card.html'), 'utf8');
      const html = template
        .replace('{{FONTS}}', site.fonts)
        .replace('{{STYLES}}', site.styles.map((href) => `<link rel="stylesheet" href="${href}">`).join('\n'))
        .replace('{{HEADLINE}}', site.headline.replace(/&/g, '&amp;').replace(/</g, '&lt;'))
        .replace('{{CAPTURE}}', capture);
      await page.setContent(html, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => {
        const card = document.querySelector('.card');
        return card.scrollHeight > card.clientHeight || card.scrollWidth > card.clientWidth;
      });
      if (overflow) throw new Error('the card\'s words do not fit 1200 by 630');
      const smallest = await page.evaluate(() => Math.min(...[...document.querySelectorAll('[data-words]')]
        .map((element) => parseFloat(getComputedStyle(element).fontSize))));
      if (smallest < 64) throw new Error(`the card's smallest words are ${smallest} px, under 64`);
      const file = path.join(outDir, 'home/card.jpg');
      await page.screenshot({ path: file, type: 'jpeg', quality: 85 });
      const bytes = (await readFile(file)).length;
      if (bytes >= 300_000) throw new Error(`the card is ${bytes} bytes, not under 300 KB`);
      await record('home/card.jpg', { look: 'dark', viewport: '1200x630', deviceScaleFactor: 1, crop: 'the shared-link card', width: 1200, height: 630 });
    } catch (err) {
      failures += 1;
      console.error(`failed card: ${err.message}`);
    } finally {
      await context.close();
    }
  } else {
    failures += 1;
    console.error('failed card: no dark portrait capture to build it from');
  }
} finally {
  await browser.close();
}

const clipBytes = await readFile(CLIP);
const playwrightVersion = JSON.parse(await readFile(path.join(APP_ROOT, 'node_modules', '@playwright', 'test', 'package.json'), 'utf8')).version;
await writeFile(path.join(outDir, 'home/provenance.json'), `${JSON.stringify({
  run: process.env.CAPTURE_RUN || null,
  commit: process.env.CAPTURE_COMMIT || null,
  captured: new Date().toISOString(),
  playwright: playwrightVersion,
  clip: { path: 'home/sample-clip.mp4', sha256: sha256(clipBytes), bytes: clipBytes.length },
  preset: CAPTURE_SETTINGS,
  files,
}, null, 2)}\n`);
console.log(`wrote home/provenance.json with ${files.length} files`);
process.exit(failures > 0 ? 1 : 0);
