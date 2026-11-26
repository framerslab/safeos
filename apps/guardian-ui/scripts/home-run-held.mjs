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
import { pathToFileURL } from 'node:url';

export const HELD_SECONDS = 2.5;
// The watch page's alert list lies on flat page colours, so one band of four
// grey levels covers about a third of its frame or more. A camera picture
// spreads over many bands: a fifth of the frame or less, with the meter strip.
export const FLAT = 0.3;
export const FLATTER = 0.08;
// Mean difference of 0 to 255 grey levels between two frames scaled to 160 × 100.
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

// Every frame from `from` seconds to the end, decoded in one pass.
export function greyFrames(file, from) {
  const size = WIDTH * HEIGHT;
  const bytes = execFileSync('ffmpeg', [
    '-nostdin', '-v', 'error', '-ss', from.toFixed(3), '-i', file,
    '-vf', `scale=${WIDTH}:${HEIGHT},format=gray`, '-f', 'rawvideo', 'pipe:1',
  ], { maxBuffer: 64 * 1024 * 1024 });
  assert.ok(bytes.length >= size && bytes.length % size === 0, `${file} has no whole frames after ${from.toFixed(3)} s`);
  return Array.from({ length: bytes.length / size }, (_, index) => bytes.subarray(index * size, (index + 1) * size));
}

export function difference(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

export function flatShare(frame) {
  const bands = new Array(64).fill(0);
  for (const level of frame) bands[level >> 2] += 1;
  return Math.max(...bands) / frame.length;
}

export function checkHeldAlert(file, { motionOverAt, pictureAt, seconds }) {
  assert.ok(Number.isFinite(motionOverAt) && Number.isFinite(pictureAt), `${file} has no motion or alert time`);
  assert.ok(seconds - pictureAt >= HELD_SECONDS, `${file} reaches the alert ${(seconds - pictureAt).toFixed(2)} s before its end`);
  const camera = grey(file, motionOverAt);
  // Compare every frame of the hold with its first, so an alert that gives
  // way to the camera between the two ends of the hold fails.
  const hold = greyFrames(file, seconds - HELD_SECONDS);
  const held = hold[0];
  const last = hold.at(-1);
  const result = {
    camera: flatShare(camera),
    held: flatShare(held),
    last: flatShare(last),
    heldToLast: Math.max(...hold.map((frame) => difference(held, frame))),
  };
  console.log(`${file}: ${JSON.stringify(Object.fromEntries(Object.entries(result).map(([k, v]) => [k, Number(v.toFixed(2))])))}`);
  assert.ok(Math.min(result.held, result.last) >= Math.max(FLAT, result.camera + FLATTER),
    `${file} still shows the camera from ${motionOverAt.toFixed(2)} s in its last ${HELD_SECONDS} s; the alert never comes into view: ${JSON.stringify(result)}`);
  assert.ok(result.heldToLast <= STILL,
    `${file} does not hold the alert still for its last ${HELD_SECONDS} s: ${JSON.stringify(result)}`);
  return result;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
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
