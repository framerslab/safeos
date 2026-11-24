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
    const response = await page.goto(new URL('/', baseUrl).href, { waitUntil: 'domcontentloaded' });
    assert.ok(response?.ok(), 'Home must serve the exported page');
    const region = page.getByRole('region', { name: RUNS_NAME, exact: true });
    await region.waitFor({ timeout: 5000 }).catch(() => { throw Error(`${RUNS_NAME} missing`); });
    await waitForPlaying(page);
    const first = await region.locator('video').evaluate((movie) => ({
      time: movie.currentTime, width: movie.videoWidth, muted: movie.muted,
    }));
    assert.ok(first.muted && first.width > 0, 'Dashboard must have a decoded muted video');
    await waitForPlaying(page, first.time);
    console.log('The exported home plays a decoded, muted Dashboard recording');
    return 0;
  } catch (error) {
    console.error(`Home playback: ${error.message}`);
    return 1;
  } finally {
    await context.close();
  }
}
