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
    ['libaom-av1', ['-still-picture', '1', '-crf', '20', '-cpu-used', '5']],
    ['libsvtav1', ['-crf', '20', '-preset', '6']],
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

export async function emulatedSurface(page, view) {
  const cdp = await page.context().newCDPSession(page);
  // Without a compositor viewport override, deviceScaleFactor affects the
  // page but Chromium still sends the CSS-size surface to the screencast.
  // The viewport keeps its CSS size and makes the compositor rasterize it
  // at the device scale. The frame header is still checked below.
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: view.width,
    height: view.height,
    screenWidth: view.width,
    screenHeight: view.height,
    deviceScaleFactor: view.scale,
    mobile: view.size === 'square',
    viewport: { x: 0, y: 0, width: view.width, height: view.height, scale: 1 },
  });
  return cdp;
}

export async function spool(cdp, directory, view) {
  const frames = [];
  const pending = new Set();
  const width = Math.round(view.width * view.scale);
  const height = Math.round(view.height * view.scale);
  let failure;
  let earliest = Number.POSITIVE_INFINITY;
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
    if (!Number.isFinite(at) || latest - at > 0.15) {
      failure = Error(`Out-of-order DevTools timestamp: ${at} after ${latest}`);
      settleFirst();
      return;
    }
    earliest = Math.min(earliest, at);
    latest = Math.max(latest, at);
    if (at - earliest > view.seconds + 4) {
      failure = Error(`Screencast passed its ${view.seconds + 4} second spool window`);
      return;
    }
    if (!frames.length) console.log(`DevTools preroll: ${w}×${h} native pixels`);
    const filename = `frame-${String(frames.length).padStart(4, '0')}.png`;
    frames.push({ filename, at, scrollY: metadata.scrollOffsetY });
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

export async function readRecordingWords(page, crop, { poster = false } = {}) {
  const { words, clipped } = await page.evaluate((crop) => {
    const bounds = { x: crop.x, y: crop.y, right: crop.x + crop.width, bottom: crop.y + crop.height };
    const words = [];
    const clipped = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || parent.closest('script, style, [hidden], template, noscript, .sr-only')) continue;
      const style = getComputedStyle(parent);
      if (style.visibility !== 'visible' || style.opacity === '0') continue;
      const size = parseFloat(style.fontSize);
      for (const word of node.textContent.matchAll(/\S+/g)) {
        range.setStart(node, word.index);
        range.setEnd(node, word.index + word[0].length);
        for (const rect of range.getClientRects()) {
          if (!rect.width || !rect.height) continue;
          if (rect.left >= bounds.right || rect.right <= bounds.x || rect.top >= bounds.bottom || rect.bottom <= bounds.y) continue;
          const hit = document.elementFromPoint(
            Math.min(bounds.right - 0.1, Math.max(bounds.x + 0.1, rect.left + rect.width / 2)),
            Math.min(bounds.bottom - 0.1, Math.max(bounds.y + 0.1, rect.top + rect.height / 2)),
          );
          if (!hit || (!parent.contains(hit) && !hit.contains(parent))) continue;
          const box = { x: rect.left - crop.x, y: rect.top - crop.y, width: rect.width, height: rect.height };
          const report = { word: word[0], size, ...box };
          if (rect.left < bounds.x - 0.5 || rect.top < bounds.y - 0.5
            || rect.right > bounds.right + 0.5 || rect.bottom > bounds.bottom + 0.5) clipped.push(report);
          else words.push(report);
        }
      }
    }
    return { words, clipped };
  }, crop);
  for (const { word } of [...words, ...clipped]) {
    assert.doesNotMatch(word, barredWording, `Recording shows barred wording “${word}”`);
  }
  if (poster) {
    assert.ok(words.length, 'The poster has no readable words');
    assert.ok(!clipped.length, `The poster cuts off “${clipped[0]?.word}” at ${JSON.stringify(clipped[0])}`);
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

async function concatWindow(frames, cut, seconds, directory) {
  const last = cut.start + seconds;
  assert.ok(cut.poster >= cut.start && cut.poster < last, 'The observed poster falls outside the recording');
  assert.ok(cut.event >= cut.start && cut.event <= last, 'The observed event falls outside the recording');
  const first = frames.findLastIndex((frame) => frame.at <= cut.start);
  assert.ok(first >= 0, 'The screencast did not start before the first event');
  const segment = frames.slice(first).filter(({ at }) => at < last);
  assert.ok(segment.length > 1, 'The screencast did not record a changing page');
  if (cut.scroll) {
    assert.ok(new Set(segment.map(({ scrollY }) => scrollY)).size > 1,
      'The screencast did not record the scroll to the new alerts');
    const firstFrame = await readFile(path.join(directory, segment[0].filename));
    const lastFrame = await readFile(path.join(directory, segment.at(-1).filename));
    assert.ok(!firstFrame.equals(lastFrame), 'The screenshot pixels did not move with the Dashboard scroll');
  }
  const posterFrame = segment.findLast(({ at }) => at <= cut.poster);
  const list = ['ffconcat version 1.0'];
  for (let i = 0; i < segment.length; i += 1) {
    const next = segment[i + 1]?.at ?? last;
    const at = i === 0 ? cut.start : segment[i].at;
    const duration = next - at;
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

// Count paired, opposing luminance and saturated-red transitions in each
// rolling second. The reduced raster still measures fifteen separate frames
// per second and keeps area, so single noisy pixels do not count as flashes.
function checkFlashes(file) {
  const edge = 96;
  const pixels = edge * edge;
  const stride = pixels * 3;
  const frames = ffmpeg(['-i', file, '-vf', `scale=${edge}:${edge}:flags=area,format=rgb24`,
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 24 * 1024 * 1024 });
  const steps = [new Int8Array(pixels), new Int8Array(pixels)];
  const paired = [[], []];
  const red = (r, g, b) => r / (r + g + b || 1) >= 0.8;
  const luminance = (r, g, b) => 0.2126 * srgb[r] + 0.7152 * srgb[g] + 0.0722 * srgb[b];
  for (let frame = 1; (frame + 1) * stride <= frames.length; frame++) {
    const areas = [0, 0];
    for (let px = 0; px < pixels; px++) {
      const a = (frame - 1) * stride + px * 3;
      const b = a + stride;
      const l0 = luminance(frames[a], frames[a + 1], frames[a + 2]);
      const l1 = luminance(frames[b], frames[b + 1], frames[b + 2]);
      const l = l1 - l0;
      const r0 = Math.max(0, frames[a] - frames[a + 1] - frames[a + 2]);
      const r1 = Math.max(0, frames[b] - frames[b + 1] - frames[b + 2]);
      const r = r1 - r0;
      const direction = [
        Math.abs(l) >= 0.1 && Math.min(l0, l1) < 0.8 ? Math.sign(l) : 0,
        Math.abs(r) > 20 && (red(frames[a], frames[a + 1], frames[a + 2])
          || red(frames[b], frames[b + 1], frames[b + 2])) ? Math.sign(r) : 0,
      ];
      for (let kind = 0; kind < steps.length; kind++) {
        if (direction[kind] === 0) continue;
        const closes = steps[kind][px] === -direction[kind];
        if (closes) areas[kind] += 1;
        steps[kind][px] = closes ? 0 : direction[kind];
      }
    }
    for (let kind = 0; kind < paired.length; kind++) {
      if (areas[kind] < pixels / 16) continue;
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
  const filters = view.size === 'square' ? [`crop=${width}:${height}:0:${y}`] : [];
  const prefix = path.join(outDir, `${id}-${view.size}-${view.look}`);
  const movie = prefix + '.mp4';
  const budget = limits[view.size];
  for (const crf of [26, 30]) {
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
  checkFlashes(movie);

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
