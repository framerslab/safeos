import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { barredWording } from './home-wording.cjs';

export const limits = {
  square: { video: 400_000, poster: 60_000, first: 460_000, all: 2_300_000 },
  wide: { video: 1_200_000, poster: 120_000, first: 1_300_000, all: 6_600_000 },
};

const FPS = 15;
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function ffmpeg(args, options) {
  return execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...args], options);
}

export async function testPosterEncoders(directory) {
  for (const [encoder, extra] of [
    ['libaom-av1', ['-still-picture', '1', '-crf', '28', '-cpu-used', '5']],
    ['libsvtav1', ['-crf', '28', '-preset', '6']],
  ]) {
    try {
      ffmpeg(['-f', 'lavfi', '-i', 'color=s=64x64', '-frames:v', '1',
        '-c:v', encoder, ...extra, path.join(directory, 'probe.avif')], { stdio: 'pipe' });
      return ['-c:v', encoder, ...extra];
    } catch {
      // An encoder listed in the build may still fail with the AVIF muxer.
    }
  }
  return null;
}

export function wideView(id) {
  if (id === 'dashboard') return { width: 640, height: 640, scale: 3 };
  if (id === 'watching' || id === 'lost-found') return { width: 768, height: 548, scale: 2.5 };
  return { width: 768, height: 480, scale: 2.5 };
}

export async function spool(cdp, directory, view) {
  const frames = [];
  const pending = new Set();
  const frameListeners = new Set();
  const width = Math.round(view.width * view.scale);
  const height = Math.round(view.height * view.scale);
  let failure;
  let earliest = Number.POSITIVE_INFINITY;
  // The newest DevTools frame bounds transport reordering; a held-page
  // screenshot only takes its place in the output after it.
  let latestFrame = Number.NEGATIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;
  let accepting = true;
  let settleFirst;
  const firstFrame = new Promise((resolve) => { settleFirst = resolve; });

  const receive = ({ data, metadata, sessionId }) => {
    const ack = cdp.send('Page.screencastFrameAck', { sessionId });
    pending.add(ack);
    void ack.catch((error) => { if (accepting) failure ??= error; }).finally(() => pending.delete(ack));
    if (!accepting || failure) return;

    const bytes = Buffer.from(data, 'base64');
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG)) {
      failure = Error('DevTools sent a frame without a PNG header');
      settleFirst();
      return;
    }
    const w = bytes.readUInt32BE(16);
    const h = bytes.readUInt32BE(20);
    if (w !== width || h !== height) {
      failure = Error(`DevTools delivered ${w}×${h} pixels, expected native ${width}×${height}`);
      settleFirst();
      return;
    }
    const at = metadata.timestamp;
    // PNG encodes can finish in a different order than Chromium sampled
    // them. Preserve their times and bound the allowed transport reordering.
    if (!Number.isFinite(at) || latestFrame - at > 0.15) {
      failure = Error(`Out-of-order DevTools timestamp: ${at} after ${latestFrame}`);
      settleFirst();
      return;
    }
    earliest = Math.min(earliest, at);
    latestFrame = Math.max(latestFrame, at);
    latest = Math.max(latest, at);
    if (at - earliest > view.seconds + 4) {
      failure = Error(`Screencast passed its ${view.seconds + 4} second spool window`);
      return;
    }
    if (!frames.length) console.log(`DevTools preroll: ${w}×${h} native pixels`);
    const filename = `frame-${String(frames.length).padStart(4, '0')}.png`;
    frames.push({ filename, at });
    for (const listen of frameListeners) listen(at);
    settleFirst();
    const write = writeFile(path.join(directory, filename), bytes);
    pending.add(write);
    void write.catch((error) => { failure ??= error; }).finally(() => pending.delete(write));
  };

  cdp.on('Page.screencastFrame', receive);
  const initialTimeout = setTimeout(settleFirst, 3000);
  try {
    await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: width, maxHeight: height });
    await firstFrame;
    if (failure) throw failure;
    assert.ok(frames.length, 'DevTools did not deliver a preroll frame');
  } catch (error) {
    cdp.off('Page.screencastFrame', receive);
    await cdp.detach();
    throw error;
  } finally {
    clearTimeout(initialTimeout);
  }
  return {
    async nextFrameAfter(after) {
      const held = frames.find(({ at }) => at >= after);
      if (held) return held.at;
      return new Promise((resolve) => {
        const finish = (at) => {
          clearTimeout(timer);
          frameListeners.delete(listen);
          resolve(at);
        };
        const listen = (at) => { if (at >= after) finish(at); };
        const timer = setTimeout(finish, 200);
        frameListeners.add(listen);
      });
    },
    // A page that stops changing sends no screencast frame, so its last change
    // can go unrecorded. Read that state with a DevTools screenshot of the same
    // native size and keep it as the frame at that moment.
    async capture(at) {
      assert.ok(accepting && !failure, 'The screencast stopped before the held page was read');
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const bytes = Buffer.from(data, 'base64');
      assert.ok(bytes.length >= 24 && bytes.subarray(0, 8).equals(PNG), 'DevTools sent a screenshot without a PNG header');
      const w = bytes.readUInt32BE(16);
      const h = bytes.readUInt32BE(20);
      assert.ok(w === width && h === height, `DevTools screenshot is ${w}×${h} pixels, expected native ${width}×${height}`);
      const stamp = Math.max(at, latest + 0.001);
      latest = stamp;
      const filename = `frame-${String(frames.length).padStart(4, '0')}.png`;
      frames.push({ filename, at: stamp });
      const write = writeFile(path.join(directory, filename), bytes);
      pending.add(write);
      void write.catch((error) => { failure ??= error; }).finally(() => pending.delete(write));
      console.log(`Held page read by screenshot at ${stamp.toFixed(3)}`);
      return stamp;
    },
    async stop() {
      accepting = false;
      try {
        await cdp.send('Page.stopScreencast');
        await Promise.allSettled(pending);
      } finally {
        cdp.off('Page.screencastFrame', receive);
        await cdp.detach();
      }
      if (failure) throw failure;
      assert.ok(frames.length, 'DevTools sent no frames');
      frames.sort((a, b) => a.at - b.at);
      assert.ok(frames.every((frame, index) => index === 0 || frame.at > frames[index - 1].at),
        'DevTools sent two frames with the same timestamp');
      return frames;
    },
  };
}

export async function readRecordingWords(page, crop, { poster = false, whole = poster, controls = false, moment = 'The poster' } = {}) {
  const { words, clipped, cut } = await page.evaluate((crop) => {
    const bounds = { x: crop.x, y: crop.y, right: crop.x + crop.width, bottom: crop.y + crop.height };
    const words = [];
    const clipped = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    const measure = document.createElement('canvas').getContext('2d');
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || parent.closest('script, style, [hidden], template, noscript, .sr-only')) continue;
      const style = getComputedStyle(parent);
      if (style.visibility !== 'visible' || style.opacity === '0') continue;
      const size = parseFloat(style.fontSize);
      measure.font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
      for (const word of node.textContent.matchAll(/\S+/g)) {
        range.setStart(node, word.index);
        range.setEnd(node, word.index + word[0].length);
        const rects = range.getClientRects();
        const ink = measure.measureText(word[0]);
        for (const rect of rects) {
          if (!rect.width || !rect.height) continue;
          if (rect.left >= bounds.right || rect.right <= bounds.x || rect.top >= bounds.bottom || rect.bottom <= bounds.y) continue;
          const hit = document.elementFromPoint(
            Math.min(bounds.right - 0.1, Math.max(bounds.x + 0.1, rect.left + rect.width / 2)),
            Math.min(bounds.bottom - 0.1, Math.max(bounds.y + 0.1, rect.top + rect.height / 2)),
          );
          if (!hit || (!parent.contains(hit) && !hit.contains(parent))) continue;
          const box = { x: rect.left - crop.x, y: rect.top - crop.y, width: rect.width, height: rect.height };
          const report = {
            word: word[0], size, ...box,
            ...(rects.length === 1 ? { inkHeight: ink.actualBoundingBoxAscent + ink.actualBoundingBoxDescent } : {}),
          };
          if (rect.left < bounds.x - 0.5 || rect.top < bounds.y - 0.5
            || rect.right > bounds.right + 0.5 || rect.bottom > bounds.bottom + 0.5) clipped.push(report);
          else words.push(report);
        }
      }
    }
    const cut = [];
    for (const control of document.querySelectorAll('button, a[href], input, select, textarea, [role="switch"], [role="button"]')) {
      if (getComputedStyle(control).visibility !== 'visible') continue;
      const rect = control.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.right <= bounds.x || rect.left >= bounds.right) continue;
      if (rect.bottom <= bounds.y || rect.top >= bounds.bottom) continue;
      if (rect.top >= bounds.y - 0.5 && rect.bottom <= bounds.bottom + 0.5) continue;
      const y = rect.top < bounds.y - 0.5 ? (bounds.y + Math.min(bounds.bottom, rect.bottom)) / 2 : (Math.max(bounds.y, rect.top) + bounds.bottom) / 2;
      const hit = document.elementFromPoint(Math.min(bounds.right - 0.1, Math.max(bounds.x + 0.1, rect.left + rect.width / 2)), y);
      if (!hit || (!control.contains(hit) && !hit.contains(control))) continue;
      cut.push({ control: control.getAttribute('aria-label') || control.textContent.trim() || control.tagName,
        x: rect.left - crop.x, y: rect.top - crop.y, width: rect.width, height: rect.height });
    }
    return { words, clipped, cut };
  }, crop);
  for (const { word } of [...words, ...clipped]) {
    assert.doesNotMatch(word, barredWording, `Recording shows barred wording “${word}”`);
  }
  if (poster) assert.ok(words.length, 'The poster has no readable words');
  if (whole) {
    assert.ok(!clipped.length, `${moment} cuts off “${clipped[0]?.word}” at the crop's edge: ${JSON.stringify(clipped)}`);
    if (controls) assert.ok(!cut.length, `${moment} cuts the control “${cut[0]?.control}” at the crop's edge: ${JSON.stringify(cut)}`);
  }
  return words;
}

export async function captureNotifications(context) {
  await context.addInitScript(() => {
    window.homeRunNotifications = [];
    const notice = (path, title, options) => window.homeRunNotifications.push({
      path, title: String(title), body: String(options?.body ?? ''),
    });
    if (typeof ServiceWorkerRegistration !== 'undefined') {
      const show = ServiceWorkerRegistration.prototype.showNotification;
      ServiceWorkerRegistration.prototype.showNotification = function (title, options) {
        notice('service-worker', title, options);
        return show.call(this, title, options);
      };
    }
    if (typeof Notification !== 'undefined') {
      window.Notification = new Proxy(Notification, {
        construct(Native, [title, options]) {
          notice('window', title, options);
          return new Native(title, options);
        },
      });
    }
  });
}

export function checkNotifications(notices = []) {
  for (const { title, body, path } of notices) {
    assert.doesNotMatch(`${title} ${body}`, barredWording, `${path} notification has barred wording`);
  }
}

// Use the browser's elapsed time from the first recorded frame.
export function outputTime(at, { start }) {
  return at - start;
}

async function concatWindow(frames, cut, seconds, directory) {
  const last = cut.end ?? cut.start + seconds;
  assert.ok(Math.abs(outputTime(last, cut) - seconds) < 0.001, 'The chosen recording window has the wrong duration');
  assert.ok(cut.poster >= cut.start && cut.poster < last, 'The observed poster falls outside the recording');
  assert.ok(cut.event >= cut.start && cut.event <= last, 'The observed event falls outside the recording');
  const first = frames.findLastIndex((frame) => frame.at <= cut.start);
  assert.ok(first >= 0, 'The screencast did not start before the first event');
  const segment = frames.slice(first).filter(({ at }) => at < last);
  assert.ok(segment.length > 1, 'The screencast did not record a changing page');
  const posterFrame = cut.posterFrame === undefined
    ? segment.findLast(({ at }) => at <= cut.poster)
    : segment.find(({ at }) => at === cut.posterFrame);
  assert.ok(posterFrame, 'The observed poster was not among the recorded frames');
  const list = ['ffconcat version 1.0'];
  for (let i = 0; i < segment.length; i += 1) {
    const next = segment[i + 1]?.at ?? last;
    const at = i === 0 ? cut.start : segment[i].at;
    const duration = outputTime(next, cut) - outputTime(at, cut);
    assert.ok(duration > 0, 'An ffconcat frame has no duration');
    list.push(`file '${segment[i].filename}'`, 'option framerate 1000', `duration ${duration.toFixed(6)}`);
  }
  list.push(`file '${segment.at(-1).filename}'`, 'option framerate 1000');
  const concat = path.join(directory, 'frames.ffconcat');
  await writeFile(concat, list.join('\n') + '\n');
  return { concat, poster: path.join(directory, posterFrame.filename) };
}

const probe = (file) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries',
  'stream=codec_type,codec_name,width,height,avg_frame_rate:format=duration,size', '-of', 'json', file], { encoding: 'utf8' }));

function checkFastStart(bytes) {
  for (let offset = 0; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'moov') return;
    if (type === 'mdat' || size < 8) break;
    offset += size;
  }
  throw Error('MP4 is missing a front-loaded moov atom');
}

const srgb = Array.from({ length: 256 }, (_, n) => {
  const code = n / 255;
  return code <= 0.04045 ? code / 12.92 : ((code + 0.055) / 1.055) ** 2.4;
});

// Use the WCAG 2.2 visual field and concurrent affected area. A line of
// text moving through a frame can change isolated pixels without a flash.
function affectedField(mask, stride, width, height, area) {
  const integral = new Uint32Array((stride + 1) ** 2);
  for (let y = 0; y < stride; y++) {
    let row = 0;
    for (let x = 0; x < stride; x++) {
      row += mask[y * stride + x];
      integral[(y + 1) * (stride + 1) + x + 1] = integral[y * (stride + 1) + x + 1] + row;
    }
  }
  for (let y = height; y <= stride; y++) {
    for (let x = width; x <= stride; x++) {
      const sum = integral[y * (stride + 1) + x]
        - integral[(y - height) * (stride + 1) + x]
        - integral[y * (stride + 1) + x - width]
        + integral[(y - height) * (stride + 1) + x - width];
      if (sum > area) return true;
    }
  }
  return false;
}

function chromaticity(r, g, b) {
  const x = 0.4124 * r + 0.3576 * g + 0.1805 * b;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
  const sum = x + 15 * y + 3 * z || 1;
  return [4 * x / sum, 9 * y / sum];
}

const FLASH_EDGE = 96;

// Checks decoded video at its highest displayed size. The 341×256 CSS px
// field estimates 10 degrees at a typical viewing distance.
function checkFlashes(file, size) {
  const edge = FLASH_EDGE;
  checkFlashFrames(ffmpeg(['-i', file, '-vf', `scale=${edge}:${edge}:flags=area,format=rgb24`,
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 24 * 1024 * 1024 }), size);
}

// Reads 96 by 96 RGB frames at 15 frames a second, one after another.
export function checkFlashFrames(frames, size) {
  const edge = FLASH_EDGE;
  const pixels = edge * edge;
  const stride = pixels * 3;
  const [displayWidth, displayHeight] = size === 'square' ? [560, 560] : [820, 512.5];
  const fieldWidth = Math.ceil(341 / displayWidth * edge);
  const fieldHeight = Math.ceil(256 / displayHeight * edge);
  const fieldArea = (341 / displayWidth * edge) * (256 / displayHeight * edge) / 4;
  const previous = [new Int8Array(pixels), new Int8Array(pixels)];
  const previousAt = [new Int32Array(pixels), new Int32Array(pixels)];
  const paired = [[], []];
  const red = (r, g, b) => r / (r + g + b || 1);
  const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // WCAG measures a luminance flash between a peak and a valley, so each pixel
  // follows its current rise or fall from the extreme where it turned. A rise
  // in two small steps is one transition.
  const turnedAt = new Float64Array(pixels);
  const reached = new Float64Array(pixels);
  const heading = new Int8Array(pixels);
  const transitioned = new Uint8Array(pixels);
  for (let px = 0; px < pixels && stride <= frames.length; px++) {
    const level = luminance(srgb[frames[px * 3]], srgb[frames[px * 3 + 1]], srgb[frames[px * 3 + 2]]);
    turnedAt[px] = level;
    reached[px] = level;
  }
  for (let frame = 1; (frame + 1) * stride <= frames.length; frame++) {
    const masks = [new Uint8Array(pixels), new Uint8Array(pixels)];
    const areas = [0, 0];
    for (let px = 0; px < pixels; px++) {
      const a = (frame - 1) * stride + px * 3;
      const b = a + stride;
      const [r0, g0, b0] = [srgb[frames[a]], srgb[frames[a + 1]], srgb[frames[a + 2]]];
      const [r1, g1, b1] = [srgb[frames[b]], srgb[frames[b + 1]], srgb[frames[b + 2]]];
      const l1 = luminance(r1, g1, b1);
      const step = Math.sign(l1 - reached[px]);
      if (step && step !== heading[px]) {
        if (heading[px]) turnedAt[px] = reached[px];
        heading[px] = step;
        transitioned[px] = 0;
      }
      if (step) reached[px] = l1;
      const swing = reached[px] - turnedAt[px];
      const luminanceDirection = !transitioned[px] && Math.abs(swing) >= 0.1
        && Math.min(reached[px], turnedAt[px]) < 0.8 ? Math.sign(swing) : 0;
      if (luminanceDirection) transitioned[px] = 1;
      const red0 = red(r0, g0, b0);
      const red1 = red(r1, g1, b1);
      let redDirection = 0;
      if (red0 >= 0.8 || red1 >= 0.8) {
        const [u0, v0] = chromaticity(r0, g0, b0);
        const [u1, v1] = chromaticity(r1, g1, b1);
        if (Math.hypot(u1 - u0, v1 - v0) > 0.2) redDirection = Math.sign(red1 - red0 || u1 - u0);
      }
      const directions = [luminanceDirection, redDirection];
      for (let kind = 0; kind < directions.length; kind++) {
        if (!directions[kind]) continue;
        const closes = previous[kind][px] === -directions[kind] && frame - previousAt[kind][px] < FPS;
        if (closes) {
          areas[kind] += 1;
          masks[kind][px] = 1;
        }
        previous[kind][px] = closes ? 0 : directions[kind];
        previousAt[kind][px] = frame;
      }
    }
    for (let kind = 0; kind < paired.length; kind++) {
      if (areas[kind] <= fieldArea || !affectedField(masks[kind], edge, fieldWidth, fieldHeight, fieldArea)) continue;
      const events = paired[kind];
      while (events.length && frame - events[0] >= FPS) events.shift();
      events.push(frame);
      assert.ok(events.length <= 3,
        `More than three ${kind ? 'red' : 'luminance'} flashes from ${events[0] / FPS} to ${frame / FPS} s`);
    }
  }
}

async function fileRecord(file, details, cap) {
  const bytes = await readFile(file);
  assert.ok(bytes.length > 0 && bytes.length <= cap, `${path.basename(file)} is ${bytes.length} bytes, limit ${cap}`);
  return {
    path: `home/runs/${path.basename(file)}`,
    ...details,
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
}

export async function encodeVariant({ frames, cut, view, crop, directory, outDir, id, avif }) {
  const { concat, poster } = await concatWindow(frames, cut, view.seconds, directory);
  const width = Math.round(crop.width * view.scale);
  const height = Math.round(crop.height * view.scale);
  const y = Math.round(crop.y * view.scale);
  assert.ok(width % 2 === 0 && height % 2 === 0, `H.264 at yuv420p requires even encoded dimensions, received ${width}×${height}`);
  const filters = [`crop=${width}:${height}:0:${y}`];
  const prefix = path.join(outDir, `${id}-${view.size}-${view.look}`);
  const movie = prefix + '.mp4';
  const budget = limits[view.size];
  // The square file has the tighter transfer cap.
  for (const crf of [26, view.size === 'square' ? 32 : 30]) {
    ffmpeg(['-f', 'concat', '-safe', '0', '-i', concat,
      '-vf', [...filters, `fps=${FPS}`, 'format=yuv420p'].join(','),
      '-t', String(view.seconds), '-an', '-c:v', 'libx264', '-profile:v', 'high', '-crf', String(crf),
      '-preset', 'slow', '-g', '30', '-pix_fmt', 'yuv420p', '-map_metadata', '-1', '-movflags', '+faststart', movie]);
    if (Number(probe(movie).format.size) <= budget.video) break;
  }
  const { streams, format } = probe(movie);
  assert.equal(streams.length, 1, 'Expected a single stream, with no audio');
  const [video] = streams;
  assert.deepEqual([video.codec_type, video.codec_name, video.width, video.height, video.avg_frame_rate],
    ['video', 'h264', width, height, '15/1'], 'MP4 stream differs from the recording contract');
  assert.ok(Math.abs(Number(format.duration) - view.seconds) <= 1 / FPS, `Unexpected MP4 duration ${format.duration}`);
  checkFastStart(await readFile(movie));
  checkFlashes(movie, view.size);

  const stills = [
    ['webp', ['-c:v', 'libwebp', '-quality', '86', '-compression_level', '6']],
    ...(avif ? [['avif', avif]] : []),
  ];
  const posters = {};
  for (const [extension, encoder] of stills) {
    const file = prefix + '.' + extension;
    ffmpeg(['-i', poster, ...(filters.length ? ['-vf', filters.join(',')] : []),
      '-frames:v', '1', '-map_metadata', '-1', ...encoder, file]);
    const [picture] = probe(file).streams;
    assert.deepEqual([picture.width, picture.height], [width, height], `${extension} poster differs from the crop`);
    posters[extension] = await fileRecord(file, { kind: 'poster', format: extension, width, height }, budget.poster);
  }
  const movieRecord = await fileRecord(movie, {
    kind: 'video', format: 'mp4', codec: 'h264', width, height, seconds: view.seconds,
  }, budget.video);
  assert.ok(movieRecord.bytes + Math.max(...Object.values(posters).map(({ bytes }) => bytes)) <= budget.first,
    `${id} ${view.size}-${view.look} exceeds its combined first download budget`);
  return { video: movieRecord, poster: posters };
}
