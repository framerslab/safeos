/**
 * Set times apply
 *
 * A set time on Quiet hours puts the Night setting on at 22:00 every day. The
 * browser's clock starts at 21:59 with the watch open on its own setting, then
 * runs past 22:00: the watch's setting becomes Night.
 *
 * @module e2e/set-times-apply.spec
 */

import { test, expect, type Page } from '@playwright/test';
import { setUpDevice } from './helpers/seeded-device';

test.use({ viewport: { width: 1280, height: 1000 }, timezoneId: 'UTC' });

test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'The walk runs in Chromium at desktop width'
);

const EVERY_DAY = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** The setting the watch runs at, as saved; a device that saved none runs at Maximum Alert. */
const savedSetting = (page: Page): Promise<string> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('safeos-settings') || '{}')?.state?.activePresetId ?? 'maximum');

test('a set time of Night at 22:00 makes the watch run at Night at 22:00', async ({ page, context }) => {
  test.setTimeout(90_000);
  await page.clock.install({ time: new Date('2026-11-18T21:59:00Z') });
  await setUpDevice(context, {
    use: 'baby',
    schedules: {
      schedulingEnabled: true,
      schedules: [{
        id: 'sched_night', name: 'Night', enabled: true, preset: 'night', days: EVERY_DAY,
        timeSlot: { start: '22:00', end: '06:00' }, priority: 10,
        createdAt: '2026-11-18T12:00:00.000Z', updatedAt: '2026-11-18T12:00:00.000Z',
      }],
    },
  });

  await page.goto('/monitor/', { waitUntil: 'networkidle', timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Start watching', exact: true })).toBeVisible({ timeout: 30_000 });
  expect(await savedSetting(page)).toBe('maximum');

  // 22:00 and a little past: the check runs once a minute.
  await page.clock.fastForward('01:30');
  await expect.poll(() => savedSetting(page), { timeout: 15_000 }).toBe('night');
  await expect(page.getByText('Night Mode', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('set-time-night-1280.png') });
});

const NIGHT_EVERY_DAY = {
  schedulingEnabled: true,
  schedules: [{
    id: 'sched_night', name: 'Night', enabled: true, preset: 'night', days: EVERY_DAY,
    timeSlot: { start: '22:00', end: '06:00' }, priority: 10,
    createdAt: '2026-11-18T12:00:00.000Z', updatedAt: '2026-11-18T12:00:00.000Z',
  }],
};

/** A value of the saved setting the watch runs at. */
const savedValue = (page: Page, key: string): Promise<unknown> =>
  page.evaluate((k) => JSON.parse(localStorage.getItem('safeos-settings') || '{}')?.state?.globalSettings?.[k], key);

test('a set time made with the form as it opens puts on a whole setting', async ({ page, context }) => {
  test.setTimeout(90_000);
  // A Wednesday at noon: inside the form's first hours, 09:00 to 17:00 on weekdays.
  await page.clock.install({ time: new Date('2026-11-18T12:00:00Z') });
  await setUpDevice(context, { use: 'baby' });

  await page.goto('/settings/schedule/', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('button', { name: 'Create Schedule', exact: true }).click();
  await page.getByPlaceholder('e.g., Night Watch').fill('Work');
  await page.getByRole('button', { name: 'Save Schedule', exact: true }).click();
  await page.clock.fastForward('01:10');

  await page.goto('/monitor/', { waitUntil: 'networkidle', timeout: 60_000 });
  await expect.poll(() => savedValue(page, 'motionSensitivity'), { timeout: 15_000 }).toBe(80);
  await expect(page.getByText(/^Motion: 80% \| Audio: 80%/)).toBeVisible();
});

test("a set time in force when the app opens is put on after the person's saved preferences are read", async ({ page, context }) => {
  test.setTimeout(90_000);
  await page.clock.install({ time: new Date('2026-11-18T23:00:00Z') });
  await setUpDevice(context, { use: 'baby', schedules: NIGHT_EVERY_DAY });
  // Preferences an earlier version saved on this browser, read once when the app opens.
  await context.addInitScript(() => {
    if (!localStorage.getItem('safeos-settings')) {
      localStorage.setItem('safeos_user_settings', JSON.stringify({
        preferences: { motionSensitivity: 0.3, audioSensitivity: 0.3, alertVolume: 0.5 },
      }));
    }
  });

  await page.goto('/monitor/', { waitUntil: 'networkidle', timeout: 60_000 });
  await expect.poll(() => savedSetting(page), { timeout: 15_000 }).toBe('night');
  // Night's own values: motion 40.
  await expect.poll(() => savedValue(page, 'motionSensitivity'), { timeout: 15_000 }).toBe(40);
});

test('editing the setting of a set time in force puts the new setting on', async ({ page, context }) => {
  test.setTimeout(90_000);
  await page.clock.install({ time: new Date('2026-11-18T23:00:00Z') });
  await setUpDevice(context, { use: 'baby', schedules: NIGHT_EVERY_DAY });

  await page.goto('/settings/schedule/', { waitUntil: 'networkidle', timeout: 60_000 });
  await expect.poll(() => savedSetting(page), { timeout: 15_000 }).toBe('night');
  await page.getByRole('button', { name: 'Edit schedule' }).click();
  await page.locator('select').last().selectOption('silent');
  await page.getByRole('button', { name: 'Save Schedule', exact: true }).click();
  await page.clock.fastForward('01:10');
  await expect.poll(() => savedSetting(page), { timeout: 15_000 }).toBe('silent');
});

test("the person's own setting during a set time stays after a reload", async ({ page, context }) => {
  test.setTimeout(90_000);
  await page.clock.install({ time: new Date('2026-11-18T23:00:00Z') });
  await setUpDevice(context, { use: 'baby', schedules: NIGHT_EVERY_DAY });

  await page.goto('/monitor/', { waitUntil: 'networkidle', timeout: 60_000 });
  await expect.poll(() => savedSetting(page), { timeout: 15_000 }).toBe('night');
  await page.getByRole('button', { name: 'Select Security Mode' }).click();
  await page.getByRole('button', { name: /^Maximum Alert/ }).click();
  await expect.poll(() => savedSetting(page)).toBe('maximum');

  await page.reload({ waitUntil: 'networkidle' });
  await page.clock.fastForward('01:10');
  await expect(page.getByRole('button', { name: 'Start watching', exact: true })).toBeVisible({ timeout: 30_000 });
  expect(await savedSetting(page)).toBe('maximum');
});

/** The browser's saved sessions: the account set-up restores on the next visit. */
const savedSessions = (page: Page): Promise<number> =>
  page.evaluate(async () => {
    // Opened only once the app has made it: an open of a database that does not exist makes an empty one.
    if (!(await indexedDB.databases()).some((database) => database.name === 'safeos-guardian')) return 0;
    return new Promise<number>((resolve) => {
      const opening = indexedDB.open('safeos-guardian');
      opening.onerror = () => resolve(0);
      opening.onsuccess = () => {
        const database = opening.result;
        if (!database.objectStoreNames.contains('local_session')) { database.close(); resolve(0); return; }
        const counting = database.transaction('local_session').objectStore('local_session').count();
        counting.onsuccess = () => { database.close(); resolve(counting.result); };
        counting.onerror = () => { database.close(); resolve(0); };
      };
    });
  });

/** Where the saved settings last imported preferences from: an account, the browser, or nowhere yet. */
const settingsSource = (page: Page): Promise<string | null> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('safeos-settings') || '{}')?.state?.settingsSourceId ?? null);

/**
 * A monitoring server's address the person saved in the app, where nothing
 * answers. With an address saved, the watch starts a session; with no answer,
 * the session and its account are this browser's own.
 */
const SERVER_WITH_NO_ANSWER = { apiUrl: 'http://127.0.0.1:4174', wsUrl: 'ws://127.0.0.1:4174', configured: true };

test("a set time in force is put on over the preferences an account brings when it is restored", async ({ page, context }) => {
  test.setTimeout(120_000);
  // 21:00: the night set time is not in force. The first visit to the watch makes the browser's account.
  await page.clock.install({ time: new Date('2026-11-18T21:00:00Z') });
  await setUpDevice(context, { use: 'baby', schedules: NIGHT_EVERY_DAY });
  await context.addInitScript((server) => {
    if (!localStorage.getItem('safeos_backend_config')) localStorage.setItem('safeos_backend_config', JSON.stringify(server));
  }, SERVER_WITH_NO_ANSWER);
  await page.goto('/monitor/', { waitUntil: 'networkidle', timeout: 60_000 });
  await expect.poll(() => savedSessions(page), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect.poll(() => settingsSource(page), { timeout: 15_000 }).toMatch(/^account:/);
  expect(await savedSetting(page)).toBe('maximum');

  // The account holds sensitivities and a volume an earlier version saved, which this browser has
  // not imported. They are written from a page the app does not run on, so nothing saves over them.
  await page.goto('/manifest.json', { timeout: 60_000 });
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const preferences = { motionSensitivity: 0.3, audioSensitivity: 0.3, alertVolume: 0.5, theme: 'dark' };
    const opening = indexedDB.open('safeos-guardian');
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const database = opening.result;
      const writing = database.transaction(['local_session', 'profile_cache'], 'readwrite');
      const sessions = writing.objectStore('local_session');
      const profiles = writing.objectStore('profile_cache');
      sessions.getAll().onsuccess = (event) => {
        for (const row of (event.target as IDBRequest).result) sessions.put({ ...row, profile: { ...row.profile, preferences } });
      };
      profiles.getAll().onsuccess = (event) => {
        for (const row of (event.target as IDBRequest).result) profiles.put({ ...row, preferences });
      };
      writing.oncomplete = () => {
        database.close();
        const saved = JSON.parse(localStorage.getItem('safeos-settings') || '{}');
        localStorage.setItem('safeos-settings', JSON.stringify({ ...saved, state: { ...saved.state, settingsSourceId: null } }));
        resolve();
      };
      writing.onerror = () => { database.close(); reject(writing.error); };
    };
  }));
  expect(await settingsSource(page)).toBeNull();

  // 23:00, inside the night set time: the watch opens again and restores the account.
  await page.clock.setSystemTime(new Date('2026-11-18T23:00:00Z'));
  await page.goto('/monitor/', { waitUntil: 'networkidle', timeout: 60_000 });
  await expect.poll(() => settingsSource(page), { timeout: 30_000 }).toMatch(/^account:/);
  await expect.poll(() => savedSetting(page), { timeout: 15_000 }).toBe('night');
  // Night's own values, motion 40 and audio 60, not the account's 30.
  expect(await savedValue(page, 'motionSensitivity')).toBe(40);
  await expect(page.getByText('Night Mode', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/^Motion: 40% \| Audio: 60%/)).toBeVisible();
  await page.waitForTimeout(2_000);
  expect(await savedValue(page, 'motionSensitivity')).toBe(40);
  expect(await savedSetting(page)).toBe('night');
  await page.getByText(/^Motion: 40% \| Audio: 60%/).scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('set-time-account-restored-1280.png') });
});

/** A set time saved with a setting the form does not offer: `balanced` from an earlier form, or Custom. */
const withoutASetting = (preset: string) => ({
  id: `sched_${preset}`, name: `Saved with ${preset}`, enabled: true, preset, days: EVERY_DAY,
  timeSlot: { start: '22:00', end: '06:00' }, priority: 20,
  createdAt: '2026-11-18T12:00:00.000Z', updatedAt: '2026-11-18T12:00:00.000Z',
});

for (const preset of ['balanced', 'custom']) {
  test(`a set time saved with ${preset} never applies, does not outrank Night, and says it needs a setting chosen`, async ({ page, context }) => {
    test.setTimeout(90_000);
    await page.clock.install({ time: new Date('2026-11-18T21:59:00Z') });
    await setUpDevice(context, {
      use: 'baby',
      schedules: { schedulingEnabled: true, schedules: [withoutASetting(preset), ...NIGHT_EVERY_DAY.schedules] },
    });

    await page.goto('/settings/schedule/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.clock.fastForward('01:30');
    // Night, the set time of lower priority, is the one in force.
    await expect.poll(() => savedSetting(page), { timeout: 15_000 }).toBe('night');
    const card = page.locator('div.rounded-xl').filter({ has: page.getByRole('heading', { name: `Saved with ${preset}` }) }).last();
    await expect(card.getByText('This schedule needs a setting chosen. Press Edit to choose one; until then it never applies.')).toBeVisible();
    await expect(card.getByText('Active', { exact: true })).toHaveCount(0);
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath(`set-time-needs-a-setting-${preset}-1280.png`) });
  });
}

test('the schedule form offers the named settings only', async ({ page, context }) => {
  test.setTimeout(90_000);
  await setUpDevice(context, { use: 'baby' });
  await page.goto('/settings/schedule/', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('button', { name: 'Create Schedule', exact: true }).click();
  const presets = page.locator('select').filter({ has: page.locator('option[value="night"]') });
  await expect(presets.locator('option[value="night"]')).toHaveCount(1);
  await expect(presets.locator('option[value="custom"]')).toHaveCount(0);
});
