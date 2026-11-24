import assert from 'node:assert/strict';

export const RUNS_NAME = 'Recorded runs of SafeOS Guardian';
const PLAYER = 'section[aria-label="Recorded runs of SafeOS Guardian"]';

export async function waitForPlaying(page, after = 0) {
  await page.waitForFunction(({ selector, after }) => {
    const movie = document.querySelector(`${selector} video`);
    return movie?.readyState >= 2 && movie.currentTime > after && !movie.paused;
  }, { selector: PLAYER, after }, { timeout: 5000 });
}

export async function checkHomeRuns(browser, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
    serviceWorkers: 'block',
  });
  try {
    const page = await context.newPage();
    await page.mouse.move(0, 0);
    const dashboard = '/home/runs/dashboard-wide-dark.mp4';
    const requested = page.waitForResponse((response) => response.url() === new URL(dashboard, baseUrl).href
      && [200, 206].includes(response.status()), { timeout: 15000 });
    const response = await page.goto(new URL('/', baseUrl).href, { waitUntil: 'domcontentloaded' });
    assert.ok(response?.ok(), 'Home must serve the exported page');
    const region = page.getByRole('region', { name: RUNS_NAME, exact: true });
    await region.waitFor({ timeout: 5000 }).catch(() => { throw Error(`${RUNS_NAME} missing`); });
    await requested;
    await waitForPlaying(page);
    const first = await region.locator('video').evaluate((movie) => ({
      time: movie.currentTime, width: movie.videoWidth, muted: movie.muted, source: movie.currentSrc,
    }));
    assert.ok(first.muted && first.width > 0, 'Dashboard must have a decoded muted video');
    assert.equal(first.source, new URL(dashboard, baseUrl).href);
    await waitForPlaying(page, first.time);
    const video = region.locator('video');
    await region.getByRole('button', { name: 'Pause the recordings' }).click();
    const held = await video.evaluate((movie) => movie.currentTime);
    await page.waitForTimeout(300);
    assert.equal(await video.evaluate((movie) => movie.currentTime), held, 'Pause must keep the current frame');
    await region.getByRole('button', { name: 'Play the recordings' }).click();
    await page.mouse.move(0, 0);
    await page.locator('h1').click({ position: { x: 0, y: 2 } });
    await region.locator('[data-run="watching"][aria-current="step"]').waitFor({ timeout: 16000 });
    await waitForPlaying(page);
    assert.match(await video.evaluate((movie) => movie.currentSrc), /watching-wide-dark\.mp4$/);

    console.log('The exported home plays muted Dashboard video, freezes on Pause, and advances to Watching');
    return 0;
  } catch (error) {
    console.error(`Home playback: ${error.message}`);
    return 1;
  } finally {
    await context.close();
  }
}
