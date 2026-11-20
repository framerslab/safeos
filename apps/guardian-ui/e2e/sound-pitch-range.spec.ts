/**
 * The sound check reads the pitch range
 *
 * Detection's Custom Range is set to 300 to 3,000 Hz. Chromium's fake
 * microphone plays a tone from a WAV file written here: a 100 Hz tone, under
 * the range, leaves the watch's Audio level near 0; a 1,000 Hz tone at the same
 * loudness, inside it, raises the level. Widened to 20 to 20,000 Hz, the range
 * holds the 1,000 Hz tone as before, and at a sensitivity of 85 the tone alerts.
 *
 * The tone sounds in bursts with soft edges, so the browser's noise
 * suppression, which learns a steady sound as noise, keeps it.
 *
 * @module e2e/sound-pitch-range.spec
 */

import { test, expect, type BrowserType } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { OWN_SETTING, setUpDevice } from './helpers/seeded-device';

const RATE = 48_000;

/** A 16-bit mono WAV file of `hz` in bursts: 400 ms on with 50 ms edges, 200 ms off, for 6 seconds. */
function toneFile(hz: number): string {
  const samples = RATE * 6;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(RATE, 24);
  wav.writeUInt32LE(RATE * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(samples * 2, 40);
  const period = 0.6;
  const on = 0.4;
  const edge = 0.05;
  for (let i = 0; i < samples; i++) {
    const t = i / RATE;
    const inPeriod = t % period;
    let envelope = 0;
    if (inPeriod < on) {
      const fromEdge = Math.min(inPeriod, on - inPeriod);
      envelope = fromEdge >= edge ? 1 : 0.5 - 0.5 * Math.cos((Math.PI * fromEdge) / edge);
    }
    wav.writeInt16LE(Math.round(0.3 * 32767 * envelope * Math.sin(2 * Math.PI * hz * t)), 44 + i * 2);
  }
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'pitch-range-')), `tone-${hz}.wav`);
  writeFileSync(file, wav);
  return file;
}

test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'The fake microphone file is a Chromium switch; the walk runs at desktop width'
);

/** The range and the sound sensitivity a walk sets. */
interface Watch {
  low: number;
  high: number;
  audioSensitivity: number;
}
const NARROW: Watch = { low: 300, high: 3000, audioSensitivity: OWN_SETTING.audioSensitivity };

/**
 * Starts the watch in a browser whose fake microphone plays `hz`, with the
 * range set, and returns the Audio levels it shows over 6 seconds and the
 * number of sound alert cards on the page after them.
 */
async function walk(
  browserType: BrowserType, baseURL: string | undefined, hz: number, watch: Watch = NARROW,
): Promise<{ highest: number; alerts: number }> {
  // Each tone needs its own browser: the fake microphone's file is a launch switch.
  const browser = await browserType.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${toneFile(hz)}`],
  });
  try {
    const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 1000 } });
    await setUpDevice(context, {
      use: 'pet',
      settings: {
        activePresetId: 'custom',
        globalSettings: { ...OWN_SETTING, audioSensitivity: watch.audioSensitivity },
        audioSettings: { frequencyRange: 'custom', customLowFreq: watch.low, customHighFreq: watch.high, backgroundNoiseFilter: true },
      },
    });
    const page = await context.newPage();
    await page.goto('/monitor/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.getByRole('button', { name: 'Start Monitoring', exact: true }).click();
    await expect(page.getByText('LIVE', { exact: true })).toBeVisible({ timeout: 30_000 });

    const level = page.locator('div.uppercase:text-is("Audio") + div.text-xl');
    await expect(level).toBeVisible();
    // The microphone's first second, while the browser starts it, is not read.
    await page.waitForTimeout(1_000);
    const readings: number[] = [];
    for (let i = 0; i < 30; i++) {
      readings.push(Number.parseFloat((await level.textContent()) ?? ''));
      await page.waitForTimeout(200);
    }
    const alerts = await page.locator('p').filter({ hasText: /^Audio detected: \d+%/ }).count();
    console.log(`Audio levels read with a ${hz} Hz tone at ${watch.low} to ${watch.high} Hz: ${readings.join(', ')}; ${alerts} sound alert cards`);
    await page.screenshot({ path: test.info().outputPath(`pitch-range-${hz}hz-${watch.low}-${watch.high}-1280.png`) });
    return { highest: Math.max(...readings.filter(Number.isFinite)), alerts };
  } finally {
    await browser.close();
  }
}

test('a 100 Hz tone, under the range, leaves the Audio level near 0', async ({ playwright, baseURL }) => {
  test.setTimeout(90_000);
  expect((await walk(playwright.chromium, baseURL, 100)).highest).toBeLessThan(5);
});

test('a 1,000 Hz tone, inside the range, raises the Audio level', async ({ playwright, baseURL }) => {
  test.setTimeout(90_000);
  expect((await walk(playwright.chromium, baseURL, 1000)).highest).toBeGreaterThan(10);
});

test('widened to 20 to 20,000 Hz, the range keeps the 1,000 Hz tone\'s level and its alert at a sensitivity of 85', async ({ playwright, baseURL }) => {
  test.setTimeout(150_000);
  const narrow = await walk(playwright.chromium, baseURL, 1000, { ...NARROW, audioSensitivity: 85 });
  const wide = await walk(playwright.chromium, baseURL, 1000, { low: 20, high: 20000, audioSensitivity: 85 });
  // Sensitivity 85 alerts at a level of 15 %: the tone reads 17 to 25 %. A level that falls with the
  // range's width (7 to 9 % at this width, when the level was the mean over the range's bins) stays under it.
  expect(narrow.alerts, 'the tone alerts at 300 to 3,000 Hz').toBeGreaterThan(0);
  // Five runs read the two ranges' highest levels at 25 or 26 %, never more than 1 apart: 3 either way
  // fails a level that falls or swells with the range's width.
  expect(Math.abs(wide.highest - narrow.highest), `the wide range reads the tone as the narrow one does (${narrow.highest} % narrow, ${wide.highest} % wide)`).toBeLessThanOrEqual(3);
  expect(wide.alerts, 'the tone alerts at 20 to 20,000 Hz').toBeGreaterThan(0);
});
