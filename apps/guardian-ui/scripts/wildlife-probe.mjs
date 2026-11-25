// Taps the Wildlife page's canvas reads and completed inferences while it
// watches the sample clip. The camera, timer, gate and model all run normally.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';

function instrument() {
  const sources = new WeakMap();
  const reads = [];
  const inferences = [];
  let clipStart = null;
  const note = () => {
    const saved = JSON.parse(localStorage.getItem('safeos-animal-alerts') ?? 'null');
    const cats = (saved?.state?.detectionHistory ?? []).filter((entry) => entry.type === 'cat');
    const firstCat = Math.min(...cats.map((entry) => entry.timestamp));
    return {
      frameReads: reads.length,
      inferences,
      catSecond: clipStart !== null && Number.isFinite(firstCat)
        ? Math.round((firstCat - clipStart) / 10) / 100
        : null,
    };
  };
  window.wildlifeProbe = note;

  const drawImage = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (source, ...args) {
    const value = drawImage.call(this, source, ...args);
    if (source instanceof HTMLVideoElement && this.canvas.width === 320 && this.canvas.height === 240
      && args.length === 4 && source.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      clipStart ??= Date.now() - source.currentTime * 1000;
      sources.set(this.canvas, Number(source.currentTime.toFixed(2)));
    }
    return value;
  };
  const read = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function (...args) {
    const pixels = read.apply(this, args);
    const second = sources.get(this.canvas);
    if (second !== undefined) reads.push(second);
    return pixels;
  };
  const encode = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (...args) {
    const second = sources.get(this);
    // Wildlife encodes this canvas only after the gate opens and model.detect
    // resolves, including when the model returns no animals. A hit may encode
    // the same frame again for its history picture.
    if (second !== undefined && inferences.at(-1) !== second) inferences.push(second);
    return encode.apply(this, args);
  };
}

export async function probeWildlife({ context, baseUrl, modelHost, outDir, seed, settings }) {
  const attempts = [];
  await mkdir(outDir, { recursive: true });
  for (const attempt of [1, 2]) {
    const page = await context.newPage();
    let result;
    try {
      await page.route((url) => url.host === modelHost, (route) => route.abort());
      await page.addInitScript(seed, settings);
      await page.addInitScript(() => {
        localStorage.setItem('safeos-detection-model-consent', '1');
        localStorage.removeItem('safeos-animal-alerts');
        localStorage.removeItem('safeos-tab-watch');
      });
      await page.addInitScript(instrument);
      await page.goto(new URL('/wildlife/', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
      const start = page.getByRole('button', { name: 'Start Monitoring' });
      await expect(start).toBeEnabled({ timeout: 90_000 });
      await start.click();
      // The clip is 28.2 seconds long. Let the timer see the full first play.
      await page.waitForFunction(() => document.querySelector('video')?.currentTime >= 30, null, { timeout: 65_000 });
      result = await page.evaluate(() => window.wildlifeProbe());
      if (result.catSecond !== null) {
        await page.getByText('Cat', { exact: true }).first().waitFor();
        await page.screenshot({ path: path.join(outDir, `wildlife-cat-${attempt}.png`) });
      }
      await page.getByRole('button', { name: 'Stop Monitoring' }).click();
    } catch (error) {
      result = { ...result, error: String(error).split('\n')[0] };
      await page.screenshot({ path: path.join(outDir, `wildlife-error-${attempt}.png`) }).catch(() => undefined);
    } finally {
      await page.close();
    }
    attempts.push({ attempt, ...result });
  }
  const report = { attempts };
  await writeFile(path.join(outDir, 'wildlife-probe.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wildlife on the sample clip: ${JSON.stringify(report)}`);
  return report;
}
