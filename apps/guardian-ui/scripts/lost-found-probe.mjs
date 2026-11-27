// Checks that the Lost and Found watch, at the app's default settings, alerts
// on the home page's sample clip, once for each set of the example's photos.
//
//   node scripts/lost-found-probe.mjs <base-url> <out-dir> <clip.y4m> <clip.wav>
//
// The Pictures workflow's "Capture the home page pictures" job runs it after
// the home captures, on the same built site and the same fake camera files.
// For each set it starts Chromium with the fake camera fed from the clip,
// seeds a finished setup at 1280 by 1000 in the dark look, enrols "Toffee"
// through /lost-found/ with the set's 1200 px photos from
// public/home/lost-found/photos.json, starts the watch and reads what it kept
// every 2 s for 85 s (three plays of the 28.2 s clip). It sets no Lost and
// Found setting: the ones it logs are read from the device's storage.
//
// Set A is the three photos. Set B is photo 1 alone, the photo taken on
// another day, which the home page's Lost and Found run enrols: photos 2 and 3
// are stills from the recording the clip comes from.
//
// An alert is a saved frame the watch raised the alert for (read by its score
// against the alert line where the build keeps no mark), or a sighting the
// watch kept, inside the 85 s (scripts/lost-found-verdict.mjs). The result goes to <out-dir>/lost-found-probe.json.
// It exits 1 when the watch does not alert for a set, when the camera does not start or
// has stopped or paused by the end of a watch, and when any step fails, with a picture of the whole page,
// failed-lost-found-probe-<set>.png.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { judgeWatch } from './lost-found-verdict.mjs';
import { enrol, readWatch, seededContext, startWatch, watchPhase } from './lost-found-walk.mjs';

const [baseUrl, outDir, videoFile, audioFile] = process.argv.slice(2);
if (!baseUrl || !outDir || !videoFile || !audioFile) {
  console.error('usage: lost-found-probe.mjs <base-url> <out-dir> <clip.y4m> <clip.wav>');
  process.exit(2);
}

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(APP_ROOT, 'public');
const NAME = 'Toffee';
const WATCH_MS = 85_000;
const READ_EVERY_MS = 2_000;
// The watch saves a frame after it makes the frame's thumbnail, so a frame
// from the last moments of the watch is read once more after this wait.
const SETTLE_MS = 3_000;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const seconds = (ms) => Math.round(ms / 100) / 10;
const whole = (value) => (typeof value === 'number' ? Math.round(value) : 'none');
const terms = (entry) =>
  `colour ${whole(entry.colour)}, main colours ${whole(entry.mainColours)}, edges ${whole(entry.edges)}, size ${whole(entry.size)}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const record = JSON.parse(await readFile(path.join(PUBLIC, 'home', 'lost-found', 'photos.json'), 'utf8'));
const clipDigest = sha256(await readFile(path.join(PUBLIC, 'home', 'sample-clip.mp4')));
// The sets of photos the probe tries, each on its own browser and device.
const SETS = [
  { set: 'A', photos: record.photos },
  { set: 'B', photos: record.photos.slice(0, 1) },
];

await mkdir(outDir, { recursive: true });

/** Enrols the set's photos, watches the clip for 85 s and returns what the watch kept, judged. */
async function probe({ set, photos: entries }) {
  const photos = entries.map((photo) => path.join(PUBLIC, photo.file));
  const photoDigests = await Promise.all(photos.map(async (file) => sha256(await readFile(file))));
  const say = (line) => console.log(`probe ${set}: ${line}`);
  const browser = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${path.resolve(videoFile)}`,
      `--use-file-for-fake-audio-capture=${path.resolve(audioFile)}`,
    ],
  });
  let page;
  try {
    const context = await seededContext(browser, { viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1, colorScheme: 'dark' });
    page = await context.newPage();

    await enrol(page, baseUrl, { name: NAME, photos });
    say(`enrolled ${NAME} with ${photos.length} ${photos.length === 1 ? 'photo' : 'photos'} (${entries.map((photo) => path.basename(photo.file)).join(', ')})`);

    const liveAt = await startWatch(page);
    const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('safeos-lost-found') || '{}').state?.settings ?? null);
    if (!settings) throw new Error('the device holds no Lost and Found settings');
    const alertLine = settings.minConfidenceForAlert;
    const saveLine = settings.minConfidenceForRecord;
    const colourSensitivity = settings.colorSensitivity;
    say(`watch live; alert line ${alertLine}, save line ${saveLine}, colour sensitivity ${colourSensitivity}`);

    let watch = { saved: [], sightings: [] };
    while (Date.now() - liveAt < WATCH_MS) {
      await sleep(READ_EVERY_MS);
      watch = await readWatch(page);
    }
    await sleep(SETTLE_MS);
    watch = await readWatch(page);
    const phase = await watchPhase(page);
    if (phase === 'paused') throw new Error('the camera was paused at the end of the watch');
    if (phase !== 'live') throw new Error(`the camera stopped during the watch (the frame shows ${phase})`);

    const { saved, sightings, overLine, alerting, firstSaved, firstAlert, best, alerted } = judgeWatch({
      ...watch,
      liveAt,
      watchMs: WATCH_MS,
      alertLine,
    });
    const firstSaveSeconds = firstSaved ? seconds(firstSaved.at - liveAt) : null;
    const firstAlertSeconds = firstAlert ? seconds(firstAlert.at - liveAt) : null;

    if (firstSaved) {
      say(`first frame saved at ${firstSaveSeconds} s, score ${whole(firstSaved.score)}`);
    } else if (sightings.length > 0) {
      say('this build keeps no frame under the alert line');
    } else {
      say(`no frame reached the save line in ${WATCH_MS / 1000} s`);
    }
    if (firstAlert) {
      const score = firstAlert.kind === 'saved frame' ? `score ${whole(firstAlert.score)}` : 'a sighting, its score not kept';
      const region = firstAlert.region
        ? `, region x ${whole(firstAlert.region.x)} y ${whole(firstAlert.region.y)}, ${whole(firstAlert.region.width)} by ${whole(firstAlert.region.height)}`
        : '';
      say(`first alert at ${firstAlertSeconds} s, ${score} (${terms(firstAlert)})${region}`);
    }
    if (best) {
      say(`best score ${whole(best.score)} (${terms(best)})`);
    } else {
      say('no best score, the watch saved no frame');
    }
    say(`${saved.length} frames saved, ${overLine} at or over the alert line, ${alerting} alerted${sightings.length > 0 ? `; ${sightings.length} sightings kept, at ${sightings.map((entry) => seconds(entry.at - liveAt)).join(', ')} s` : ''}`);
    say(alerted ? 'verdict: alerts' : `verdict: no alert in ${WATCH_MS / 1000} s`);

    const result = {
      set,
      run: process.env.CAPTURE_RUN ?? null,
      commit: process.env.CAPTURE_COMMIT ?? null,
      alertLine,
      saveLine,
      colourSensitivity,
      saved: saved.length,
      sightings: sightings.length,
      alerted,
      firstSaveSeconds,
      firstAlertSeconds,
      best: best ? { score: best.score, colour: best.colour, mainColours: best.mainColours, edges: best.edges, size: best.size } : null,
      firstAlert,
      photos: photoDigests,
      clip: clipDigest,
    };
    if (!alerted) {
      await page.screenshot({ path: path.join(outDir, `failed-lost-found-probe-${set}.png`), fullPage: true }).catch(() => {});
    }
    return result;
  } catch (err) {
    console.error(`probe ${set}: failed: ${err.message}`);
    if (page) await page.screenshot({ path: path.join(outDir, `failed-lost-found-probe-${set}.png`), fullPage: true }).catch(() => {});
    return { set, failed: err.message, alerted: false, photos: photoDigests, clip: clipDigest };
  } finally {
    await browser.close();
  }
}

// Every set runs, so a set that fails still leaves the others' results.
const results = [];
for (const entry of SETS) results.push(await probe(entry));
await writeFile(path.join(outDir, 'lost-found-probe.json'), `${JSON.stringify({ sets: results }, null, 2)}\n`);
console.log('saved lost-found-probe.json');
const missed = results.filter((result) => !result.alerted).map(({ set }) => set);
if (missed.length) console.error(`probe: no alert for set ${missed.join(' and ')}`);
process.exit(missed.length ? 1 : 0);
