/**
 * Alerts keep coming while the activity goes on.
 *
 * Opens the monitor with a camera whose picture changes on every frame,
 * presses "Start Monitoring" and keeps the change going. The first alert
 * comes after the sustained-detection window; while the change goes on, the
 * next alert of that kind is due once the cooldown has passed since the last
 * one, and not before.
 *
 * The camera is a canvas stream handed to the page in place of
 * getUserMedia's: the page's own motion and pixel detectors read it the way
 * they read a real camera. A part of the picture is redrawn with grey levels
 * 0, 85, 170 and 255 at random every 40 ms. Two samples of the same point
 * differ by 85 or more (over the motion detector's 30 grey-level line) in
 * three samples out of four, so the motion reading is three quarters of the
 * redrawn part, on every sample, with no dip under the line.
 *
 * The times are read inside the page: an observer notes the moment the
 * alert list's count of each kind of card goes up, so the gap between two
 * alerts does not depend on how often the test looks.
 *
 * Run in CI by ci.yml's "Web app alert walk" job against the static export.
 */

import { test, expect, type Page } from '@playwright/test';

type Kind = 'motion' | 'pixel';

declare global {
  interface Window {
    /** When the alert list's count of each kind of card went up (Date.now()). */
    __alertTimes?: Record<Kind, number[]>;
  }
}

interface Camera {
  /** The share of the picture's width that changes, from the left edge (0 to 1). */
  changingWidth: number;
}

interface Seed {
  /** The persisted settings to start from (merged over the store's defaults). */
  settings: Record<string, unknown> | null;
  camera: Camera;
}

// The Custom preset with pixel detection and sound detection off: only the
// motion detector raises alerts. Motion line 20 % (sensitivity 80).
const MOTION_ONLY = {
  activePresetId: 'custom',
  globalSettings: {
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
  },
};

// The store's timing defaults, with the time between repeated alerts for one
// event at its settings slider's lowest value.
const REPEAT_EVERY_10_S = {
  cooldownPeriod: 10,
  minimumMotionDuration: 500,
  emergencyEscalationDelay: 300,
};

async function openMonitor(page: Page, seed: Seed): Promise<void> {
  await page.addInitScript((s: Seed) => {
    localStorage.setItem('safeos-onboarding', JSON.stringify({ state: {
      isComplete: true, selectedScenario: 'pet',
      acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
    }, version: 0 }));
    localStorage.setItem('guardian-onboarding-complete', 'true');
    if (s.settings) {
      localStorage.setItem('safeos-settings', JSON.stringify({ state: s.settings, version: 0 }));
    }
    localStorage.setItem('safeos-notification-prompt-dismissed', String(Date.now()));
    localStorage.setItem('safeos-pwa-prompt-dismissed', String(Date.now()));

    // An alert card's message line starts with its kind; the screen-reader
    // summary starts "New ..." and is not counted.
    const times: Record<Kind, number[]> = { motion: [], pixel: [] };
    window.__alertTimes = times;
    const KINDS: Array<[Kind, RegExp]> = [
      ['motion', /^Motion detected: \d+%/],
      ['pixel', /^Pixel movement detected/],
    ];
    const count = () => {
      const lines = Array.from(document.querySelectorAll('p'), (p) => p.textContent || '');
      for (const [kind, pattern] of KINDS) {
        const shown = lines.filter((line) => pattern.test(line)).length;
        while (times[kind].length < shown) times[kind].push(Date.now());
      }
    };
    new MutationObserver(count).observe(document, { childList: true, subtree: true, characterData: true });

    const W = 320;
    const H = 240;
    const LEVELS = [0, 85, 170, 255];
    navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      canvas.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px';
      document.body.appendChild(canvas);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context for the test camera');
      const image = ctx.createImageData(W, H);
      const changing = Math.round(W * s.camera.changingWidth);
      const draw = () => {
        const d = image.data;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            const v = x < changing ? LEVELS[Math.floor(Math.random() * 4)] : 128;
            d[i] = v;
            d[i + 1] = v;
            d[i + 2] = v;
            d[i + 3] = 255;
          }
        }
        ctx.putImageData(image, 0, 0);
      };
      draw();
      setInterval(draw, 40);
      const stream = canvas.captureStream(25);
      if (constraints && constraints.audio) {
        // A silent microphone: the sound detector reads nothing.
        const audio = new AudioContext();
        const silent = audio.createMediaStreamDestination();
        for (const track of silent.stream.getAudioTracks()) stream.addTrack(track);
      }
      return stream;
    };
  }, seed);

  await page.goto('/monitor/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Start Monitoring', exact: true }).click();
  await expect(page.getByText('LIVE', { exact: true })).toBeVisible({ timeout: 30_000 });
}

/**
 * Waits for the first alert of `kind`, then lets the page run until
 * `cooldownMs + slackMs` after it. Returns how many milliseconds after the
 * first alert each later one appeared.
 */
async function laterAlerts(page: Page, kind: Kind, cooldownMs: number, slackMs: number): Promise<number[]> {
  await expect
    .poll(() => page.evaluate((k) => window.__alertTimes?.[k].length ?? 0, kind), { timeout: 60_000 })
    .toBeGreaterThanOrEqual(1);
  const first = await page.evaluate((k) => window.__alertTimes![k][0], kind);
  await page.waitForFunction(
    ([at, wait]) => Date.now() >= at + wait,
    [first, cooldownMs + slackMs],
    { polling: 250, timeout: cooldownMs + slackMs + 30_000 },
  );
  const all = await page.evaluate((k) => window.__alertTimes![k], kind);
  return all.slice(1).map((t) => t - first);
}

const motionCards = (page: Page) => page.locator('p', { hasText: /^Motion detected: \d+%/ });

// The page draws the first alert's card while it is busiest (the list's first
// render, the sounds), so a later card may be drawn a little sooner after its
// alert than the first was; it has this long to arrive.
const EARLY_MS = 750;
const LATE_MS = 6_000;

// The page lists the browser's cameras before it asks for one; the fake
// device gives it one to list. The stream itself comes from the canvas.
test.use({
  permissions: ['camera', 'microphone'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
});

test.describe('Alerts repeat while the activity goes on', () => {
  test('a low motion alert comes again once its 10 s cooldown has passed, and not before', async ({ page }) => {
    test.setTimeout(120_000);
    // A third of the width changes: a motion reading of 25 % on a 20 % line,
    // 5 points over it, which is a low alert (cooldown 10 s by default).
    await openMonitor(page, { settings: MOTION_ONLY, camera: { changingWidth: 1 / 3 } });
    const later = await laterAlerts(page, 'motion', 10_000, LATE_MS);
    await expect(motionCards(page).first()).toHaveText(/^Motion detected: 2\d% \(threshold: 20%/);

    expect(later.length, `a second motion alert while the motion went on (seen at ${JSON.stringify(later)} ms)`).toBeGreaterThanOrEqual(1);
    expect(later[0], 'the second motion alert waited for the low cooldown').toBeGreaterThanOrEqual(10_000 - EARLY_MS);
    expect(later[0]).toBeLessThanOrEqual(10_000 + LATE_MS);
  });

  test('a critical motion alert, whose cooldown is 0, comes again at the repeat period, and not before', async ({ page }) => {
    test.setTimeout(120_000);
    // The whole picture changes: a reading of 75 % on a 20 % line, a
    // critical alert. Its cooldown is 0, so one event repeats at the
    // "Cooldown Period" setting (10 s here), not on every sample.
    await openMonitor(page, {
      settings: { ...MOTION_ONLY, timingSettings: REPEAT_EVERY_10_S },
      camera: { changingWidth: 1 },
    });
    const later = await laterAlerts(page, 'motion', 10_000, LATE_MS);
    await expect(motionCards(page).first()).toHaveText(/^Motion detected: [6-9]\d% \(threshold: 20%/);

    expect(later.length, `a second motion alert while the motion went on (seen at ${JSON.stringify(later)} ms)`).toBeGreaterThanOrEqual(1);
    expect(later[0], 'the second motion alert waited for the repeat period').toBeGreaterThanOrEqual(10_000 - EARLY_MS);
    expect(later[0]).toBeLessThanOrEqual(10_000 + LATE_MS);
  });

  test('on the default preset a pixel alert comes again at the repeat period while the picture keeps changing', async ({ page }) => {
    test.setTimeout(120_000);
    // The default preset (Maximum Alert) has pixel detection on with a 50 px
    // line. Three quarters of the whole picture changes on every frame, far
    // over ten times the line: a critical pixel alert, cooldown 0.
    await openMonitor(page, {
      settings: { timingSettings: REPEAT_EVERY_10_S },
      camera: { changingWidth: 1 },
    });
    const later = await laterAlerts(page, 'pixel', 10_000, LATE_MS);

    expect(later.length, `a second pixel alert while the picture kept changing (seen at ${JSON.stringify(later)} ms)`).toBeGreaterThanOrEqual(1);
    expect(later[0], 'the second pixel alert waited for the repeat period').toBeGreaterThanOrEqual(10_000 - EARLY_MS);
    expect(later[0]).toBeLessThanOrEqual(10_000 + LATE_MS);
  });
});
