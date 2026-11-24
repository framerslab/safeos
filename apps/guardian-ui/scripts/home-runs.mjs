import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import {
  captureNotifications, checkNotifications, emulatedSurface, encodeVariant, limits,
  outputTime, readRecordingWords, sha256, spool, testPosterEncoders,
} from './home-run-frames.mjs';
import { recordingInputs } from './home-run-inputs.mjs';
import { omittedRuns, placeSubject, recipes } from './home-run-list.mjs';
import { launchSampleDevice, seededContext } from './home-run-seed.mjs';

const [baseUrl, outDir, video, audio, gardenVideo, gardenAudio] = process.argv.slice(2);
assert.ok(baseUrl && outDir && video && audio && Boolean(gardenVideo) === Boolean(gardenAudio),
  'Usage: home-runs.mjs baseUrl outDir sampleY4m sampleWav [gardenY4m gardenWav]');
const commit = process.env.CAPTURE_COMMIT;
const run = process.env.CAPTURE_RUN;
assert.match(commit ?? '', /^[0-9a-f]{40}$/, 'The producer must name its source commit');
assert.match(run ?? '', /^https:\/\/github\.com\/framerslab\/safeos\/actions\/runs\/\d+$/, 'The producer must name its workflow run');

const looks = ['dark', 'light'];
const scratch = process.env.RUNNER_TEMP ?? os.tmpdir();
const workspace = await mkdtemp(path.join(scratch, 'safeos-frames-'));
const publicRoot = new URL('../public/', import.meta.url);
const sampleClip = JSON.parse(await readFile(new URL('home/sample-clip.json', publicRoot), 'utf8'));
const clip = 'home/sample-clip.mp4';
const actualHash = sha256(await readFile(new URL(clip, publicRoot)));
assert.equal(actualHash, sampleClip.sha256, 'The sample clip differs from its credit record');
const source = recordingInputs(recipes.map(({ id }) => id));
for (const [name, oid] of Object.entries(source.inputs)) console.log(`${oid}  ${name}`);

function watchWords(page, crop) {
  let pending;
  let error;
  const timer = setInterval(() => {
    if (pending || error) return;
    pending = readRecordingWords(page, crop).catch((failure) => { error = failure; }).finally(() => { pending = null; });
  }, 240);
  return async () => {
    clearInterval(timer);
    await pending;
    if (error) throw error;
  };
}

async function recordVariant(browser, recipe, view, avif) {
  const label = `${recipe.id} ${recipe.route} ${view.size}-${view.look} ${view.width}×${view.height}`;
  const dir = await mkdtemp(path.join(workspace, `${recipe.id}-`));
  const context = await seededContext(browser, {
    viewport: { width: view.width, height: view.height },
    deviceScaleFactor: view.scale,
    isMobile: view.size === 'square',
    hasTouch: view.size === 'square',
    colorScheme: view.look,
    timezoneId: 'UTC',
    locale: 'en-US',
  });
  const page = await context.newPage();
  try {
    await captureNotifications(context);
    const cdp = await emulatedSurface(page, view);
    const prepared = await recipe.prepare({ page, baseUrl });
    const actualLook = await page.evaluate(() => document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    assert.equal(actualLook, view.look, 'The site look differs from the browser');
    const viewport = await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]);
    assert.deepEqual(viewport, [view.width, view.height, view.scale], 'The recording changed the app’s CSS viewport or device scale');
    const top = await placeSubject(page, recipe, view);
    const crop = { x: 0, y: top, width: view.width, height: view.size === 'square' ? view.width : view.height };
    const recording = await spool(cdp, dir, view);
    const stopReading = watchWords(page, crop);
    let cut;
    let frames;
    try {
      cut = await recipe.record({ page, view, top, prepared, sample: () => readRecordingWords(page, crop, { poster: true }) });
    } finally {
      try {
        frames = await recording.stop();
      } finally {
        await stopReading();
      }
    }
    checkNotifications(cut.notices);
    const smallest = cut.words.reduce((best, word) => word.size < best.size ? word : best);
    if (view.size === 'square' && smallest.size * 288 / view.width < 14) {
      const width = Math.floor(288 * smallest.size / 14);
      assert.ok(width >= 320, `“${smallest.word}” at ${smallest.size} CSS px cannot show at 14 px in 288 px: ${JSON.stringify(smallest)}`);
      assert.ok(width < view.width, 'Narrower square must change the page layout');
      console.log(`${label}: “${smallest.word}” at ${smallest.size} CSS px needs to be recorded at ${width} px`);
      return { narrower: width };
    }
    const files = await encodeVariant({ frames, cut, view, crop, directory: dir, outDir, id: recipe.id, avif });
    console.log(`${label}: crop starts at ${top}, ${frames.length} frames, ${cut.words.length} words, smallest ${smallest.size} CSS px`);
    return {
      ...files,
      viewport: { width: view.width, height: view.height },
      crop,
      scale: view.scale,
      eventAt: outputTime(cut.event, cut),
      posterAt: outputTime(cut.poster, cut),
      words: cut.words,
      ...(cut.peaks ? {
        meterPeaks: cut.peaks,
        barkEndedAt: outputTime(cut.lastBarkReading, cut),
        sourceSeconds: cut.end - cut.start,
        ...(cut.trim ? { startupTrimSeconds: cut.trim.end - cut.trim.start } : {}),
      } : {}),
      ...(cut.watchEvents ? { watchEvents: cut.watchEvents } : {}),
      ...(cut.notices?.length ? { notifications: cut.notices } : {}),
    };
  } catch (cause) {
    const diagnostics = path.join(scratch, 'home-run-diagnostics');
    await mkdir(diagnostics, { recursive: true });
    const image = [recipe.id, view.size, view.look].join('-') + '.png';
    await page.screenshot({ path: path.join(diagnostics, image) }).catch(() => {});
    throw new Error(`${label}: ${cause.message}`, { cause });
  } finally {
    await context.close();
    await rm(dir, { recursive: true, force: true });
  }
}

async function recordSet(browsers, recipe, avif) {
  const variants = { square: {}, wide: {} };
  let width = 390;
  while (true) {
    let narrower = width;
    for (const look of looks) {
      const result = await recordVariant(browsers.square, recipe, { size: 'square', look, width, height: 844, scale: 3, seconds: recipe.seconds }, avif);
      if (result.narrower) narrower = Math.min(narrower, result.narrower);
      else variants.square[look] = result;
    }
    if (narrower === width) break;
    width = narrower;
  }
  for (const look of looks) {
    variants.wide[look] = await recordVariant(browsers.wide, recipe, {
      size: 'wide', look, width: 768, height: 480, scale: 2.5, seconds: recipe.seconds,
    }, avif);
  }
  const { id, key, route, state, clip, seconds, description, longDescription } = recipe;
  const first = variants.square.dark;
  return {
    id, key, route, state, clip, seconds, description, longDescription,
    eventAt: first.eventAt, posterAt: first.posterAt, visibleWords: first.words.map(({ word }) => word),
    ...(first.meterPeaks ? { meterPeaks: first.meterPeaks } : {}), variants,
  };
}

const sample = {};
const withoutClip = {};
try {
  await mkdir(outDir, { recursive: true });
  const avif = await testPosterEncoders(workspace);
  console.log(`Poster formats: WebP${avif ? ' and AVIF' : ''}`);
  sample.square = await launchSampleDevice(video, audio, 'chromium');
  sample.wide = await launchSampleDevice(video, audio, 'chromium', 2.5);
  withoutClip.square = await chromium.launch({ channel: 'chromium' });
  withoutClip.wide = await chromium.launch({
    channel: 'chromium', args: ['--force-device-scale-factor=2.5'],
  });
  const runs = [];
  const failures = [];
  for (const recipe of recipes) {
    try {
      runs.push(await recordSet(recipe.clip ? sample : withoutClip, recipe, avif));
    } catch (error) {
      failures.push(error);
      console.error(error.message);
    }
  }
  if (failures.length) throw new AggregateError(failures, 'The recording set is incomplete');
  for (const size of ['square', 'wide']) {
    for (const look of looks) {
      const total = runs.reduce((bytes, { variants }) => {
        const { video, poster } = variants[size][look];
        return bytes + video.bytes + Math.max(...Object.values(poster).map((file) => file.bytes));
      }, 0);
      assert.ok(total <= limits[size].all, `${size}-${look} exceeds its combined budget: ${total}`);
    }
  }
  const encoder = execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' }).split('\n')[0];
  const manifest = {
    schemaVersion: 1, commit, run, ...source,
    browser: sample.square.version(), encoder,
    clips: [{ path: clip, sha256: actualHash, tracks: sampleClip.tracks, credit: sampleClip.credit.long, sources: sampleClip.sources }],
    omitted: omittedRuns,
    runs,
  };
  await writeFile(path.join(outDir, 'runs.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Saved ${runs.length} runs, each in four variants, from ${commit}`);
} finally {
  await Promise.allSettled([...Object.values(sample), ...Object.values(withoutClip)].map((browser) => browser.close()));
  await rm(workspace, { recursive: true, force: true });
}
