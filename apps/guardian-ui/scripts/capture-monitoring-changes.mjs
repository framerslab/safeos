// Capture the alert and settings in the same browser states on the base and head.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

const [baseUrl, outDir] = process.argv.slice(2);
if (!baseUrl || !outDir) throw new Error('Pass the served site and the picture directory.');
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const failures = [];

function seed() {
  localStorage.setItem('safeos-onboarding', JSON.stringify({ state: {
    isComplete: true, selectedScenario: 'pet',
    acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
  }, version: 0 }));
  localStorage.setItem('guardian-onboarding-complete', 'true');
  localStorage.setItem('safeos-notification-prompt-dismissed', String(Date.now()));
  localStorage.setItem('safeos-pwa-prompt-dismissed', String(Date.now()));
  sessionStorage.setItem('safeos-window-storage', 'kept');
}

async function open(page, route) {
  const response = await page.goto(new URL(route, baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  expect(response?.ok(), route).toBe(true);
  await page.evaluate(() => document.fonts.ready);
}

async function capture(name, view, scheme, walk) {
  const context = await browser.newContext({ viewport: view, colorScheme: scheme, reducedMotion: 'reduce' });
  try {
    await context.addInitScript(seed);
    const page = await context.newPage();
    const target = await walk(page);
    await target.screenshot({
      path: path.join(outDir, `${name}-${view.width}-${scheme}.png`),
      animations: 'disabled',
    });
    console.log(`Captured ${name} at ${view.width} in the ${scheme} look`);
  } catch (error) {
    const captureName = `${name}-${view.width}-${scheme}`;
    failures.push(captureName);
    console.error(`${captureName}: ${error}`);
  } finally {
    await context.close();
  }
}

function camera() {
  localStorage.setItem('safeos-alert-pictures', JSON.stringify({ state: {
    keep: true, deleteAfterDays: 3, noticeAnswered: true, inNotifications: false,
  }, version: 0 }));
  // Maximum Alert's pixel settings, with its other checks off for this walk.
  localStorage.setItem('safeos-settings', JSON.stringify({ state: {
    activePresetId: 'custom',
    globalSettings: {
      id: 'custom', name: 'Maximum Alert', description: 'Maximum Alert',
      motionSensitivity: 80, audioSensitivity: 80, pixelThreshold: 20,
      absolutePixelThreshold: 50, analysisInterval: 5, alertDelay: 30,
      alertVolume: 100, emergencyMode: false, pixelDetectionEnabled: true,
      motionDetectionEnabled: false, audioDetectionEnabled: false,
      processingMode: 'local', useAbsoluteThreshold: false,
    },
    scenarioOverrides: {}, globalMute: true,
  }, version: 0 }));
  navigator.mediaDevices.getUserMedia = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    canvas.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#303d46';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // About three quarters of a 160 × 92 patch changes even when the watch
    // skips frames. That is about 1.2 times the share line at 1280 × 720.
    const patch = ctx.createImageData(160, 92);
    const levels = [0, 85, 170, 255];
    let random = 42;
    const draw = () => {
      for (let i = 0; i < patch.data.length; i += 4) {
        random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
        patch.data.fill(levels[random >>> 30], i, i + 3);
        patch.data[i + 3] = 255;
      }
      ctx.putImageData(patch, 560, 314);
    };
    draw();
    setInterval(draw, 40);
    return canvas.captureStream(25);
  };
}

async function peoplePictures(page) {
  await open(page, '/settings/data/');
  await page.getByText('Nothing saved on this device yet.').waitFor();
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('safeos-guardian');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('intrusion_frame', 'readwrite');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
      const now = Date.now();
      for (let i = 0; i < 130; i++) {
        tx.objectStore('intrusion_frame').put({
          id: `people-picture-${i}`, timestamp: now - i * 60_000, frameData: '', thumbnailData: '',
          personCount: 1, allowedCount: 0, detections: [], acknowledged: false, notes: '', exported: false,
        });
      }
    };
  }));
  await open(page, '/dashboard/');
  await page.getByRole('button', { name: 'Mark all as seen' }).waitFor();
  await open(page, '/settings/data/');
  await page.getByText(/\b(?:100|130) saved pictures\b/).waitFor();
  return page.locator('.set-head');
}

try {
  for (const [view, scheme] of [
    [{ width: 390, height: 844 }, 'dark'],
    [{ width: 1280, height: 900 }, 'light'],
  ]) {
    await capture('wildlife-motion', view, scheme, async (page) => {
      await open(page, '/wildlife/');
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('heading', { name: 'Wildlife Settings' }).waitFor();
      return page.locator('input[type="range"][min="5"][max="50"]').locator('..');
    });

    await capture('picture-change-level', view, scheme, async (page) => {
      await page.addInitScript(camera);
      await open(page, '/monitor/');
      await page.getByRole('button', { name: 'Start watching', exact: true }).click();
      await page.locator('.watch-frame[data-phase="live"]').waitFor({ timeout: 15_000 });
      const card = page.locator('[data-alert-card][data-kind="picture-change"]').first();
      try {
        await card.waitFor({ timeout: 15_000 });
        await card.locator('.alert-picture[data-status="shown"] img').first().waitFor({ timeout: 15_000 });
      } catch (error) {
        const meter = await page.getByRole('meter', { name: 'Picture change level' }).getAttribute('aria-valuetext');
        throw new Error(`Picture change meter reads ${meter ?? 'no value'}: ${error.message}`);
      }
      console.log(`Picture change level: ${await card.getAttribute('data-severity')}`);
      return card;
    });

    await capture('people-picture-count', view, scheme, peoplePictures);

    await capture('detection-pitch', view, scheme, async (page) => {
      await open(page, '/settings/detection/');
      return page.getByRole('heading', { name: 'Audio Frequency Filtering' }).locator('..');
    });

    await capture('watch-audio-settings', view, scheme, async (page) => {
      await open(page, '/monitor/');
      await page.getByRole('button', { name: 'Show settings' }).click();
      const audio = page.getByRole('button', { name: /^Audio Settings/ });
      await audio.click();
      await expect(audio).toHaveAttribute('aria-expanded', 'true');
      return audio.locator('..');
    });

    await capture('spoken-alerts', view, scheme, async (page) => {
      await page.addInitScript(() => {
        window.speechSynthesis.getVoices = () => [
          { name: 'English', lang: 'en-GB', voiceURI: 'online-en', localService: false, default: true },
        ];
      });
      await open(page, '/settings/sounds/');
      await page.getByRole('slider', { name: 'Alert volume' }).waitFor();
      // The voice list is read after the first render.
      await page.locator('#spoken-alert-voice option', { hasText: /\(online\)$/ }).first().waitFor({ state: 'attached' });
      return page.locator('.set-on-page').first();
    });

    await capture('spoken-alerts-no-voice', view, scheme, async (page) => {
      await page.addInitScript(() => {
        window.speechSynthesis.getVoices = () => [];
      });
      await open(page, '/settings/sounds/');
      await page.getByRole('slider', { name: 'Alert volume' }).waitFor();
      await page.getByText('This browser offers no voice, so spoken alerts stay quiet.').waitFor();
      return page.locator('.set-on-page').first();
    });
  }
} finally {
  await browser.close();
}

if (failures.length) throw new Error(`Missing monitoring pictures: ${failures.join(', ')}`);
