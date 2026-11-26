import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import {
  captureNotifications, checkNotifications, encodeVariant, ffmpeg, limits,
  outputTime, readRecordingWords, sha256, spool, testPosterEncoders, wideView,
} from './home-run-frames.mjs';
import { recordingInputs } from './home-run-inputs.mjs';
import { omittedRuns, placeSubject, recipes } from './home-run-list.mjs';
import { launchSampleDevice, recordingSettings, seededContext } from './home-run-seed.mjs';

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
const sampleClip = 'home/sample-clip.mp4';
const clipPaths = [...new Set(recipes.map(({ clip }) => clip).filter(Boolean))];
const clips = await Promise.all(clipPaths.map(async (clip) => {
  const input = JSON.parse(await readFile(new URL(clip.replace(/\.mp4$/, '.json'), publicRoot), 'utf8'));
  const actualHash = sha256(await readFile(new URL(clip, publicRoot)));
  assert.equal(actualHash, input.sha256, `The sample clip ${clip} differs from its credit`);
  return {
    path: clip, sha256: actualHash, tracks: input.tracks, clipOffset: input.clipOffset,
    credit: input.credit.long ?? input.credit, sources: input.sources ?? [input.source],
  };
}));
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
  }, recipe.settings ?? recordingSettings);
  const page = await context.newPage();
  page.setDefaultTimeout(4000);
  try {
    await captureNotifications(context);
    const cdp = await context.newCDPSession(page);
    const prepared = await recipe.prepare({ page, baseUrl, view });
    const actualLook = await page.evaluate(() => document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    assert.equal(actualLook, view.look, 'The site look differs from the browser');
    const viewport = await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]);
    assert.deepEqual(viewport, [view.width, view.height, view.scale], 'The recording changed the app’s CSS viewport or device scale');
    const height = view.size === 'square' ? view.width : view.width * 5 / 8;
    const top = await placeSubject(page, recipe, view, height);
    const crop = { x: 0, y: top, width: view.width, height };
    const recording = await spool(cdp, dir, view);
    const stopReading = watchWords(page, crop);
    let cut;
    let frames;
    try {
      cut = await recipe.record({
        page, view, top, crop, prepared, nextFrameAfter: recording.nextFrameAfter, captureFrame: recording.capture,
        sample: () => readRecordingWords(page, crop, { poster: true }),
        whole: (moment, { controls = true } = {}) => readRecordingWords(page, crop, { whole: true, controls, moment }),
      });
    } catch (error) {
      // Keep the failing step when stopping the screencast also reports an error.
      await Promise.allSettled([recording.stop(), stopReading()]);
      throw error;
    }
    try {
      frames = await recording.stop();
    } finally {
      await stopReading();
    }
    checkNotifications(cut.notices);
    const smallest = cut.words.reduce((best, word) => word.size < best.size ? word : best);
    if (view.size === 'square' && smallest.size * 288 / view.width < 14) {
      // At 3×, an even CSS width keeps both H.264 dimensions even.
      const width = 2 * Math.floor(288 * smallest.size / (2 * 14));
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
        posterReading: cut.posterReading,
        motionLine: cut.line,
        motionOverAt: outputTime(cut.motionOverAt, cut),
      } : {}),
      ...(cut.pictureAt ? { pictureAt: outputTime(cut.pictureAt, cut) } : {}),
      ...(cut.watchEvents ? {
        watchEvents: cut.watchEvents.map(({ kind, at, clipAt }) => ({ kind, at, clipAt })),
      } : {}),
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
  const wide = wideView(recipe.id);
  const wideBrowser = wide.scale === 3 ? browsers.square : browsers.wide;
  for (const look of looks) {
    variants.wide[look] = await recordVariant(wideBrowser, recipe, {
      ...wide, size: 'wide', look, seconds: recipe.seconds,
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

function sampleInput(recipe) {
  if (!recipe.inputOffset) return [video, audio];
  assert.equal(clips.find(({ path }) => path === recipe.clip)?.clipOffset, recipe.inputOffset);
  const input = fileURLToPath(new URL(recipe.clip, publicRoot));
  const audioSource = fileURLToPath(new URL(sampleClip, publicRoot));
  const camera = path.join(workspace, `${recipe.id}.y4m`);
  const microphone = path.join(workspace, `${recipe.id}.wav`);
  // Keep the final camera frame until the alert hold ends. The fake camera
  // would otherwise loop back to the kitten and raise another motion alert.
  ffmpeg(['-i', input, '-an', '-vf', 'tpad=stop_mode=clone:stop_duration=4', '-pix_fmt', 'yuv420p', camera]);
  ffmpeg(['-ss', String(recipe.inputOffset), '-i', audioSource, '-vn', '-af', 'apad=pad_dur=4', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', microphone]);
  return [camera, microphone];
}

try {
  await mkdir(outDir, { recursive: true });
  const avif = await testPosterEncoders(workspace);
  console.log(`Poster formats: WebP${avif ? ' and AVIF' : ''}`);
  const runs = [];
  let browserVersion;
  for (const recipe of recipes) {
    const input = recipe.clip ? sampleInput(recipe) : null;
    const launch = (scale) => input ? launchSampleDevice(...input, 'chromium', scale) : chromium.launch({
      channel: 'chromium', args: [`--force-device-scale-factor=${scale}`],
    });
    const browsers = {};
    try {
      browsers.square = await launch(3);
      browserVersion ??= browsers.square.version();
      if (wideView(recipe.id).scale !== 3) browsers.wide = await launch(2.5);
      runs.push(await recordSet(browsers, recipe, avif));
    } finally {
      await Promise.allSettled(Object.values(browsers).map((browser) => browser.close()));
    }
  }
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
    browser: browserVersion, encoder,
    clips,
    omitted: omittedRuns,
    runs,
  };
  await writeFile(path.join(outDir, 'runs.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Saved ${runs.length} runs, each in four variants, from ${commit}`);
} finally {
  await rm(workspace, { recursive: true, force: true });
}
