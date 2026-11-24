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
// /monitor/, presses the monitor's own "Start watching" key and waits until
// the alert list holds a motion alert. It then saves:
//
//   home/capture-phone-<look>.png      the 390 px monitor's camera view, 16:9
//   home/capture-portrait-<look>.png   the 390 px watch's camera frame with
//                                      its live picture and the meters under
//                                      it, at its own ratio
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
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchSampleDevice, seededContext, settings as CAPTURE_SETTINGS } from './home-run-seed.mjs';

const [baseUrl, outDir, videoFile, audioFile] = process.argv.slice(2);
if (!baseUrl || !outDir || !videoFile || !audioFile) {
  console.error('usage: home-captures.mjs <base-url> <out-dir> <clip.y4m> <clip.wav>');
  process.exit(2);
}

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIP = path.join(APP_ROOT, 'public', 'home', 'sample-clip.mp4');
const LOOKS = ['light', 'dark'];

const alertRows = (page, kind) => page.locator(`.watch-list__body [data-alert-kind="${kind}"]`);

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

// Opens the monitor, presses its own start key and waits for the alert list
// to hold a motion alert. Returns once the Motion meter is over its line.
async function watchUntilMotionAlert(page, name) {
  await page.goto(new URL('/monitor/', baseUrl).toString(), { waitUntil: 'networkidle', timeout: 60_000 });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('safeos-settings') || '{}').state || {});
  if (saved.activePresetId !== 'custom' || saved.globalSettings?.pixelDetectionEnabled !== false) {
    throw new Error(`${name}: the monitor is not on the Custom preset with pixel detection off`);
  }
  console.log(`${name}: seeded the Custom preset with pixel detection off (motion and sound lines ${100 - saved.globalSettings.motionSensitivity} and ${100 - saved.globalSettings.audioSensitivity})`);
  await page.getByRole('button', { name: 'Start watching', exact: true }).click();
  console.log(`${name}: pressed "Start watching"`);
  await page.getByRole('button', { name: 'Stop watching', exact: true }).waitFor({ timeout: 30_000 }).catch(async (err) => {
    const shown = await page.locator('.watch-frame [role="status"]').first().textContent({ timeout: 2_000 }).catch(() => null);
    throw new Error(shown ? `the camera did not start: ${shown.replace(/\s+/g, ' ').trim()}` : err.message);
  });
  const started = Date.now();
  await alertRows(page, 'motion').first().waitFor({ timeout: 120_000 });
  const motionAt = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`${name}: the alert list holds a motion alert ${motionAt} s after the camera went live`);
  console.log(`${name}: motion alert reads "${(await alertRows(page, 'motion').first().locator('[data-alert-line]').textContent()).trim()}"`);
  // The Motion meter reads "Over the line" while the reading is at or over
  // its line, its bar past the line in the alert colour; the capture is saved
  // while it does.
  const indicator = page.getByRole('meter', { name: 'Motion level' });
  await overTheLine(page, 60_000);
  console.log(`${name}: Motion meter before saving: "${await indicator.getAttribute('aria-valuetext')}"`);
  return { indicator };
}

// Waits until the Motion meter reads over its line.
function overTheLine(page, timeout) {
  return page.waitForFunction(() => /Over the line$/.test(
    document.querySelector('[role="meter"][aria-label="Motion level"]')?.getAttribute('aria-valuetext') || '',
  ), null, { timeout, polling: 100 });
}

// The meters the portrait crop does not hold whole: every meter stands
// wholly inside it, so a crop that cuts one or leaves one out is not kept.
async function metersCutBy(page, frame) {
  return page.evaluate((f) => {
    const meters = [...document.querySelectorAll('.watch-meter')];
    if (meters.length === 0) return ['(the meters were not found)'];
    return meters.filter((meter) => {
      const box = meter.getBoundingClientRect();
      const right = f.x + f.width;
      const bottom = f.y + f.height;
      const inside = box.left >= f.x - 0.5 && box.right <= right + 0.5 && box.top >= f.y - 0.5 && box.bottom <= bottom + 0.5;
      return !inside;
    }).map((meter) => meter.querySelector('.watch-meter__name')?.textContent.trim() || '(a meter)');
  }, frame);
}

// What collides in the meters' strip at the width a picture is taken at: a
// meter's state word over its name. The watch draws them clear at 390 px; a
// picture of a watch narrowed until they collide is not kept.
async function meterCollisions(page) {
  return page.evaluate(() => {
    const out = [];
    const meters = [...document.querySelectorAll('.watch-meter:not(.watch-meter--pet)')];
    if (meters.length === 0) out.push('the meters were not found');
    for (const meter of meters) {
      const name = meter.querySelector('.watch-meter__name')?.getBoundingClientRect();
      const state = meter.querySelector('.watch-meter__state')?.getBoundingClientRect();
      if (!name || !state) continue;
      const apart = state.left >= name.right - 0.5 || state.top >= name.bottom - 0.5;
      if (!apart) out.push(`the state word of ${meter.querySelector('.watch-meter__name').textContent.trim()} runs over its name`);
    }
    return out;
  });
}

// The portrait crop, from the 390 px watch as it stands: the camera's frame,
// its live picture and the meters' strip under it, the corner ticks inside
// the crop. The home page gives its box the ratio of the file.
async function portraitFrame(page, name) {
  const margin = 8;
  const box = await page.locator('.watch-frame').first().boundingBox();
  if (!box) throw new Error(`${name}: the camera's frame was not found`);
  const x = Math.floor(box.x - margin);
  const y = Math.floor(box.y - margin);
  const width = Math.ceil(box.x + box.width + margin) - x;
  const height = Math.ceil(box.y + box.height + margin) - y;
  const ratio = width / height;
  // The same bounds as the home page's checks and the file's test.
  if (!(ratio > 0.6 && ratio < 1.6)) {
    throw new Error(`${name}: the frame with its meters is ${width} by ${height} px, ${ratio.toFixed(3)} wide for its height`);
  }
  return { x, y, width, height };
}

// Every crop shows the Motion meter over its line, as its text equivalent
// says: the picture is taken while the meter reads "Over the line" and kept
// only if it still does once the picture is saved;
// otherwise it is taken again at the next motion, up to five times. A crop
// that runs past the edge of the screen is saved cut short, so a picture is
// kept only at the size its crop asks for: it is written beside its name and
// takes the name only once its size is right.
async function saveCrop(page, relative, clip, details) {
  const file = path.join(outDir, relative);
  const taken = `${file}.taking.png`;
  const indicator = page.getByRole('meter', { name: 'Motion level' });
  for (let attempt = 1; ; attempt += 1) {
    await overTheLine(page, 60_000);
    await page.screenshot({ path: taken, clip });
    const after = (await indicator.getAttribute('aria-valuetext')) || '';
    if (/Over the line$/.test(after)) break;
    if (attempt === 5) throw new Error(`${relative}: the Motion meter left its line while each of five pictures was taken`);
    console.log(`${relative}: the Motion meter read "${after}" once the picture was saved; taking it again`);
  }
  const size = pngSize(await readFile(taken));
  const asked = { width: clip.width * details.deviceScaleFactor, height: clip.height * details.deviceScaleFactor };
  if (Math.abs(size.width - asked.width) > 1 || Math.abs(size.height - asked.height) > 1) {
    await rm(taken, { force: true });
    throw new Error(`${relative} is ${size.width} by ${size.height} px, not the ${Math.round(asked.width)} by ${Math.round(asked.height)} px its crop asks for: the crop runs past the edge of the ${details.viewport} screen`);
  }
  await rename(taken, file);
  await record(relative, { ...details, ...size });
  const webp = relative.replace(/\.png$/, '.webp');
  execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', file, '-c:v', 'libwebp', '-quality', '86', '-compression_level', '6', path.join(outDir, webp)]);
  await record(webp, { ...details, ...size });
}

await mkdir(path.join(outDir, 'home'), { recursive: true });
await mkdir(path.join(outDir, 'screenshots'), { recursive: true });

const browser = await launchSampleDevice(videoFile, audioFile);
let failures = 0;
const portraitForCard = {};
try {
  for (const look of LOOKS) {
    // The 390 px watch: the camera view itself, and the portrait crop that
    // also holds the meters under it. The scale gives the
    // portrait crop more than twice the width the desktop page shows it at.
    {
      const viewport = { width: 390, height: 1100 };
      const scale = 3.5;
      const context = await seededContext(browser, {
        viewport, deviceScaleFactor: scale, isMobile: true, hasTouch: true, colorScheme: look,
      });
      const page = await context.newPage();
      const name = `390 px monitor, ${look}`;
      try {
        const { indicator } = await watchUntilMotionAlert(page, name);
        const view = await page.locator('.watch-frame__screen').first().boundingBox();
        if (!view || view.width < 300 || view.width > 390) throw new Error(`${name}: the camera view is ${view ? Math.round(view.width) : 'not'} px wide`);
        const width = Math.floor(view.width);
        const details = { look, viewport: `${viewport.width}x${viewport.height}`, deviceScaleFactor: scale };
        await saveCrop(page, `home/capture-phone-${look}.png`,
          { x: view.x, y: view.y, width, height: Math.round(width * 9 / 16) }, { ...details, crop: 'camera view, 16:9' });
        console.log(`${name}: Motion meter after the camera view was saved: "${await indicator.getAttribute('aria-valuetext')}"`);
        const portrait = await portraitFrame(page, name);
        console.log(`${name}: the portrait crop is ${portrait.width} by ${portrait.height} CSS px, ${(portrait.width / portrait.height).toFixed(3)} wide for its height`);
        const cut = await metersCutBy(page, portrait);
        if (cut.length > 0) throw new Error(`${name}: the portrait crop cuts the meters ${cut.join(', ')}`);
        const collisions = await meterCollisions(page);
        if (collisions.length > 0) throw new Error(`${name}: at ${viewport.width} px, where the portrait crop is taken, ${collisions.join('; ')}`);
        await saveCrop(page, `home/capture-portrait-${look}.png`, portrait,
          { ...details, crop: 'camera frame with its meters' });
        console.log(`${name}: Motion meter after the portrait crop was saved: "${await indicator.getAttribute('aria-valuetext')}"`);
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
        const { indicator } = await watchUntilMotionAlert(page, name);
        // The landscape crop shows the alert list, which also holds a sound alert.
        await alertRows(page, 'audio').first().waitFor({ timeout: 120_000 })
          .catch(() => { throw new Error(`${name}: the alert list holds no sound alert`); });
        const sound = await alertRows(page, 'audio').count();
        console.log(`${name}: the alert list holds ${sound} sound alert${sound === 1 ? '' : 's'}`);
        await overTheLine(page, 60_000);
        // The crop starts 8 px over the camera's frame, across the watch's
        // two columns: the frame and its meters beside the alert list.
        const framePart = page.locator('.watch-grid__frame').first();
        const gridPart = page.locator('.watch-grid').first();
        const placed = async () => {
          const whole = await gridPart.boundingBox();
          const frame = await framePart.boundingBox();
          return whole && frame ? { x: whole.x, y: frame.y - 8, width: whole.width } : null;
        };
        let grid = await placed();
        if (!grid || grid.width < 1100 || grid.width > 1280) throw new Error(`${name}: the monitor's grid is ${grid ? Math.round(grid.width) : 'not'} px wide`);
        const width = Math.floor(grid.width);
        const height = Math.round(width * 10 / 16);
        // The crop is taken whole. Where the grid starts too far down the
        // screen for it, the page moves up by what the crop lacks and 8 px
        // more, so a move the browser rounds to its own pixels leaves room.
        const lacking = Math.ceil(grid.y + height - viewport.height);
        if (lacking > 0) {
          await page.evaluate((by) => window.scrollBy({ top: by, behavior: 'instant' }), lacking + 8);
          grid = await placed();
          if (!grid) throw new Error(`${name}: the monitor's grid was not found once the page had moved up`);
          console.log(`${name}: the landscape crop ran ${lacking} px past the foot of the screen; the page moved up and the grid starts ${grid.y.toFixed(1)} px down it`);
        }
        await saveCrop(page, `home/capture-landscape-${look}.png`,
          { x: grid.x, y: grid.y, width, height },
          { look, viewport: `${viewport.width}x${viewport.height}`, deviceScaleFactor: scale, crop: 'camera view beside the alert list, 16:10' });
        console.log(`${name}: Motion meter after saving: "${await indicator.getAttribute('aria-valuetext')}"`);
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
      await page.getByRole('heading', { level: 1, name: 'Not watching', exact: true }).waitFor({ timeout: 20_000 });
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
      // The capture is shown whole, at its own ratio, so it is drawn before the picture is taken.
      await page.evaluate(() => Promise.all([...document.images].map((image) => image.decode().catch(() => {}))));
      const drawn = await page.evaluate(() => {
        const image = document.querySelector('.capture img');
        return { width: image.naturalWidth, height: image.getBoundingClientRect().height };
      });
      if (!drawn.width || drawn.height < 300) throw new Error(`the card's capture is ${Math.round(drawn.height)} px tall`);
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
