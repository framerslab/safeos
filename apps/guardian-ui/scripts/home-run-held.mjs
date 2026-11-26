#!/usr/bin/env node
// Reads the encoded Watching recordings frame by frame and checks that the
// movement alert the watch scrolled to is what each one shows for its last
// 2.5 seconds. A screencast that missed the frame after the scroll encodes
// the camera held to the end instead, and the alert never appears.
//
// Usage: node scripts/home-run-held.mjs public
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const HELD_SECONDS = 2.5;
// Mean difference of 0 to 255 grey levels between two frames scaled to 160 × 100.
export const SCROLLED = 20;
export const STILL = 12;
const WIDTH = 160;
const HEIGHT = 100;

export function grey(file, at) {
  const bytes = execFileSync('ffmpeg', [
    '-nostdin', '-v', 'error', '-ss', at.toFixed(3), '-i', file, '-frames:v', '1',
    '-vf', `scale=${WIDTH}:${HEIGHT},format=gray`, '-f', 'rawvideo', 'pipe:1',
  ], { maxBuffer: WIDTH * HEIGHT * 4 });
  assert.equal(bytes.length, WIDTH * HEIGHT, `${file} has no frame at ${at.toFixed(3)} s`);
  return bytes;
}

export function difference(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

export function checkHeldAlert(file, { motionOverAt, pictureAt, seconds }) {
  assert.ok(Number.isFinite(motionOverAt) && Number.isFinite(pictureAt), `${file} has no motion or alert time`);
  assert.ok(seconds - pictureAt >= HELD_SECONDS, `${file} reaches the alert ${(seconds - pictureAt).toFixed(2)} s before its end`);
  const camera = grey(file, motionOverAt);
  const held = grey(file, seconds - HELD_SECONDS);
  const last = grey(file, seconds - 0.1);
  const result = {
    heldFromCamera: difference(camera, held),
    lastFromCamera: difference(camera, last),
    heldToLast: difference(held, last),
  };
  console.log(`${file}: ${JSON.stringify(Object.fromEntries(Object.entries(result).map(([k, v]) => [k, Number(v.toFixed(2))])))}`);
  assert.ok(result.heldFromCamera >= SCROLLED && result.lastFromCamera >= SCROLLED,
    `${file} still shows the camera from ${motionOverAt.toFixed(2)} s in its last ${HELD_SECONDS} s; the alert never comes into view: ${JSON.stringify(result)}`);
  assert.ok(result.heldToLast <= STILL,
    `${file} does not hold the alert still for its last ${HELD_SECONDS} s: ${JSON.stringify(result)}`);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const publicDir = path.resolve(process.argv[2] ?? 'public');
  const manifest = JSON.parse(readFileSync(path.join(publicDir, 'home/runs/runs.json'), 'utf8'));
  const run = manifest.runs.find(({ id }) => id === 'watching');
  assert.ok(run, 'The committed runs have no Watching recording');
  const failures = [];
  for (const [size, looks] of Object.entries(run.variants)) {
    for (const [look, variant] of Object.entries(looks)) {
      try {
        checkHeldAlert(path.join(publicDir, variant.video.path), {
          motionOverAt: variant.motionOverAt, pictureAt: variant.pictureAt, seconds: run.seconds,
        });
      } catch (error) {
        failures.push(`watching ${size}-${look}: ${error.message}`);
      }
    }
  }
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log('Every Watching recording holds its alert in view for its last 2.5 seconds.');
}
