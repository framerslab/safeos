// Tests for the scripts that record and check the home page runs.
// Run with: node --test scripts/home-run-scripts.test.mjs (needs ffmpeg).
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkFlashFrames, spool } from './home-run-frames.mjs';
import { checkHeldAlert } from './home-run-held.mjs';
import { cssReferences } from './home-run-inputs.mjs';
import { recipes, settingsMoves } from './home-run-list.mjs';

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

// A list of words as the Settings run shows it: lines 12 CSS px tall, one every
// 32, dark on a light ground. A frame is the 96 rows of one screen, from where
// the list stands at the frame's moment.
const GROUND = 245;
const WORDS = 60;

// Where a list that makes `moves` stands `time` seconds into its run.
function standsAt(moves, time) {
  let top = 0;
  for (const { at, seconds, to } of moves) {
    if (time <= at) break;
    if (time >= at + seconds) top = to;
    else return top + (to - top) * (time - at) / seconds;
  }
  return top;
}

// The page paints sixty times a second and the recording keeps fifteen frames
// of them. `late` is how many paints before its own moment each kept frame was
// made.
function listFrames(moves, { screen, seconds, late }) {
  const edge = 96;
  const row = screen / edge;
  const bytes = Buffer.alloc(edge * edge * 3 * seconds * 15);
  for (let frame = 0; frame < seconds * 15; frame++) {
    const top = standsAt(moves, (4 * frame - late) / 60);
    for (let y = 0; y < edge; y++) {
      const [from, to] = [top + y * row, top + (y + 1) * row];
      let words = 0;
      for (let line = Math.floor((from - 22) / 32); line * 32 + 10 < to; line++) {
        words += Math.max(0, Math.min(to, line * 32 + 22) - Math.max(from, line * 32 + 10));
      }
      const level = Math.round(GROUND + (WORDS - GROUND) * words / row);
      bytes.fill(level, (frame * edge + y) * edge * 3, (frame * edge + y + 1) * edge * 3);
    }
  }
  return bytes;
}

// The square run: a 328 px screen and 845 px of list past it.
test('the Settings run shows a list of words without a flash, wherever its frames fall', () => {
  const { seconds } = recipes.find(({ id }) => id === 'settings');
  const moves = settingsMoves(845, 328);
  for (const late of [0, 1, 2, 3]) {
    assert.doesNotThrow(() => checkFlashFrames(listFrames(moves, { screen: 328, seconds, late }), 'square'),
      `Frames made ${late} paints before their moment`);
  }
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
