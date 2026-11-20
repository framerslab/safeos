// Measures the watch, the detection model and Lost & Found matching in
// Chromium at two device classes with the CPU slowed, and writes what it read
// as JSON and as a Markdown table.
//
//   node scripts/measure-devices.mjs <base-url> <out-dir> <clip.y4m> <clip.wav> <subject.png>
//
// The Measure workflow (.github/workflows/measure.yml) runs it against the
// static export. docs/PERFORMANCE.md says what is measured and how.
//
// Chromium's fake camera and microphone are fed from the committed sample
// clip (public/home/sample-clip.mp4, converted to .y4m and .wav inside the
// job), as the Pictures workflow feeds them, so the unchanged pages read the
// clip through their real camera path. <subject.png> is one frame of the same
// clip, the reference photo Lost & Found is given.
//
// Each class and slow-down gets three fresh browser contexts:
//
//   watch       /monitor/ with motion and sound on and pixel detection off,
//               watched for 60 s from its first camera read. The page's
//               own timers are timed from inside the page: a tick of an
//               interval timer that reads the camera's pixels
//               (getImageData) is one analysed frame, and a tick that reads
//               the microphone's analyser is one sound reading. The first
//               read only keeps its frame for the next tick to compare with,
//               so it is not counted.
//   model       a page that loads the TensorFlow.js and COCO-SSD builds the
//               app installs and the model file the app downloads (base
//               lite_mobilenet_v2, WebGL) through the app's own route and
//               Cache Storage reads and writes, then runs detect on a 320 by
//               240 copy of the camera's frame, as Security's person
//               detector does, back to back.
//   lost-found  a pet enrolled through Lost & Found's own form from one
//               frame of the clip, the watch opened with Lost and Found by
//               that page's Start Monitoring, then its matching ticks for 30 s.
//
// It records and does not judge: a slow number is written down, and a part
// that could not be measured is written down with the reason. It exits
// non-zero only when it could not write its results.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';

const [baseUrl, outDir, videoFile, audioFile, subjectFile] = process.argv.slice(2);
if (!baseUrl || !outDir || !videoFile || !audioFile || !subjectFile) {
  console.error('usage: measure-devices.mjs <base-url> <out-dir> <clip.y4m> <clip.wav> <subject.png>');
  process.exit(2);
}

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(APP_ROOT, 'package.json'));

// The preset the home page pictures are taken with: the default preset with
// pixel detection off, so motion and sound raise the alerts.
const SETTINGS = JSON.parse(await readFile(path.join(APP_ROOT, 'scripts', 'home-capture-settings.json'), 'utf8'));

// The model's address and its stated size, read from the file the loader and
// the pages read them from.
const FACTS = await readFile(path.join(APP_ROOT, 'src', 'lib', 'detection-model-facts.ts'), 'utf8');
const MODEL_URL = /MODEL_URL = '([^']+)'/.exec(FACTS)?.[1];
const statedBytes = (name) => Number((new RegExp(`${name} = ([\\d_]+);`).exec(FACTS)?.[1] ?? 'NaN').replace(/_/g, ''));
const MODEL_STATED_BYTES = statedBytes('MODEL_MANIFEST_BYTES') + statedBytes('MODEL_WEIGHTS_BYTES');
if (!MODEL_URL) throw new Error('src/lib/detection-model-facts.ts names no MODEL_URL');
const MODEL_HOST = new URL(MODEL_URL).host;

// The load route and the Cache Storage name the app's loader uses, read from
// the loader, so the measured load takes the same path.
const LOADER = await readFile(path.join(APP_ROOT, 'src', 'lib', 'detection-model.ts'), 'utf8');
const MODEL_ROUTE = /MODEL_ROUTE = '([^']+)'/.exec(LOADER)?.[1];
const MODEL_CACHE = /MODEL_CACHE = '([^']+)'/.exec(LOADER)?.[1];
if (!MODEL_ROUTE || !MODEL_CACHE) throw new Error('src/lib/detection-model.ts names no MODEL_ROUTE or MODEL_CACHE');

// The library builds the app installs (package-lock.json pins their versions).
const TFJS = require.resolve('@tensorflow/tfjs/dist/tf.min.js');
const COCO = require.resolve('@tensorflow-models/coco-ssd/dist/coco-ssd.min.js');
const TFJS_VERSION = require('@tensorflow/tfjs/package.json').version;
const COCO_VERSION = require('@tensorflow-models/coco-ssd/package.json').version;

const CLASSES = [
  {
    id: 'phone',
    name: 'Phone class',
    context: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    rates: [4, 6],
  },
  {
    id: 'laptop',
    name: 'Laptop class',
    context: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
    rates: [1, 2],
  },
];

const WATCH_MS = 60_000;
const LOST_FOUND_MS = 30_000;
const INFERENCES = 40;
const INFERENCE_LIMIT_MS = 120_000;
// The whole model part: loading, the camera and the inferences.
const MODEL_LIMIT_MS = 300_000;
const CALIBRATION_STEPS = 20_000_000;

// =============================================================================
// Numbers
// =============================================================================

/** A number with its unit, rounded for reading; null when nothing was read. */
const q = (value, unit, places = 2) =>
  typeof value === 'number' && Number.isFinite(value)
    ? { value: Math.round(value * 10 ** places) / 10 ** places, unit }
    : null;

/** The nearest-rank percentile of a list of numbers. */
function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

const spread = (values, unit) => ({
  samples: q(values.length, 'samples', 0),
  median: q(percentile(values, 50), unit),
  p95: q(percentile(values, 95), unit),
});

const MB = (bytes) => bytes / 1_000_000;

// =============================================================================
// The browser
// =============================================================================

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A person who has finished setup, with the preset saved and the two unasked cards put away. */
function seed(settings) {
  localStorage.setItem('safeos-onboarding', JSON.stringify({ state: {
    isComplete: true, selectedScenario: 'pet',
    acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
  }, version: 0 }));
  localStorage.setItem('guardian-onboarding-complete', 'true');
  localStorage.setItem('safeos-settings', JSON.stringify({ state: settings, version: 0 }));
  localStorage.setItem('safeos-notification-prompt-dismissed', String(Date.now()));
  localStorage.setItem('safeos-pwa-prompt-dismissed', String(Date.now()));
}

/**
 * Runs in the page before its own scripts. Times every tick of every
 * interval timer, notes whether the tick read the camera's pixels or the
 * microphone's analyser, notes when "Start Monitoring" is pressed and when
 * the first alert card is drawn, and keeps the main thread's long tasks.
 */
function instrument() {
  const m = { ticks: [], startPressedAt: null, alerts: {}, longTasks: [] };
  window.__measure = m;
  let current = null;

  const nativeSetInterval = window.setInterval;
  window.setInterval = function (handler, delay, ...rest) {
    if (typeof handler !== 'function') return nativeSetInterval.call(window, handler, delay, ...rest);
    const ms = Number(delay) || 0;
    const timed = function (...args) {
      const tick = { delay: ms, at: performance.now(), ms: 0, settledMs: null, reads: 0, sound: 0 };
      const outer = current;
      current = tick;
      try {
        return handler.apply(this, args);
      } finally {
        tick.ms = performance.now() - tick.at;
        // A microtask queued now runs after those the tick queued (a store
        // update's screen update among them).
        queueMicrotask(() => { tick.settledMs = performance.now() - tick.at; });
        current = outer;
        if (tick.reads > 0 || tick.sound > 0) m.ticks.push(tick);
      }
    };
    return nativeSetInterval.call(window, timed, delay, ...rest);
  };

  const getImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function (...args) {
    if (current) current.reads += 1;
    return getImageData.apply(this, args);
  };
  for (const name of ['getByteFrequencyData', 'getByteTimeDomainData', 'getFloatFrequencyData', 'getFloatTimeDomainData']) {
    const read = AnalyserNode.prototype[name];
    AnalyserNode.prototype[name] = function (...args) {
      if (current) current.sound += 1;
      return read.apply(this, args);
    };
  }

  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (button && (button.textContent || '').includes('Start Monitoring')) m.startPressedAt = performance.now();
  }, true);

  // An alert card's message line starts with its kind; the screen-reader
  // summary starts "New ..." and does not match. The observer stops once it
  // has seen a motion card and a sound card, so it adds no work after that.
  const KINDS = [['motion', /^Motion detected: /], ['sound', /^Audio detected: /]];
  const observer = new MutationObserver((records) => {
    if (m.startPressedAt === null) return;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        const lines = node.matches('p') ? [node] : node.querySelectorAll('p');
        for (const line of lines) {
          const text = (line.textContent || '').trim();
          for (const [kind, pattern] of KINDS) {
            if (!m.alerts[kind] && pattern.test(text)) m.alerts[kind] = { at: performance.now(), text: text.slice(0, 120) };
          }
        }
      }
    }
    if (m.alerts.motion && m.alerts.sound) observer.disconnect();
  });
  observer.observe(document, { childList: true, subtree: true });

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) m.longTasks.push({ at: entry.startTime, ms: entry.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    m.longTasks = null;
  }
}

/** A fixed loop run on the page's main thread: how much slower the slowed page runs it. */
const calibrate = (page, steps) =>
  page.evaluate((n) => {
    const started = performance.now();
    let x = 0;
    for (let i = 0; i < n; i++) x = (x + i * 7) % 1_000_003;
    return { ms: performance.now() - started, x };
  }, steps);

async function slowedPage(context, rate) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  return { page, cdp };
}

const pageNow = (page) => page.evaluate(() => performance.now());

/** Lets the page run until its own clock reads `at`. */
async function runUntil(page, at) {
  for (;;) {
    const left = at - (await pageNow(page));
    if (left <= 0) return;
    await sleep(Math.min(left, 5_000));
  }
}

/**
 * Waits for the first recorded tick that read the camera's pixels, from a
 * timer whose interval is not `otherThan`, and returns it.
 */
async function firstFrameTick(page, otherThan, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const tick = await page.evaluate(
      (other) => window.__measure.ticks.find((t) => t.reads > 0 && t.delay !== other) ?? null,
      otherThan,
    );
    if (tick) return tick;
    await sleep(500);
  }
  throw new Error(`no timer read the camera's pixels within ${timeoutMs / 1000} s`);
}

async function startMonitoring(page) {
  await page.getByRole('button', { name: 'Start Monitoring', exact: true }).click({ timeout: 120_000 });
  await page.getByText('LIVE', { exact: true }).waitFor({ timeout: 120_000 }).catch(async (error) => {
    const shown = await page.locator('text=Camera Error').first().locator('xpath=..').textContent({ timeout: 2_000 }).catch(() => null);
    throw new Error(shown ? `the camera did not start: ${shown.replace(/\s+/g, ' ').trim()}` : error.message);
  });
}

const firstLine = (error) => String(error?.message ?? error).split('\n')[0].slice(0, 300);

/** Keeps a picture of a page whose part could not be measured, if it can. */
async function keepPicture(page, name) {
  const file = path.join(outDir, 'failures', `${name}.png`);
  await mkdir(path.dirname(file), { recursive: true }).catch(() => undefined);
  await page.screenshot({ path: file, timeout: 10_000 }).catch(() => undefined);
}

/**
 * Rejects when `promise` has not settled after `ms`. page.evaluate takes no
 * timeout, so a page that stops answering would otherwise hold the run.
 */
function withDeadline(promise, ms, what) {
  let timer;
  promise.catch(() => undefined);
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not finish within ${ms / 1000} s`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

// =============================================================================
// The watch
// =============================================================================

async function measureWatch(browser, cls, rate, name) {
  let context = null;
  let page = null;
  try {
    context = await browser.newContext({ ...cls.context, permissions: ['camera', 'microphone'] });
    await context.addInitScript(seed, SETTINGS);
    await context.addInitScript(instrument);
    const slowed = await slowedPage(context, rate);
    page = slowed.page;
    const { cdp } = slowed;
    await page.goto(new URL('/monitor/', baseUrl).toString(), { waitUntil: 'networkidle', timeout: 180_000 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    const calibration = await calibrate(page, CALIBRATION_STEPS);
    await startMonitoring(page);

    // In the watch only the motion loop reads the camera's pixels on a timer.
    const first = await firstFrameTick(page, null, 120_000);
    const end = first.at + WATCH_MS;
    await runUntil(page, end);

    const read = await page.evaluate(() => {
      const memory = performance.memory;
      const video = document.querySelector('video');
      return {
        ...window.__measure,
        heap: memory ? { used: memory.usedJSHeapSize, total: memory.totalJSHeapSize, limit: memory.jsHeapSizeLimit } : null,
        video: video ? { width: video.videoWidth, height: video.videoHeight } : null,
      };
    });
    // The same heap once a garbage collection has run: what the page holds on to.
    await cdp.send('HeapProfiler.collectGarbage').catch(() => undefined);
    const usedAfterGc = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
    const cdpHeap = await cdp.send('Runtime.getHeapUsage').catch(() => null);

    const inWindow = (t) => t.at >= first.at && t.at < end;
    // The first read has no earlier frame to compare with: it only keeps its
    // frame for the next tick, so the analysed frames are the reads after it.
    const frames = read.ticks.filter((t) => t.reads > 0 && t.delay === first.delay && t.at > first.at && t.at < end);
    const sound = read.ticks.filter((t) => t.reads === 0 && t.sound > 0 && inWindow(t));
    const longTasks = read.longTasks ? read.longTasks.filter((t) => t.at >= first.at && t.at < end) : null;
    const after = (alert) => (alert && read.startPressedAt !== null && alert.at <= end ? (alert.at - read.startPressedAt) / 1000 : null);
    const motionAfter = after(read.alerts.motion);
    const soundAfter = after(read.alerts.sound);
    const firstKind = motionAfter === null && soundAfter === null
      ? null
      : soundAfter === null || (motionAfter !== null && motionAfter <= soundAfter) ? 'motion' : 'sound';
    const noAlert = `no alert within the ${WATCH_MS / 1000} s`;

    console.log(`${name}: watch read ${frames.length} frames in ${WATCH_MS / 1000} s`);
    return {
      calibrationLoop: q(calibration.ms, 'ms', 1),
      camera: read.video ? { width: q(read.video.width, 'px', 0), height: q(read.video.height, 'px', 0) } : null,
      window: q(WATCH_MS / 1000, 's', 0),
      motionTimerInterval: q(first.delay, 'ms', 0),
      framesAnalysedPerSecond: q(frames.length / (WATCH_MS / 1000), 'frames/s'),
      frameAnalysisTime: spread(frames.map((t) => t.ms), 'ms'),
      frameAnalysisTimeWithQueuedMicrotasks: spread(frames.filter((t) => t.settledMs !== null).map((t) => t.settledMs), 'ms'),
      soundReadingsPerSecond: q(sound.length / (WATCH_MS / 1000), 'readings/s'),
      soundReadingTime: spread(sound.map((t) => t.ms), 'ms'),
      timeToFirstAlert: q(firstKind === 'motion' ? motionAfter : soundAfter, 's'),
      firstAlertKind: firstKind ?? noAlert,
      timeToFirstMotionAlert: q(motionAfter, 's'),
      firstMotionAlert: motionAfter === null ? noAlert : read.alerts.motion.text,
      timeToFirstSoundAlert: q(soundAfter, 's'),
      firstSoundAlert: soundAfter === null ? noAlert : read.alerts.sound.text,
      jsHeapUsedAfter60s: q(read.heap ? MB(read.heap.used) : null, 'MB'),
      jsHeapTotalAfter60s: q(read.heap ? MB(read.heap.total) : null, 'MB'),
      jsHeapUsedAfter60sAndGarbageCollection: q(usedAfterGc === null ? null : MB(usedAfterGc), 'MB'),
      jsHeapUsedAfter60sAndGarbageCollectionByDevTools: q(cdpHeap ? MB(cdpHeap.usedSize) : null, 'MB'),
      longTasks: longTasks
        ? { count: q(longTasks.length, 'tasks', 0), total: q(longTasks.reduce((sum, t) => sum + t.ms, 0), 'ms', 0) }
        : null,
    };
  } catch (error) {
    if (page) await keepPicture(page, `${name}-watch`);
    return { error: firstLine(error) };
  } finally {
    if (context) await context.close().catch(() => undefined);
  }
}

// =============================================================================
// The detection model
// =============================================================================

const MODEL_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Detection model measurement</title></head>
<body><video id="camera" muted playsinline autoplay></video><canvas id="frame" width="320" height="240"></canvas></body></html>`;

async function measureModel(browser, cls, rate, name) {
  let context = null;
  let page = null;
  try {
    context = await browser.newContext({ ...cls.context, permissions: ['camera'] });
    // The page and the two library files are handed to the browser from here;
    // the model file comes from its own host over the network.
    await context.route('**/__measure/**', async (route) => {
      const { pathname } = new URL(route.request().url());
      if (pathname.endsWith('/model.html')) return route.fulfill({ contentType: 'text/html', body: MODEL_PAGE });
      if (pathname.endsWith('/tf.min.js')) return route.fulfill({ contentType: 'text/javascript', path: TFJS });
      if (pathname.endsWith('/coco-ssd.min.js')) return route.fulfill({ contentType: 'text/javascript', path: COCO });
      return route.fulfill({ status: 404, body: '' });
    });
    const slowed = await slowedPage(context, rate);
    page = slowed.page;
    const { cdp } = slowed;
    // TensorFlow.js says on the console why a backend it was asked for did not start.
    const warnings = [];
    page.on('console', (message) => {
      if (['warning', 'error'].includes(message.type()) && warnings.length < 5) warnings.push(message.text().slice(0, 300));
    });

    // The network log: each response from the model's host, with the bytes
    // that crossed the wire (headers and body) and the body's decoded bytes.
    const requests = new Map();
    await cdp.send('Network.enable');
    cdp.on('Network.responseReceived', (event) => {
      if (new URL(event.response.url).host === MODEL_HOST) {
        requests.set(event.requestId, { url: event.response.url, status: event.response.status, wire: 0, body: 0 });
      }
    });
    cdp.on('Network.dataReceived', (event) => {
      const request = requests.get(event.requestId);
      if (request) request.body += event.dataLength;
    });
    cdp.on('Network.loadingFinished', (event) => {
      const request = requests.get(event.requestId);
      if (request) request.wire = event.encodedDataLength;
    });

    await page.goto(new URL('/__measure/model.html', baseUrl).toString(), { waitUntil: 'load', timeout: 60_000 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    const calibration = await calibrate(page, CALIBRATION_STEPS);

    const read = await withDeadline(page.evaluate(async ({ modelUrl, route, cacheName, inferences, limitMs }) => {
      const loadScript = (src) => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`${src} did not load`));
        document.head.appendChild(script);
      });

      const video = document.getElementById('camera');
      video.srcObject = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      await video.play();
      while (video.readyState < 2) await new Promise((resolve) => setTimeout(resolve, 50));

      // As lib/detection-model loads it: WebGL, then the lite_mobilenet_v2
      // model through a load route whose fetch looks in Cache Storage first
      // and waits for each downloaded file to be written there. The context
      // is fresh, so the cache is empty and every file is downloaded and
      // written. coco-ssd's load runs the model once on an empty picture
      // before it returns.
      let notStored = null;
      const cachedFetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        let cache = null;
        try {
          if (typeof caches === 'undefined') throw new Error('Cache Storage is unavailable.');
          cache = await caches.open(cacheName);
          const cached = await cache.match(url);
          if (cached) return cached;
        } catch (error) {
          cache = null;
          notStored = notStored ?? String(error?.message ?? error);
        }
        const response = await fetch(input, init);
        if (!response.ok) throw new Error(`Model download returned HTTP ${response.status}.`);
        if (cache) {
          try { await cache.put(url, response.clone()); } catch (error) { notStored = notStored ?? String(error?.message ?? error); }
        }
        return response;
      };

      const started = performance.now();
      await loadScript('/__measure/tf.min.js');
      await loadScript('/__measure/coco-ssd.min.js');
      const scriptsAt = performance.now();
      await window.tf.setBackend('webgl');
      await window.tf.ready();
      const backend = window.tf.getBackend();
      window.tf.io.registerLoadRouter((url) => (url === route
        ? window.tf.io.browserHTTPRequest(modelUrl, { fetchFunc: cachedFetch })
        : null));
      const model = await window.cocoSsd.load({ base: 'lite_mobilenet_v2', modelUrl: route });
      const loadedAt = performance.now();

      const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
      const info = gl && gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = gl ? String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : null;

      // As Security's person detector runs it: the frame drawn into a 320 by
      // 240 canvas, then detect with at most 10 boxes at a 0.5 score line.
      const canvas = document.getElementById('frame');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const times = [];
      const found = {};
      const until = performance.now() + limitMs;
      for (let i = 0; i < inferences + 1 && performance.now() < until; i++) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const at = performance.now();
        const predictions = await model.detect(canvas, 10, 0.5);
        times.push(performance.now() - at);
        for (const p of predictions) found[p.class] = (found[p.class] || 0) + 1;
      }
      return {
        scriptsMs: scriptsAt - started,
        modelMs: loadedAt - scriptsAt,
        backend,
        notStored,
        renderer,
        times,
        found,
        camera: { width: video.videoWidth, height: video.videoHeight },
      };
    }, { modelUrl: MODEL_URL, route: MODEL_ROUTE, cacheName: MODEL_CACHE, inferences: INFERENCES, limitMs: INFERENCE_LIMIT_MS }), MODEL_LIMIT_MS, 'the model measurement');

    const files = [...requests.values()];
    const wire = files.reduce((sum, r) => sum + r.wire, 0);
    const body = files.reduce((sum, r) => sum + r.body, 0);
    const [firstInference, ...rest] = read.times;
    console.log(`${name}: model ${read.backend}, ${files.length} files, ${body} bytes, ${read.times.length} inferences`);
    return {
      calibrationLoop: q(calibration.ms, 'ms', 1),
      libraries: `@tensorflow/tfjs ${TFJS_VERSION}, @tensorflow-models/coco-ssd ${COCO_VERSION}`,
      backend: read.backend,
      backendWarnings: warnings,
      renderer: read.renderer,
      camera: { width: q(read.camera.width, 'px', 0), height: q(read.camera.height, 'px', 0) },
      files: q(files.length, 'files', 0),
      downloadOnTheWire: q(wire, 'bytes', 0),
      downloadDecoded: q(body, 'bytes', 0),
      statedSize: q(MODEL_STATED_BYTES, 'bytes', 0),
      httpStatuses: [...new Set(files.map((r) => r.status))].join(', '),
      loadTime: q((read.scriptsMs + read.modelMs) / 1000, 's'),
      scriptLoadTime: q(read.scriptsMs / 1000, 's'),
      modelLoadTime: q(read.modelMs / 1000, 's'),
      keptInCacheStorage: read.notStored === null ? 'yes' : `no: ${read.notStored.slice(0, 200)}`,
      firstInferenceTime: q(firstInference, 'ms', 1),
      inferenceTime: spread(rest, 'ms'),
      detections: Object.fromEntries(Object.entries(read.found).map(([kind, count]) => [kind, q(count, 'boxes', 0)])),
    };
  } catch (error) {
    if (page) await keepPicture(page, `${name}-model`);
    return { error: firstLine(error) };
  } finally {
    if (context) await context.close().catch(() => undefined);
  }
}

// =============================================================================
// Lost & Found
// =============================================================================

async function measureLostFound(browser, cls, rate, name, watchDelay) {
  let context = null;
  let page = null;
  try {
    context = await browser.newContext({ ...cls.context, permissions: ['camera', 'microphone'] });
    await context.addInitScript(seed, SETTINGS);
    await context.addInitScript(instrument);
    const slowed = await slowedPage(context, rate);
    page = slowed.page;
    const { cdp } = slowed;
    await page.goto(new URL('/lost-found/', baseUrl).toString(), { waitUntil: 'networkidle', timeout: 180_000 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    const calibration = await calibrate(page, CALIBRATION_STEPS);

    // Enrol one subject from that frame, through the form a person uses.
    await page.getByText('Add New Subject to Watch').click({ timeout: 120_000 });
    await page.getByText('What are you looking for?').waitFor({ timeout: 120_000 });
    await page.getByRole('button', { name: 'Continue', exact: true }).click({ timeout: 120_000 });
    await page.getByPlaceholder('e.g., Max, Luna, Dad').fill('Kitten', { timeout: 120_000 });
    await page.locator('input[type="file"]').setInputFiles(path.resolve(subjectFile));
    await page.getByRole('button', { name: 'Continue', exact: true }).click({ timeout: 120_000 });
    await page.getByRole('button', { name: 'Start Watching', exact: true }).click({ timeout: 120_000 });

    // The page's own key opens the watch with Lost and Found chosen and this
    // pet; the watch compares once its Start Monitoring is pressed.
    await page.getByRole('button', { name: 'Start Monitoring' }).click({ timeout: 120_000 });
    await page.waitForURL(/\/monitor\/?$/, { timeout: 120_000 });
    await startMonitoring(page);

    // The monitor's motion loop reads pixels too; matching is the other timer
    // that does.
    const first = await firstFrameTick(page, Number(watchDelay) || 200, 120_000);
    const end = first.at + LOST_FOUND_MS;
    await runUntil(page, end);
    const read = await page.evaluate(() => window.__measure.ticks);
    const matching = read.filter((t) => t.reads > 0 && t.delay === first.delay && t.at >= first.at && t.at < end);
    console.log(`${name}: Lost & Found matched ${matching.length} frames in ${LOST_FOUND_MS / 1000} s`);
    return {
      calibrationLoop: q(calibration.ms, 'ms', 1),
      window: q(LOST_FOUND_MS / 1000, 's', 0),
      matchingTimerInterval: q(first.delay, 'ms', 0),
      framesMatchedPerSecond: q(matching.length / (LOST_FOUND_MS / 1000), 'frames/s'),
      matchingTime: spread(matching.map((t) => t.ms), 'ms'),
      matchingTimeWithQueuedMicrotasks: spread(matching.filter((t) => t.settledMs !== null).map((t) => t.settledMs), 'ms'),
    };
  } catch (error) {
    if (page) await keepPicture(page, `${name}-lost-found`);
    return { error: firstLine(error) };
  } finally {
    if (context) await context.close().catch(() => undefined);
  }
}

// =============================================================================
// The table
// =============================================================================

const show = (n) => (n ? `${n.value} ${n.unit}` : 'not read');
const showSpread = (s) =>
  s && s.median ? `${s.median.value} / ${s.p95.value} ${s.median.unit} (${s.samples.value} samples)` : 'not read';

function table(results) {
  const runs = results.runs;
  const head = runs.map((r) => `${r.className} ×${r.cpuThrottlingRate.value}`);
  const rows = [];
  const row = (label, cell) => rows.push(`| ${label} | ${runs.map((r) => cell(r)).join(' | ')} |`);
  const part = (r, key, read) => (r[key]?.error ? `not measured: ${r[key].error.replace(/\|/g, '/')}` : read(r[key]));

  row('Calibration loop on the page', (r) => part(r, 'watch', (w) => show(w.calibrationLoop)));
  row('Watch: frames analysed per second', (r) => part(r, 'watch', (w) => show(w.framesAnalysedPerSecond)));
  row('Watch: frame analysis time, median / 95th percentile', (r) => part(r, 'watch', (w) => showSpread(w.frameAnalysisTime)));
  row('Watch: sound reading time, median / 95th percentile', (r) => part(r, 'watch', (w) => showSpread(w.soundReadingTime)));
  row('Watch: time from Start Monitoring to the first alert', (r) => part(r, 'watch', (w) => (w.timeToFirstAlert ? `${show(w.timeToFirstAlert)} (${w.firstAlertKind})` : w.firstAlertKind)));
  row('Watch: time from Start Monitoring to the first motion alert', (r) => part(r, 'watch', (w) => (w.timeToFirstMotionAlert ? show(w.timeToFirstMotionAlert) : w.firstMotionAlert)));
  row('Watch: JS heap used after 60 s (as read, after a garbage collection)', (r) => part(r, 'watch', (w) => `${show(w.jsHeapUsedAfter60s)}, ${show(w.jsHeapUsedAfter60sAndGarbageCollection)}`));
  row('Watch: long tasks in 60 s (count, total)', (r) => part(r, 'watch', (w) => (w.longTasks ? `${w.longTasks.count.value}, ${show(w.longTasks.total)}` : 'not read')));
  row('Model: downloaded (decoded, on the wire)', (r) => part(r, 'model', (m) => `${(m.downloadDecoded.value / 1e6).toFixed(2)} MB, ${(m.downloadOnTheWire.value / 1e6).toFixed(2)} MB`));
  row('Model: load time (scripts, model)', (r) => part(r, 'model', (m) => `${show(m.loadTime)} (${m.scriptLoadTime.value}, ${m.modelLoadTime.value})`));
  row('Model: files kept in Cache Storage', (r) => part(r, 'model', (m) => m.keptInCacheStorage.replace(/\|/g, '/')));
  row('Model: first inference', (r) => part(r, 'model', (m) => show(m.firstInferenceTime)));
  row('Model: inference time, median / 95th percentile', (r) => part(r, 'model', (m) => showSpread(m.inferenceTime)));
  row('Model: backend', (r) => part(r, 'model', (m) => m.backend));
  row('Lost & Found: matching time per frame, median / 95th percentile', (r) => part(r, 'lostFound', (l) => showSpread(l.matchingTime)));
  row('Lost & Found: frames matched per second', (r) => part(r, 'lostFound', (l) => show(l.framesMatchedPerSecond)));

  const renderer = runs.map((r) => r.model?.renderer).find(Boolean);
  const warning = runs.flatMap((r) => r.model?.backendWarnings ?? []).find((text) => /backend|webgl/i.test(text));
  return [
    '### Measurements on slowed devices',
    '',
    `Chromium ${results.browser}, ${results.runner.cpu}, ${results.runner.logicalCpus.value} logical CPUs, ${results.runner.memory.value} ${results.runner.memory.unit}. ` +
      'Each column is one device class with its CPU slowed by that factor (Emulation.setCPUThrottlingRate); the slow-down is an approximation of a slower device, not a named phone. ' +
      `The camera is the sample clip, ${results.camera ?? 'size not read'}. See docs/PERFORMANCE.md.`,
    '',
    `| | ${head.join(' | ')} |`,
    `| --- | ${head.map(() => '---').join(' | ')} |`,
    ...rows,
    '',
    renderer ? `WebGL renderer: ${renderer}.` : 'WebGL renderer: not read.',
    warning ? `TensorFlow.js on the console: ${warning.replace(/\s+/g, ' ')}` : '',
    '',
  ].join('\n');
}

// =============================================================================
// The run
// =============================================================================

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-video-capture=${path.resolve(videoFile)}`,
    `--use-file-for-fake-audio-capture=${path.resolve(audioFile)}`,
    '--autoplay-policy=no-user-gesture-required',
    // performance.memory otherwise gives rounded figures that are refreshed
    // only now and then.
    '--enable-precise-memory-info',
    // The runner has no graphics card; WebGL is drawn in software.
    '--enable-unsafe-swiftshader',
  ],
});

const results = {
  measuredAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? null,
  run: process.env.GITHUB_RUN_ID ?? null,
  browser: browser.version(),
  runner: {
    cpu: os.cpus()[0]?.model ?? 'unknown',
    logicalCpus: q(os.cpus().length, 'CPUs', 0),
    memory: q(os.totalmem() / 2 ** 30, 'GiB', 1),
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
  },
  modelUrl: MODEL_URL,
  camera: null,
  runs: [],
};

try {
  for (const cls of CLASSES) {
    for (const rate of cls.rates) {
      const name = `${cls.id}-x${rate}`;
      console.log(`${name}: measuring`);
      const watch = await measureWatch(browser, cls, rate, name);
      const model = await measureModel(browser, cls, rate, name);
      const lostFound = await measureLostFound(browser, cls, rate, name, watch.motionTimerInterval?.value);
      if (!results.camera && watch.camera) results.camera = `${watch.camera.width.value} by ${watch.camera.height.value} px`;
      for (const [part, value] of Object.entries({ watch, model, lostFound })) {
        if (value.error) console.log(`::warning title=${name} ${part} not measured::${value.error}`);
      }
      results.runs.push({
        className: cls.name,
        class: cls.id,
        viewport: { width: q(cls.context.viewport.width, 'CSS px', 0), height: q(cls.context.viewport.height, 'CSS px', 0) },
        deviceScaleFactor: q(cls.context.deviceScaleFactor, 'device px per CSS px', 0),
        touch: cls.context.hasTouch,
        cpuThrottlingRate: q(rate, 'x slower', 0),
        watch,
        model,
        lostFound,
      });
      await writeFile(path.join(outDir, 'measurements.json'), `${JSON.stringify(results, null, 2)}\n`);
    }
  }
} finally {
  await browser.close();
}

const summary = table(results);
await writeFile(path.join(outDir, 'measurements.json'), `${JSON.stringify(results, null, 2)}\n`);
await writeFile(path.join(outDir, 'summary.md'), summary);
console.log(summary);
