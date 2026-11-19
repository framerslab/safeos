/**
 * Nap Mode opens the watch
 *
 * Walks /nap/ in Chromium with its fake camera: the warning with its planned
 * duration, the check of the camera, motion and sound, then Start Nap Mode.
 * The address becomes /monitor/, the saved settings hold the infant_sleep
 * preset, the watch starts with no second press, and the fake camera's moving
 * picture raises a pixel alert there, so Motion and sound does the watching,
 * and a reload finds the nap, which watches again after one tap. A second walk reads the
 * warning quiet hours bring, and ends a nap whose camera the browser refuses.
 *
 * @module e2e/nap-opens-the-watch.spec
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test';

test.use({
  viewport: { width: 1280, height: 1000 },
  launchOptions: {
    // The headless browser has no prompt to answer a camera request; the fake prompt grants it.
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
});

test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'The fake camera is a Chromium switch; the walk runs at desktop width'
);

/** A device that has finished setup, with the camera and microphone allowed. */
async function setUpDevice(context: BrowserContext) {
  await context.grantPermissions(['camera', 'microphone']);
  await context.addInitScript(() => {
    localStorage.setItem('safeos-onboarding', JSON.stringify({ state: {
      isComplete: true, selectedScenario: 'baby',
      acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
    }, version: 0 }));
    localStorage.setItem('guardian-onboarding-complete', 'true');
    localStorage.setItem('safeos-notification-prompt-dismissed', String(Date.now()));
    localStorage.setItem('safeos-pwa-prompt-dismissed', String(Date.now()));
  });
}

/** From the nap page's notice through the three checks, to the enabled last key. */
async function passChecks(page: Page) {
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Continue to Pre-Nap Test', exact: true }).click();

  // The camera check; the motion check starts by itself and passes on lasting change or after 300 frames.
  await page.getByRole('button', { name: 'Start', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toHaveCount(1, { timeout: 30_000 });
  // The sound check.
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const start = page.getByRole('button', { name: 'Start Nap Mode', exact: true });
  await expect(start).toBeEnabled({ timeout: 15_000 });
  return start;
}

test('Start Nap Mode opens Motion and sound with the infant_sleep preset', async ({ page, context }) => {
  test.setTimeout(120_000);
  await setUpDevice(context);

  await page.goto('/nap/', { waitUntil: 'networkidle', timeout: 60_000 });
  // The planned duration stays: the watch reminds when it has passed.
  await expect(page.getByRole('slider')).toHaveCount(1);
  // One step down from 30 minutes, by the keyboard as a person moves it.
  await page.getByRole('slider').press('ArrowLeft');
  await expect(page.getByText('Planned nap duration: 15 minutes')).toBeVisible();
  await (await passChecks(page)).click();

  await expect(page).toHaveURL(/\/monitor\/?$/, { timeout: 30_000 });
  const preset = await page.evaluate(() => JSON.parse(localStorage.getItem('safeos-settings') || '{}')?.state?.activePresetId);
  expect(preset).toBe('infant_sleep');

  // The watch starts on arrival, with no second press.
  await expect(page.getByRole('button', { name: /^(Stop Monitoring|Cancel Starting)$/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Start Monitoring', exact: true })).toHaveCount(0);
  // Chromium's fake camera shows a moving picture, so the Nap preset's pixel check alerts.
  await expect(page.getByText(/^Picture change at /).first()).toBeVisible({ timeout: 45_000 });
  // The watch as it runs after Start Nap Mode, kept as the pull request's picture.
  await page.screenshot({ path: test.info().outputPath('nap-watch-1280.png') });

  // A reload finds the nap, with its planned minutes, and waits for a tap, which
  // turns the browser's sound on, before it watches again.
  await page.reload({ waitUntil: 'domcontentloaded' });
  const resume = page.getByRole('button', { name: 'Resume nap', exact: true });
  await expect(resume).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => window.history.state?.safeosNap?.minutes)).toBe(15);
  await page.screenshot({ path: test.info().outputPath('nap-resume-1280.png') });
  await resume.click();
  // The camera runs again: the key reads Stop Monitoring and the Stream tile reads Active.
  await expect(page.getByRole('button', { name: 'Stop Monitoring', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Stream', { exact: true }).locator('xpath=following-sibling::div[1]')).toHaveText('Active', { timeout: 30_000 });
});

test('says when quiet hours will silence a nap, and End nap ends a nap whose camera failed', async ({ page, context }) => {
  test.setTimeout(120_000);
  await setUpDevice(context);
  await context.addInitScript(() => {
    // Silent quiet hours from an hour ago to an hour from now, every day.
    const clock = (minutes: number) => {
      const at = new Date(Date.now() + minutes * 60_000);
      return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
    };
    localStorage.setItem('safeos-settings', JSON.stringify({ state: {
      quietHoursSettings: {
        enabled: true, startTime: clock(-60), endTime: clock(60), days: [0, 1, 2, 3, 4, 5, 6], mode: 'silent', reducedVolume: 30,
      },
    }, version: 0 }));
  });

  await page.goto('/nap/', { waitUntil: 'networkidle', timeout: 60_000 });
  await passChecks(page);
  await expect(page.getByText(/this nap's alerts will be silent/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('nap-quiet-hours-1280.png') });

  // The monitor opened for a nap with a camera the browser refuses.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Blocked', 'NotAllowedError'));
  });
  await page.evaluate(() => sessionStorage.setItem('safeos-nap-handoff', JSON.stringify({ minutes: 15, at: Date.now() })));
  await page.goto('/monitor/', { waitUntil: 'networkidle', timeout: 60_000 });
  const endNap = page.getByRole('button', { name: 'End nap', exact: true });
  await expect(endNap).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Start Monitoring', exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('nap-camera-failed-1280.png') });
  await endNap.click();
  await expect(endNap).toHaveCount(0);
});

test('Test Alerts says the Emergency sound plays at full volume', async ({ page, context }) => {
  test.setTimeout(60_000);
  await setUpDevice(context);
  await page.goto('/settings/test-alerts/', { waitUntil: 'networkidle', timeout: 60_000 });
  const sounds = page.getByRole('heading', { name: 'Sound Tests' }).locator('..');
  await expect(sounds.getByText('Always full volume')).toBeVisible();
  await sounds.screenshot({ path: test.info().outputPath('test-alerts-sounds-1280.png') });
});
