// Tests for the scripts that record and check the home page runs.
// Run with: node --test scripts/home-run-scripts.test.mjs (needs ffmpeg).
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkFlashFrames, spool } from './home-run-frames.mjs';
import { checkHeldAlert } from './home-run-held.mjs';
import { cssReferences } from './home-run-inputs.mjs';
import { omittedRuns, recipes } from './home-run-list.mjs';
import { barredWording } from './home-wording.cjs';

const scripts = path.dirname(fileURLToPath(import.meta.url));
const scratch = mkdtempSync(path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), 'home-run-scripts-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

// A PNG signature and IHDR header: all spool reads of a frame.
function png(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes.toString('base64');
}

function devTools(width, height) {
  const listeners = new Set();
  const data = png(width, height);
  return {
    on: (event, listen) => { if (event === 'Page.screencastFrame') listeners.add(listen); },
    off: (event, listen) => listeners.delete(listen),
    send: async (method) => (method === 'Page.captureScreenshot' ? { data } : {}),
    detach: async () => {},
    frame: (timestamp) => {
      for (const listen of [...listeners]) listen({ data, metadata: { timestamp }, sessionId: 1 });
    },
  };
}

async function record(steps) {
  const view = { width: 8, height: 5, scale: 1, seconds: 7 };
  const directory = mkdtempSync(path.join(scratch, 'spool-'));
  const cdp = devTools(view.width, view.height);
  const started = spool(cdp, directory, view);
  cdp.frame(steps[0]);
  const recording = await started;
  for (const step of steps.slice(1)) {
    if (typeof step === 'number') cdp.frame(step);
    else await recording.capture(step.screenshot);
  }
  return (await recording.stop()).map(({ at }) => at);
}

test('a DevTools frame sampled before a held-page screenshot keeps its place', async () => {
  assert.deepEqual(await record([100, { screenshot: 100.22 }, 100.05]), [100, 100.05, 100.22]);
});

test('a DevTools frame more than 150 ms older than the last DevTools frame fails', async () => {
  await assert.rejects(record([100, 100.3, 100.1]), /Out-of-order DevTools timestamp/);
});

// Grey levels whose linear luminance is 0, 0.07 and 0.158.
const BLACK = 0;
const DIM = 75;
const GREY = 105;

function frames(levels) {
  const size = 96 * 96 * 3;
  const bytes = Buffer.alloc(size * levels.length);
  levels.forEach((level, index) => bytes.fill(level, index * size, (index + 1) * size));
  return bytes;
}

test('four flashes in a second fail when each rise comes in two small steps', () => {
  const levels = [BLACK, ...Array(5).fill([DIM, GREY, BLACK]).flat(), ...Array(15).fill(BLACK)];
  for (const size of ['square', 'wide']) {
    assert.throws(() => checkFlashFrames(frames(levels), size), /More than three luminance flashes/);
  }
});

test('four flashes in a second fail when each step is large', () => {
  const levels = [BLACK, ...Array(5).fill([GREY, BLACK]).flat(), ...Array(15).fill(BLACK)];
  assert.throws(() => checkFlashFrames(frames(levels), 'wide'), /More than three luminance flashes/);
});

test('one flash and a slow fade pass', () => {
  const levels = [BLACK, GREY, BLACK, ...Array(15).fill(BLACK), BLACK, DIM, DIM, GREY, GREY, GREY, DIM, DIM, BLACK];
  assert.doesNotThrow(() => checkFlashFrames(frames(levels), 'wide'));
});

// A seven second clip at 15 frames a second: camera noise until the alert,
// then a flat alert page, with camera noise again where `camera` says.
function clip(name, camera) {
  const file = path.join(scratch, name + '.mp4');
  execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=0xb0b0b0:s=320x200:r=15:d=7',
    '-f', 'lavfi', '-i', "nullsrc=s=320x200:r=15:d=7,geq=lum='random(1)*255':cb=128:cr=128",
    '-filter_complex', `[0][1]overlay=enable='${camera}',format=yuv420p`,
    '-c:v', 'libx264', '-crf', '18', '-g', '15', file]);
  return file;
}

const moments = { motionOverAt: 1, pictureAt: 3.5, seconds: 7 };

test('an alert held for the last 2.5 seconds passes', () => {
  assert.doesNotThrow(() => checkHeldAlert(clip('steady', 'lt(t,3.5)'), moments));
});

test('an alert that gives way to the camera inside the last 2.5 seconds fails', () => {
  assert.throws(() => checkHeldAlert(clip('interrupted', 'lt(t,3.5)+between(t,5,6)'), moments),
    /does not hold the alert still/);
});

test('the held check runs from a folder whose name has a space', () => {
  const folder = path.join(scratch, 'a folder');
  mkdirSync(folder);
  copyFileSync(path.join(scripts, 'home-run-held.mjs'), path.join(folder, 'home-run-held.mjs'));
  const result = spawnSync(process.execPath, [path.join(folder, 'home-run-held.mjs'), path.join(scratch, 'no-public')],
    { encoding: 'utf8' });
  assert.notEqual(result.status, 0, 'A public folder without runs must fail the check, not skip it');
  assert.match(result.stderr, /no-public/);
});

test('a stylesheet named by @import url() is a recording input', () => {
  assert.deepEqual(cssReferences('@import url("./recorded-layout.css");'), ['./recorded-layout.css']);
  assert.deepEqual(cssReferences("@import url( './a.css' ) screen;"), ['./a.css']);
  assert.deepEqual(cssReferences('@import "./b.css";'), ['./b.css']);
  assert.deepEqual(cssReferences('.mark { background: url(/logo.svg); }'), ['/logo.svg']);
});

test('the Lost and Found run enrols photo 1 alone, plays the sample clip and comes third of four', () => {
  assert.deepEqual(recipes.map(({ id }) => id), ['watching', 'dashboard', 'lost-found', 'settings']);
  assert.deepEqual(omittedRuns.map(({ id }) => id), ['alert']);
  const run = recipes.find(({ id }) => id === 'lost-found');
  assert.equal(run.key, 'Lost and Found');
  assert.equal(run.route, '/monitor/');
  assert.equal(run.clip, 'home/sample-clip.mp4');
  // Photos 2 and 3 are stills from the recording the clip comes from; photo 1 was taken on another day.
  assert.deepEqual(run.photos, ['home/lost-found/photo-1.jpg']);
  const publicDir = path.join(scripts, '..', 'public');
  const photos = JSON.parse(readFileSync(path.join(publicDir, 'home/lost-found/photos.json'), 'utf8')).photos;
  const clip = JSON.parse(readFileSync(path.join(publicDir, 'home/sample-clip.json'), 'utf8'));
  for (const file of run.photos) {
    const photo = photos.find((entry) => entry.file === file);
    assert.ok(photo, 'The run enrols a photo with no record: ' + file);
    assert.notEqual(photo.source.page, clip.sources[0].page, file + ' is cut from the clip’s own recording');
  }
  // The caption keeps two lines at 320 px and one from 1280 px, as the home's checks require.
  assert.equal(run.description, 'The kitten clip compared with a photo from another day, and a possible sighting.');
  assert.ok(run.description.length <= 87, 'The caption is longer than the Watching run’s');
  assert.deepEqual(run.longDescription, [
    '0–2 seconds. Lost and Found holds Toffee’s one saved photo, a kitten lying on a beige carpet.',
    '2–5 seconds. The watch compares the kitten clip, on a grey carpet, with that photo twice a second.',
    '5–9 seconds. A possible sighting asks "Could this be Toffee?" with the camera’s picture beside the saved photo, to check by eye.',
  ]);
  assert.doesNotMatch([run.key, run.description, ...run.longDescription].join(' '), barredWording);
  // The spans follow each other from 0 to the end of the recording.
  const spans = run.longDescription.map((line) => line.match(/^(\d+)–(\d+) seconds\. /)?.slice(1).map(Number));
  assert.ok(spans.every(Boolean), 'Each line starts with its seconds');
  assert.equal(spans[0][0], 0);
  spans.slice(1).forEach(([from], index) => assert.equal(from, spans[index][1]));
  assert.equal(spans.at(-1)[1], run.seconds);
  assert.ok(run.seconds >= 6 && run.seconds <= 9, 'A run lasts 6 to 9 seconds');
});
