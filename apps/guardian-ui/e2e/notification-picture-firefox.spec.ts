/**
 * The notification's picture in Firefox
 *
 * Firefox shows a notification's words and no picture: its Notification has
 * no `image` (MDN's compatibility data,
 * https://github.com/mdn/browser-compat-data/blob/main/api/Notification.json).
 * Settings, Notifications reads that from the browser itself, so in Firefox
 * the switch "Show the picture in alert notifications" is inactive and says
 * why. The check needs no camera, so it runs in Firefox as it is, with no
 * stand-in for its notifications.
 *
 * Run in CI by ci.yml's "Web app alert walk" job, in its Firefox step.
 */

import { test, expect, type BrowserContext } from '@playwright/test';

const PICTURE_SWITCH = 'Show the picture in alert notifications';
const WORDS_ALONE_LINE = 'This browser shows a notification’s words alone.';

test.skip(({ browserName }) => browserName !== 'firefox', 'this check is Firefox’s own; the alert walk covers Chromium');

/** A device whose setup is done and whose notice about alert pictures is answered. */
async function seedDevice(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    if (localStorage.getItem('safeos-walk-seeded')) return;
    localStorage.setItem('safeos-walk-seeded', 'true');
    localStorage.setItem('safeos-onboarding', JSON.stringify({ state: {
      isComplete: true, selectedScenario: 'pet',
      acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
    }, version: 0 }));
    localStorage.setItem('guardian-onboarding-complete', 'true');
    localStorage.setItem('safeos-notification-prompt-dismissed', String(Date.now()));
    localStorage.setItem('safeos-pwa-prompt-dismissed', String(Date.now()));
    localStorage.setItem('safeos-alert-pictures', JSON.stringify({ state: {
      keep: true, deleteAfterDays: 3, noticeAnswered: true, inNotifications: false,
    }, version: 0 }));
  });
}

for (const look of ['dark', 'light'] as const) {
  test.describe(`Settings, Notifications in Firefox, 1280 px, ${look}`, () => {
    test.use({ colorScheme: look, viewport: { width: 1280, height: 900 } });

    test(`the notification's picture switch is inactive and says the browser shows a notification's words alone, ${look}`, async ({ page, context }) => {
      await seedDevice(context);
      await page.goto('/settings/notifications/', { waitUntil: 'load' });
      // The browser itself: no stand-in replaced its notifications.
      expect(await page.evaluate(() => typeof Notification !== 'undefined' && 'image' in Notification.prototype)).toBe(false);

      const row = page.locator('[data-notification-picture-row]');
      await expect(row).toBeVisible({ timeout: 30_000 });
      const found = row.getByRole('switch', { name: PICTURE_SWITCH, exact: true });
      await expect(found).toHaveAttribute('aria-disabled', 'true');
      await expect(found).toHaveAttribute('aria-checked', 'false');
      const why = row.getByText(WORDS_ALONE_LINE, { exact: true });
      await expect(why).toBeVisible();
      const described = ((await found.getAttribute('aria-describedby')) ?? '').split(/\s+/);
      expect(described, 'the reason is in the switch’s description').toContain(await why.getAttribute('id'));
      // No key asks for permission while the browser cannot show the picture at all.
      await expect(row.getByRole('button', { name: 'Allow notifications', exact: true })).toHaveCount(0);

      // It stays in the page's order, and a press changes nothing.
      await found.focus();
      await expect(found).toBeFocused();
      await found.click({ force: true });
      await expect(found).toHaveAttribute('aria-checked', 'false');
      const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('safeos-alert-pictures') ?? '{}').state ?? {});
      expect(kept.inNotifications).toBe(false);
    });
  });
}
