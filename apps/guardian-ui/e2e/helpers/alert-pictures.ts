/**
 * The alert pictures walks' device, camera and database.
 *
 * A device that has finished setup (the localStorage seeds
 * e2e/helpers/seeded-device.ts writes) with its alert pictures settings; a
 * reading of the site's IndexedDB with its Blobs reported by type and size;
 * a database saved by the release before alert pictures (version 7); rows
 * written straight into the alert and picture stores; and a camera that is a
 * canvas stream whose moving part is redrawn at random grey levels every
 * 40 ms, as e2e/alerts-repeat.spec.ts builds one, which `window.__camera`
 * changes while the walk runs.
 *
 * @module e2e/helpers/alert-pictures
 */

import type { BrowserContext, Locator, Page } from '@playwright/test';

// =============================================================================
// The device
// =============================================================================

export interface PicturesSeed {
  keep?: boolean;
  deleteAfterDays?: 1 | 3 | 7 | 30 | null;
  noticeAnswered?: boolean;
  inNotifications?: boolean;
}

export interface DeviceSeed {
  use?: 'pet' | 'baby';
  /** The saved settings (merged over the store's defaults), or none. */
  settings?: Record<string, unknown> | null;
  /** The alert pictures settings; none leaves the store's defaults. */
  pictures?: PicturesSeed;
  /** A server the page connects to. */
  backend?: { wsUrl: string };
}

/** The Custom preset with only motion on, its line at 20 % (sensitivity 80), as the alert walk seeds it. */
export const CUSTOM_PRESET = {
  id: 'custom',
  name: 'Maximum Alert',
  description: 'High sensitivity (80%), max volume, 5-second intervals.',
  motionSensitivity: 80,
  audioSensitivity: 80,
  pixelThreshold: 20,
  absolutePixelThreshold: 50,
  analysisInterval: 5,
  alertDelay: 30,
  alertVolume: 100,
  emergencyMode: false,
  pixelDetectionEnabled: false,
  motionDetectionEnabled: true,
  audioDetectionEnabled: false,
  processingMode: 'hybrid',
  useAbsoluteThreshold: false,
};
export const MOTION_ONLY = { activePresetId: 'custom', globalSettings: CUSTOM_PRESET };

/** The store's timing defaults with the Cooldown Period at `seconds`. */
export const cooldownPeriod = (seconds: number) => ({
  cooldownPeriod: seconds,
  minimumMotionDuration: 500,
  emergencyEscalationDelay: 300,
});

export async function seedDevice(context: BrowserContext, device: DeviceSeed): Promise<void> {
  await context.grantPermissions(['camera', 'microphone']);
  await context.addInitScript((d: DeviceSeed) => {
    // Seeded once: a reload or a second page keeps what the walk changed.
    if (localStorage.getItem('safeos-walk-seeded')) return;
    localStorage.setItem('safeos-walk-seeded', 'true');
    localStorage.setItem('safeos-onboarding', JSON.stringify({ state: {
      isComplete: true, selectedScenario: d.use ?? 'pet',
      acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
    }, version: 0 }));
    localStorage.setItem('guardian-onboarding-complete', 'true');
    if (d.settings) localStorage.setItem('safeos-settings', JSON.stringify({ state: d.settings, version: 0 }));
    localStorage.setItem('safeos-notification-prompt-dismissed', String(Date.now()));
    localStorage.setItem('safeos-pwa-prompt-dismissed', String(Date.now()));
    if (d.pictures) {
      localStorage.setItem('safeos-alert-pictures', JSON.stringify({ state: {
        keep: true, deleteAfterDays: 3, noticeAnswered: false, inNotifications: false, ...d.pictures,
      }, version: 0 }));
    }
    if (d.backend) {
      localStorage.setItem('safeos_backend_config', JSON.stringify({
        apiUrl: d.backend.wsUrl.replace(/^ws/, 'http').replace(/\/ws$/, ''),
        wsUrl: d.backend.wsUrl,
        ollamaUrl: '',
        configured: true,
      }));
    }
  }, device);
}

// =============================================================================
// The database
// =============================================================================

export interface DatabaseReading {
  version: number;
  stores: string[];
  alerts: Array<Record<string, any>>;
  pictures: Array<Record<string, any>>;
  matchFrames: Array<Record<string, any>>;
}

/** The site's database as it stands, read on its own connection, which it closes. Blobs read as `{ type, size }`. */
export function readDatabase(page: Page): Promise<DatabaseReading> {
  return page.evaluate(() => new Promise<DatabaseReading>((resolve, reject) => {
    const plain = (value: unknown): unknown => {
      if (value instanceof Blob) return { type: value.type, size: value.size };
      if (Array.isArray(value)) return value.map(plain);
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, plain(v)]));
      }
      return value;
    };
    const opening = indexedDB.open('safeos-guardian');
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      // The app's own upgrade is never held up by this connection.
      db.onversionchange = () => db.close();
      const stores = Array.from(db.objectStoreNames);
      const wanted = ['alert_cache', 'alert_picture', 'match_frame'].filter((name) => stores.includes(name));
      const reading: DatabaseReading = { version: db.version, stores, alerts: [], pictures: [], matchFrames: [] };
      if (wanted.length === 0) { db.close(); resolve(reading); return; }
      const tx = db.transaction(wanted, 'readonly');
      const read = (name: string, into: Array<Record<string, any>>) => {
        if (!wanted.includes(name)) return;
        const request = tx.objectStore(name).getAll();
        request.onsuccess = () => { for (const row of request.result) into.push(plain(row) as Record<string, any>); };
      };
      read('alert_cache', reading.alerts);
      read('alert_picture', reading.pictures);
      read('match_frame', reading.matchFrames);
      tx.oncomplete = () => { db.close(); resolve(reading); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));
}

export interface Version7Records {
  alerts?: Array<Record<string, unknown>>;
  matchFrames?: Array<Record<string, unknown>>;
  subjects?: Array<Record<string, unknown>>;
}

/**
 * Makes the database the release before alert pictures saved: version 7 with
 * every store and index it had, holding `records`. It runs on a page of the
 * site that does not open the database, before the app opens it.
 */
export async function seedVersion7(page: Page, records: Version7Records): Promise<void> {
  await page.goto('/manifest.json');
  await page.evaluate((r: Version7Records) => new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open('safeos-guardian', 7);
    opening.onerror = () => reject(opening.error);
    opening.onupgradeneeded = () => {
      const db = opening.result;
      db.createObjectStore('local_session', { keyPath: 'id' });
      db.createObjectStore('profile_cache', { keyPath: 'id' });
      db.createObjectStore('stream_cache', { keyPath: 'id' }).createIndex('by-created', 'createdAt');
      const alerts = db.createObjectStore('alert_cache', { keyPath: 'id' });
      alerts.createIndex('by-stream', 'streamId');
      alerts.createIndex('by-created', 'createdAt');
      alerts.createIndex('by-producer-created', ['producer', 'createdAt']);
      alerts.createIndex('by-retention', ['retentionClass', 'acknowledgementOrder', 'createdAt']);
      alerts.createIndex('by-producer-retention', ['producer', 'retentionClass', 'acknowledgementOrder', 'createdAt']);
      const frames = db.createObjectStore('frame_cache', { keyPath: 'id' });
      frames.createIndex('by-stream', 'streamId');
      frames.createIndex('by-created', 'createdAt');
      db.createObjectStore('sync_queue', { keyPath: 'id' }).createIndex('by-created', 'createdAt');
      db.createObjectStore('settings_cache', { keyPath: 'key' });
      db.createObjectStore('consent_log', { keyPath: 'id' }).createIndex('by-type', 'consentType');
      const subjects = db.createObjectStore('subject_profile', { keyPath: 'id' });
      subjects.createIndex('by-type', 'type');
      subjects.createIndex('by-created', 'createdAt');
      const matches = db.createObjectStore('match_frame', { keyPath: 'id' });
      matches.createIndex('by-subject', 'subjectId');
      matches.createIndex('by-timestamp', 'timestamp');
      matches.createIndex('by-confidence', 'confidence');
      const intrusions = db.createObjectStore('intrusion_frame', { keyPath: 'id' });
      intrusions.createIndex('by-timestamp', 'timestamp');
      intrusions.createIndex('by-personCount', 'personCount');
      const media = db.createObjectStore('custom_media', { keyPath: 'id' });
      media.createIndex('by-subject', 'subjectId');
      media.createIndex('by-type', 'type');
      media.createIndex('by-order', 'order');
      const animals = db.createObjectStore('animal_detection', { keyPath: 'id' });
      animals.createIndex('by-timestamp', 'timestamp');
      animals.createIndex('by-type', 'type');
      animals.createIndex('by-danger', 'dangerLevel');
      db.createObjectStore('clear_generation');
      const tx = opening.transaction!;
      tx.objectStore('clear_generation').put(`${Date.now()}-seeded`, 'current');
      for (const row of r.alerts ?? []) tx.objectStore('alert_cache').put(row);
      for (const row of r.matchFrames ?? []) tx.objectStore('match_frame').put(row);
      for (const row of r.subjects ?? []) tx.objectStore('subject_profile').put(row);
    };
    opening.onsuccess = () => { opening.result.close(); resolve(); };
  }), records);
}

export interface PictureRow {
  /** The alert's record in alert_cache; its `pictureId` names the picture row. */
  alert: Record<string, unknown>;
  /** The picture row; `frame` and `closeUp` true are drawn as small JPEGs in the page. */
  picture?: Record<string, unknown> & { frame?: boolean; closeUp?: boolean };
}

/**
 * Writes alert and picture rows into the database the app has opened (it
 * opens it at /history/). The pictures' Blobs are small JPEGs drawn in the
 * page. The page is left on /history/; reload or go on from there.
 */
export async function seedPictureRows(page: Page, rows: PictureRow[], options: { here?: boolean } = {}): Promise<void> {
  // From History unless `here`: the rows are then written under the open page, which read its alerts before.
  if (!options.here) await page.goto('/history/', { waitUntil: 'networkidle' });
  await page.waitForFunction(async () => (await indexedDB.databases()).some((d) => d.name === 'safeos-guardian'), undefined, { timeout: 15_000 });
  await page.evaluate((list: PictureRow[]) => new Promise<void>((resolve, reject) => {
    const jpeg = (width: number, height: number, grey: number) => new Promise<Blob>((done, fail) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = `rgb(${grey}, ${grey}, ${grey})`;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = 'rgb(200, 60, 60)';
      ctx.fillRect(width / 4, height / 4, width / 4, height / 4);
      canvas.toBlob((blob) => (blob ? done(blob) : fail(new Error('no JPEG'))), 'image/jpeg', 0.7);
    });
    void (async () => {
      const prepared = [] as Array<{ alert: Record<string, unknown>; picture?: Record<string, unknown> }>;
      for (const row of list) {
        if (!row.picture) { prepared.push({ alert: row.alert }); continue; }
        const { frame, closeUp, ...rest } = row.picture;
        const width = (rest.frameWidth as number | undefined) ?? 64;
        const height = (rest.frameHeight as number | undefined) ?? 48;
        prepared.push({
          alert: row.alert,
          picture: {
            ...rest,
            ...(frame ? { frame: await jpeg(width, height, 110) } : {}),
            ...(closeUp ? { closeUp: await jpeg(Math.round(width / 2), Math.round(height / 2), 150) } : {}),
          },
        });
      }
      const opening = indexedDB.open('safeos-guardian');
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const db = opening.result;
        db.onversionchange = () => db.close();
        let tx: IDBTransaction;
        try {
          tx = db.transaction(['alert_cache', 'alert_picture'], 'readwrite');
        } catch (error) {
          db.close();
          reject(error);
          return;
        }
        for (const row of prepared) {
          tx.objectStore('alert_cache').put(row.alert);
          if (row.picture) tx.objectStore('alert_picture').put(row.picture);
        }
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    })().catch(reject);
  }), rows);
}

/** A monitoring alert's record as the watch saves it. */
export function savedAlert(id: string, at: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const acknowledged = extra.acknowledged === true;
  return {
    id,
    monitoring: true,
    producer: 'monitoring',
    savedBeforeUpgrade: false,
    retentionClass: 'new',
    acknowledgementOrder: acknowledged ? 0 : 1,
    streamId: 'local',
    severity: 'low',
    message: 'Motion detected: 30% (threshold: 20% · zone: Full Screen)',
    acknowledged,
    createdAt: new Date(at).toISOString(),
    timestamp: new Date(at).toISOString(),
    syncedAt: new Date(at).toISOString(),
    ...extra,
  };
}

/** A kept picture row for `id`, taken at `at`, with a drawn frame and close-up. */
export function keptPicture(id: string, at: number, extra: Record<string, unknown> = {}): PictureRow['picture'] {
  return {
    id,
    state: 'kept',
    kind: 'motion',
    takenAt: at,
    frame: true,
    frameWidth: 64,
    frameHeight: 48,
    box: { x: 16, y: 12, width: 16, height: 12 },
    sourceWidth: 64,
    sourceHeight: 48,
    closeUp: true,
    closeUpWidth: 32,
    closeUpHeight: 24,
    dark: false,
    ...extra,
  };
}

// =============================================================================
// The camera
// =============================================================================

export interface CanvasCamera {
  width: number;
  height: number;
  /** The grey of the still part, 0 to 255. */
  background: number;
  /** The part redrawn every 40 ms, in fractions of the picture. */
  moving: { x: number; y: number; width: number; height: number };
  /** The grey levels the moving part is redrawn at, at random a pixel. */
  levels: number[];
  /** A sawtooth tone at full gain on the microphone, in place of silence. */
  tone?: boolean;
  /**
   * Draws this many pictures once and shows them in turn, in place of drawing each frame anew:
   * a large camera then costs the page's other work nothing.
   */
  cycle?: number;
}

declare global {
  interface Window {
    __camera?: CanvasCamera;
  }
}

/**
 * Hands the page a canvas stream in place of the browser's camera. The
 * page's own detectors read it the way they read a real camera.
 */
export async function canvasCamera(page: Page, camera: CanvasCamera): Promise<void> {
  await page.addInitScript((c: CanvasCamera) => {
    window.__camera = { ...c };
    navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      const live = window.__camera!;
      const canvas = document.createElement('canvas');
      canvas.width = live.width;
      canvas.height = live.height;
      canvas.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px';
      document.body.appendChild(canvas);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context for the test camera');
      const made: ImageData[] = [];
      let shown = 0;
      const paint = () => {
        const cam = window.__camera!;
        const W = canvas.width;
        const H = canvas.height;
        const image = ctx.createImageData(W, H);
        const d = image.data;
        const x0 = Math.round(W * cam.moving.x);
        const x1 = Math.round(W * (cam.moving.x + cam.moving.width));
        const y0 = Math.round(H * cam.moving.y);
        const y1 = Math.round(H * (cam.moving.y + cam.moving.height));
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            const inside = x >= x0 && x < x1 && y >= y0 && y < y1;
            const v = inside ? cam.levels[Math.floor(Math.random() * cam.levels.length)] : cam.background;
            d[i] = v;
            d[i + 1] = v;
            d[i + 2] = v;
            d[i + 3] = 255;
          }
        }
        return image;
      };
      let still: ImageData | null = null;
      const draw = () => {
        const cam = window.__camera!;
        const cycle = cam.cycle ?? 0;
        if (cycle > 0) {
          // A camera told to hold still (no moving part) shows one picture, drawn once.
          if (cam.moving.width <= 0 || cam.moving.height <= 0) {
            still ??= paint();
            ctx.putImageData(still, 0, 0);
            return;
          }
          if (made.length < cycle) made.push(paint());
          ctx.putImageData(made[shown++ % made.length], 0, 0);
          return;
        }
        ctx.putImageData(paint(), 0, 0);
      };
      draw();
      setInterval(draw, 40);
      const stream = canvas.captureStream(25);
      if (constraints && constraints.audio) {
        const audio = new AudioContext();
        const microphone = audio.createMediaStreamDestination();
        if (live.tone) {
          const tone = audio.createOscillator();
          tone.type = 'sawtooth';
          tone.frequency.value = 440;
          const gain = audio.createGain();
          gain.gain.value = 1;
          tone.connect(gain).connect(microphone);
          tone.start();
        }
        void audio.resume();
        for (const track of microphone.stream.getAudioTracks()) stream.addTrack(track);
      }
      return stream;
    };
  }, camera);
}

/** The camera stand-in's change: the left third redrawn at grey levels 0, 85, 170 and 255 on a 128 grey, 320 by 240. */
export const LEFT_THIRD: CanvasCamera = {
  width: 320,
  height: 240,
  background: 128,
  moving: { x: 0, y: 0, width: 1 / 3, height: 1 },
  levels: [0, 85, 170, 255],
};

/** Presses Start Monitoring and waits for the live picture. */
export async function startWatching(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start Monitoring', exact: true }).click();
  await page.getByText('LIVE', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
}

// =============================================================================
// The sample clip
// =============================================================================

/**
 * Chromium's launch arguments for its fake camera and microphone playing the
 * committed sample clip, converted in CI by ci.yml's step "Make the fake
 * camera's files from the sample clip" (SAMPLE_CLIP_Y4M and SAMPLE_CLIP_WAV).
 */
export function sampleClipLaunch(): string[] {
  const video = process.env.SAMPLE_CLIP_Y4M;
  const audio = process.env.SAMPLE_CLIP_WAV;
  return [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    // Without the clip's files the fake devices play Chromium's own pattern;
    // the walks that need the clip fail in requireSampleClip.
    ...(video ? [`--use-file-for-fake-video-capture=${video}`] : []),
    ...(audio ? [`--use-file-for-fake-audio-capture=${audio}`] : []),
    '--autoplay-policy=no-user-gesture-required',
  ];
}

/** Fails the test when the clip's files were not made. */
export function requireSampleClip(): void {
  if (!process.env.SAMPLE_CLIP_Y4M || !process.env.SAMPLE_CLIP_WAV) {
    throw new Error('SAMPLE_CLIP_Y4M and SAMPLE_CLIP_WAV are not set: run ci.yml\'s step "Make the fake camera\'s files from the sample clip" first');
  }
}

/** The capture preset (scripts/home-capture-settings.json) with its detectors set. */
export function clipSettings(detectors: { motion: boolean; sound: boolean }): Record<string, unknown> {
  return {
    activePresetId: 'custom',
    globalSettings: {
      ...CUSTOM_PRESET,
      motionDetectionEnabled: detectors.motion,
      audioDetectionEnabled: detectors.sound,
    },
  };
}

// =============================================================================
// Reading what the page draws
// =============================================================================

/** The colour of the pixel at (x, y) of an image the page can load (a blob, data or site URL). */
export function pixelAt(page: Page, imageUrl: string, x: number, y: number): Promise<[number, number, number]> {
  return page.evaluate(({ url, px, py }) => new Promise<[number, number, number]>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      const [r, g, b] = ctx.getImageData(Math.round(px), Math.round(py), 1, 1).data;
      resolve([r, g, b]);
    };
    image.onerror = () => reject(new Error(`the image ${url.slice(0, 40)} did not load`));
    image.src = url;
  }), { url: imageUrl, px: x, py: y });
}

/** Many pixels of one image at once. */
export function pixelsAt(page: Page, imageUrl: string, points: Array<[number, number]>): Promise<Array<[number, number, number]>> {
  return page.evaluate(({ url, list }) => new Promise<Array<[number, number, number]>>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      resolve(list.map(([px, py]) => {
        const [r, g, b] = ctx.getImageData(Math.round(px), Math.round(py), 1, 1).data;
        return [r, g, b] as [number, number, number];
      }));
    };
    image.onerror = () => reject(new Error('the image did not load'));
    image.src = url;
  }), { url: imageUrl, list: points });
}

/** A screenshot as a data URL the page can sample. */
export const pngUrl = (bytes: Buffer): string => `data:image/png;base64,${bytes.toString('base64')}`;

/** The natural size of the image an `img` locator shows. */
export function naturalSize(locator: Locator): Promise<{ width: number; height: number }> {
  return locator.evaluate((img: HTMLImageElement) => ({ width: img.naturalWidth, height: img.naturalHeight }));
}

/** True when each channel is within `tolerance` of the hex colour. */
export function near(rgb: [number, number, number], hex: string, tolerance = 40): boolean {
  const want = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return rgb.every((value, i) => Math.abs(value - want[i]) <= tolerance);
}

export interface Readability {
  lead: number;
  other: number;
  floor: number;
  leadRatio: number;
  otherRatio: number;
}

export interface ReadabilityFault {
  text: string;
  size: number;
  ratio: number;
  lead: boolean;
  why: string;
}

/**
 * Reads every visible text element under `root`: its computed size and its
 * contrast against the ground painted under it (the first solid background up
 * the tree, with any see-through ones laid over it). Elements under a
 * `data-lead` element are lead lines. Answers what falls short.
 */
export function readable(root: Locator, rules: Readability): Promise<ReadabilityFault[]> {
  return root.evaluate((element: Element, r: Readability) => {
    type RGBA = [number, number, number, number];
    const parse = (value: string): RGBA | null => {
      const m = /rgba?\(([^)]+)\)/.exec(value);
      if (!m) return null;
      const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
    };
    const over = (top: RGBA, under: RGBA): RGBA => {
      const a = top[3] + under[3] * (1 - top[3]);
      if (a === 0) return [0, 0, 0, 0];
      const mix = (i: number) => (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / a;
      return [mix(0), mix(1), mix(2), a];
    };
    const luminance = ([R, G, B]: RGBA) => {
      const c = [R, G, B].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const ratio = (a: RGBA, b: RGBA) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const ground = (el: Element): RGBA | null => {
      const layers: RGBA[] = [];
      for (let node: Element | null = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.backgroundImage && style.backgroundImage !== 'none') return null;
        const bg = parse(style.backgroundColor);
        if (bg && bg[3] > 0) {
          layers.push(bg);
          if (bg[3] >= 1) break;
        }
      }
      let painted: RGBA = [255, 255, 255, 1];
      for (const layer of layers.reverse()) painted = over(layer, painted);
      return painted;
    };
    const faults: Array<{ text: string; size: number; ratio: number; lead: boolean; why: string }> = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent || '').trim();
      const el = node.parentElement;
      if (!text || !el || seen.has(el)) continue;
      seen.add(el);
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1 || style.visibility === 'hidden' || el.closest('[aria-hidden="true"]')) continue;
      if (style.clip === 'rect(0px, 0px, 0px, 0px)' || style.clipPath === 'inset(50%)') continue;
      const lead = Boolean(el.closest('[data-lead]'));
      const size = parseFloat(style.fontSize);
      const under = ground(el);
      const ink = parse(style.color);
      if (!under || !ink) {
        faults.push({ text, size, ratio: 0, lead, why: 'no solid ground under the words' });
        continue;
      }
      const shown = ratio(over(ink, under), under);
      const wantSize = lead ? r.lead : r.other;
      const wantRatio = lead ? r.leadRatio : r.otherRatio;
      if (size < r.floor) faults.push({ text, size, ratio: shown, lead, why: `under ${r.floor} px` });
      else if (size < wantSize) faults.push({ text, size, ratio: shown, lead, why: `under ${wantSize} px` });
      if (shown < wantRatio) faults.push({ text, size, ratio: shown, lead, why: `under ${wantRatio}:1` });
    }
    return faults;
  }, rules);
}

/** The block's rules for today's look: lead 18 px at 12:1, other words 16 px at 7:1, nothing under 15 px. */
export const BLOCK_READABILITY: Readability = { lead: 18, other: 16, floor: 15, leadRatio: 12, otherRatio: 7 };

/** Text at 200 per cent: every size in rem doubles. */
export async function doubleText(page: Page): Promise<void> {
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
}

/** True when the page scrolls sideways. */
export const scrollsSideways = (page: Page): Promise<boolean> =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

// =============================================================================
// The picture store's faults
// =============================================================================

export interface PictureFault {
  /** The app hears of a saved picture this long after the browser wrote it. */
  holdSaveMs?: number;
  /** The app hears a read's answer (a picture, or the count) this long after the browser gave it. */
  holdReadMs?: number;
  /** A picture's JPEG is handed back this long after it was drawn: its save starts that much later. */
  holdDrawMs?: number;
  /** Every write of a kept picture fails: for lack of room, or with a plain error (the store's probe too). */
  writes?: 'quota' | 'error';
  /** A kept picture's write fails for lack of room until its transaction has deleted this many rows. */
  quotaUntilDeletes?: number;
  /** Every read of a picture fails. */
  reads?: 'error';
  /** Every delete of a kept picture (the row that says it went) fails. */
  deletes?: 'error';
}

declare global {
  interface Window {
    __pictureFault?: PictureFault;
  }
}

/** The key the fault is kept under across reloads; Clear All Local Data leaves it (it is not a `safeos` key). */
const FAULT_KEY = 'walk-picture-fault';

/**
 * Wraps the browser's IndexedDB calls on the `alert_picture` store before
 * the app's scripts run, so a walk can hold or fail a save, a read or a
 * delete. With no fault set every call goes straight through.
 */
export async function faultPictureStore(page: Page, fault: PictureFault = {}): Promise<void> {
  await page.addInitScript(({ key, first }: { key: string; first: PictureFault }) => {
    const saved = localStorage.getItem(key);
    window.__pictureFault = saved ? JSON.parse(saved) : first;
    if (!saved) localStorage.setItem(key, JSON.stringify(first));
    const fault = () => window.__pictureFault ?? {};
    const STORE = 'alert_picture';
    const storeOf = (source: unknown): IDBObjectStore | null =>
      source instanceof IDBObjectStore ? source : source instanceof IDBIndex ? source.objectStore : null;
    const onPictures = (source: unknown) => storeOf(source)?.name === STORE;

    const deletes = new WeakMap<IDBTransaction, number>();
    const heldSaves = new WeakMap<IDBTransaction, number>();
    const heldReads = new WeakMap<IDBRequest, number>();
    const countDelete = (tx: IDBTransaction) => deletes.set(tx, (deletes.get(tx) ?? 0) + 1);
    const refuse = (name: string) => { throw new DOMException(`the walk refuses this ${STORE} call`, name); };

    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: { id?: string; state?: string }, ...rest: [IDBValidKey?]) {
      if (this.name === STORE && value) {
        const f = fault();
        const kept = value.state === 'kept';
        if ((kept || value.id === 'probe') && f.writes === 'error') refuse('UnknownError');
        if (kept && f.writes === 'quota') refuse('QuotaExceededError');
        if (kept && f.quotaUntilDeletes && (deletes.get(this.transaction) ?? 0) < f.quotaUntilDeletes) refuse('QuotaExceededError');
        if (!kept && value.id !== 'probe' && f.deletes === 'error') refuse('UnknownError');
        if (kept && f.holdSaveMs) heldSaves.set(this.transaction, f.holdSaveMs);
      }
      return put.call(this, value, ...rest);
    } as typeof put;

    const remove = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function (this: IDBObjectStore, query: IDBValidKey | IDBKeyRange) {
      if (this.name === STORE && query !== 'probe') countDelete(this.transaction);
      return remove.call(this, query);
    } as typeof remove;

    const cursorDelete = IDBCursor.prototype.delete;
    IDBCursor.prototype.delete = function (this: IDBCursor) {
      const store = storeOf(this.source);
      if (store?.name === STORE) countDelete(store.transaction);
      return cursorDelete.call(this);
    } as typeof cursorDelete;

    const cursorUpdate = IDBCursor.prototype.update;
    IDBCursor.prototype.update = function (this: IDBCursor, value: { state?: string }) {
      if (onPictures(this.source) && value?.state === 'gone' && fault().deletes === 'error') refuse('UnknownError');
      return cursorUpdate.call(this, value);
    } as typeof cursorUpdate;

    const read = <T extends IDBRequest>(request: T): T => {
      const hold = fault().holdReadMs;
      if (hold) heldReads.set(request, hold);
      return request;
    };
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (this: IDBObjectStore, query: IDBValidKey | IDBKeyRange) {
      if (this.name !== STORE) return get.call(this, query);
      if (fault().reads === 'error') refuse('UnknownError');
      return read(get.call(this, query));
    } as typeof get;
    const count = IDBIndex.prototype.count;
    IDBIndex.prototype.count = function (this: IDBIndex, query?: IDBValidKey | IDBKeyRange) {
      const request = count.call(this, query);
      return this.objectStore.name === STORE ? read(request) : request;
    } as typeof count;

    // The app hears of a held save's `complete`, and of a held read's `success`, late.
    type Listen = (this: EventTarget, name: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) => void;
    const late = new WeakMap<EventListenerOrEventListenerObject, EventListener>();
    const call = (listener: EventListenerOrEventListenerObject, target: EventTarget, event: Event) =>
      typeof listener === 'function' ? listener.call(target, event) : listener.handleEvent(event);
    const hold = (proto: EventTarget, type: string, waits: WeakMap<object, number>) => {
      const target = proto as { addEventListener: Listen; removeEventListener: Listen };
      const add = target.addEventListener;
      const drop = target.removeEventListener;
      target.addEventListener = function (this: EventTarget, name, listener, options) {
        if (name !== type || !listener) return add.call(this, name, listener, options);
        const wrapped: EventListener = (event) => {
          const wait = waits.get(this);
          if (wait) setTimeout(() => call(listener, this, event), wait);
          else call(listener, this, event);
        };
        late.set(listener, wrapped);
        return add.call(this, name, wrapped, options);
      };
      target.removeEventListener = function (this: EventTarget, name, listener, options) {
        return drop.call(this, name, (listener && name === type && late.get(listener)) || listener, options);
      };
    };
    hold(IDBTransaction.prototype, 'complete', heldSaves);
    hold(IDBRequest.prototype, 'success', heldReads);

    // A picture's JPEG handed back late: its save starts that much after its alert.
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (this: HTMLCanvasElement, callback: BlobCallback, type?: string, quality?: number) {
      const wait = type === 'image/jpeg' ? fault().holdDrawMs : 0;
      const handBack: BlobCallback = wait ? (blob: Blob | null) => { setTimeout(() => callback(blob), wait); } : callback;
      return toBlob.call(this, handBack, type, quality);
    } as typeof toBlob;
  }, { key: FAULT_KEY, first: fault });
}

/** Changes the fault while the walk runs; a reload keeps it. */
export async function setFault(page: Page, fault: PictureFault): Promise<void> {
  await page.evaluate(({ key, next }) => {
    window.__pictureFault = next;
    localStorage.setItem(key, JSON.stringify(next));
  }, { key: FAULT_KEY, next: fault });
}

/** Sets the time a kept picture was taken, on the walk's own connection. */
export function redatePicture(page: Page, id: string, takenAt: number): Promise<void> {
  return page.evaluate(({ pictureId, at }) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('safeos-guardian');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('alert_picture', 'readwrite');
      const store = tx.objectStore('alert_picture');
      const read = store.get(pictureId);
      read.onsuccess = () => {
        if (!read.result) return;
        store.put({ ...read.result, takenAt: at });
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }), { pictureId: id, at: takenAt });
}

// =============================================================================
// A connected server
// =============================================================================

export interface RoutedServer {
  /** Every message the page sent, as text (binary messages as base64). */
  messages: string[];
}

/**
 * Answers the page's WebSocket at `url` and records every message it sends.
 * It greets a page that presents its session the way the server does, with
 * `connected`, since the page sends its frames only once it is greeted.
 */
export async function routedServer(page: Page, url: string | RegExp): Promise<RoutedServer> {
  const server: RoutedServer = { messages: [] };
  await page.routeWebSocket(url, (socket) => {
    socket.onMessage((message) => {
      const text = typeof message === 'string' ? message : Buffer.from(message).toString('base64');
      server.messages.push(text);
      if (/"type":\s*"authenticate"/.test(text)) {
        socket.send(JSON.stringify({ type: 'connected', payload: { clientId: 'walk-client' } }));
      }
    });
  });
  return server;
}

/**
 * The size of an element's words and their contrast against the element's
 * own solid ground, for words under a part hidden from a screen reader,
 * which `readable` leaves out.
 */
export async function wordsOn(ground: Locator, words: Locator): Promise<{ size: number; ratio: number; solid: boolean }> {
  return ground.evaluate((plate: Element, text: Element | null) => {
    const parse = (value: string): [number, number, number, number] => {
      const parts = (/rgba?\(([^)]+)\)/.exec(value)?.[1] ?? '0,0,0,0').split(/[,\s/]+/).filter(Boolean).map(Number);
      return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
    };
    const luminance = ([R, G, B]: number[]) => {
      const c = [R, G, B].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const under = parse(getComputedStyle(plate).backgroundColor);
    const style = getComputedStyle(text ?? plate);
    const [hi, lo] = [luminance(parse(style.color)), luminance(under)].sort((a, b) => b - a);
    return { size: parseFloat(style.fontSize), ratio: (hi + 0.05) / (lo + 0.05), solid: under[3] >= 1 };
  }, await words.elementHandle());
}

// =============================================================================
// Notifications
// =============================================================================

export interface RecordedNote {
  /** When the page asked the browser for it. */
  at: number;
  title: string;
  body?: string;
  image?: string;
  icon?: string;
  tag?: string;
  renotify?: boolean;
  requireInteraction?: boolean;
}

export interface NotificationStandIn {
  /** What the browser answers for the site's notifications; `default` turns to `granted` when the page asks. */
  permission?: 'granted' | 'default' | 'denied';
  /** A browser that shows a notification's words alone: a notification has no `image` there. */
  wordsAlone?: boolean;
  /** A kept picture cannot be drawn again: the notification's copy fails. */
  failCopy?: boolean;
}

declare global {
  interface Window {
    __notes?: RecordedNote[];
    __notificationAsks?: number;
  }
}

/**
 * Replaces the browser's notifications before the app's scripts run and
 * records each one the page asks for: its title, body, image, icon, tag,
 * renotify and the time. Nothing is shown.
 */
export async function recordNotifications(target: Page | BrowserContext, standIn: NotificationStandIn = {}): Promise<void> {
  await target.addInitScript((s: NotificationStandIn) => {
    const notes: RecordedNote[] = [];
    window.__notes = notes;
    window.__notificationAsks = 0;
    const record = (title: string, options?: NotificationOptions) => {
      const o = (options || {}) as NotificationOptions & { renotify?: boolean; image?: string };
      notes.push({
        at: Date.now(), title, body: o.body, image: o.image, icon: o.icon, tag: o.tag,
        renotify: o.renotify, requireInteraction: o.requireInteraction,
      });
    };
    let permission: NotificationPermission = s.permission ?? 'granted';
    class RecordedNotification extends EventTarget {
      static get permission() { return permission; }
      static requestPermission = async () => {
        window.__notificationAsks = (window.__notificationAsks ?? 0) + 1;
        if (permission === 'default') permission = 'granted';
        return permission;
      };
      onclick: unknown = null;
      onclose: unknown = null;
      onerror: unknown = null;
      onshow: unknown = null;
      constructor(title: string, options?: NotificationOptions) {
        super();
        record(title, options);
      }
      close() {}
    }
    if (!s.wordsAlone) Object.defineProperty(RecordedNotification.prototype, 'image', { get: () => '', configurable: true });
    Object.defineProperty(window, 'Notification', { value: RecordedNotification, configurable: true, writable: true });
    if ('ServiceWorkerRegistration' in window) {
      ServiceWorkerRegistration.prototype.showNotification = async function (title: string, options?: NotificationOptions) {
        record(title, options);
      };
    }
    if (s.failCopy) {
      window.createImageBitmap = (() => Promise.reject(new DOMException('the walk refuses this drawing', 'InvalidStateError'))) as typeof window.createImageBitmap;
    }
  }, standIn);
}

/** The notifications the page has asked for, oldest first. */
export const notesOf = (page: Page): Promise<RecordedNote[]> => page.evaluate(() => window.__notes ?? []);
