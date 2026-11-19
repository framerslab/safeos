/**
 * Alert pictures: each Motion, Picture change and Sound alert keeps the
 * camera's picture of the moment, a box round what set it off and a
 * close-up of that box, in the browser's database on this device.
 *
 * The walks open the built site in desktop Chromium with a camera handed to
 * the page: Chromium's fake camera playing the committed sample clip, or a
 * canvas stream whose moving part is redrawn at random grey levels (as
 * e2e/alerts-repeat.spec.ts draws it). The page's own detectors raise the
 * alerts. The database is read and written on the walk's own connections.
 *
 * Run in CI by ci.yml's "Web app alert walk" job against the static export.
 */

import { test, expect, type Page } from '@playwright/test';

import {
  LEFT_THIRD,
  MOTION_ONLY,
  canvasCamera,
  cooldownPeriod,
  keptPicture,
  readDatabase,
  savedAlert,
  seedDevice,
  seedPictureRows,
  seedVersion7,
  startWatching,
  type DatabaseReading,
} from './helpers/alert-pictures';

test.use({
  permissions: ['camera', 'microphone'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
});

// The camera stand-ins and the camera grants need desktop Chromium, as the
// alert walk does; under the other projects the walk skips.
test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'the alert pictures walk runs in desktop Chromium',
);

/** The database, or null while the page holds it mid-reload. */
async function databaseNow(page: Page): Promise<DatabaseReading | null> {
  try {
    return await readDatabase(page);
  } catch {
    return null;
  }
}

const monitoringAlerts = (reading: DatabaseReading | null) => (reading?.alerts ?? []).filter((row) => row.monitoring === true);

test.describe('The picture store and the alert record', () => {
  test('a device saved by the release before this one keeps every alert and frame', async ({ page, context }) => {
    await seedDevice(context, { pictures: { noticeAnswered: true } });
    const alert = savedAlert('motion-1763500000000-abcdefg', 1763500000000);
    const matchFrame = {
      id: 'match-1763500000000',
      subjectId: 'subject-stripes',
      frameData: '',
      thumbnailData: '',
      confidence: 82,
      timestamp: 1763500000000,
      details: { colorMatch: 80, dominantMatch: 70, edgeMatch: 60, sizeMatch: 50 },
      region: { x: 10, y: 10, width: 40, height: 40 },
      acknowledged: false,
      notes: '',
      exported: false,
    };
    const subject = {
      id: 'subject-stripes',
      name: 'Stripes',
      type: 'pet',
      description: '',
      fingerprint: null,
      referenceImages: [],
      createdAt: new Date(1763400000000).toISOString(),
      lastActiveAt: null,
      matchCount: 1,
    };
    await seedVersion7(page, { alerts: [alert], matchFrames: [matchFrame], subjects: [subject] });

    await page.goto('/monitor/', { waitUntil: 'networkidle' });
    await expect.poll(async () => (await databaseNow(page))?.version, { timeout: 15_000 }).toBe(8);
    const reading = (await databaseNow(page))!;
    expect(reading.stores).toContain('alert_picture');
    expect(reading.alerts).toEqual([alert]);
    expect(reading.matchFrames).toEqual([matchFrame]);
    expect(reading.pictures).toEqual([]);
  });

  test('Clear All Local Data leaves no alert picture', async ({ page, context }) => {
    await seedDevice(context, { pictures: { noticeAnswered: true } });
    const at = Date.now() - 60_000;
    await seedPictureRows(page, [
      { alert: savedAlert('motion-1-aaaaaaa', at, { pictureId: 'picture-1-aaaaaaa', kind: 'motion' }), picture: keptPicture('picture-1-aaaaaaa', at) },
      { alert: savedAlert('motion-2-bbbbbbb', at + 1_000, { pictureId: 'picture-2-bbbbbbb', kind: 'motion' }), picture: keptPicture('picture-2-bbbbbbb', at + 1_000) },
    ]);
    expect((await readDatabase(page)).pictures).toHaveLength(2);

    await page.goto('/settings/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Privacy' }).click();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Clear All Local Data' }).click();

    await expect.poll(async () => {
      const reading = await databaseNow(page);
      return reading ? { pictures: reading.pictures.length, alerts: monitoringAlerts(reading).length } : null;
    }, { timeout: 15_000 }).toEqual({ pictures: 0, alerts: 0 });
  });

  test('the 101st alert takes the oldest alert\'s picture with it', async ({ page, context }) => {
    test.setTimeout(120_000);
    await seedDevice(context, { settings: { ...MOTION_ONLY, timingSettings: cooldownPeriod(20) }, pictures: { noticeAnswered: true } });
    await canvasCamera(page, LEFT_THIRD);
    const oldest = 1763400000000;
    const rows = Array.from({ length: 100 }, (_, i) => {
      const at = oldest + i * 60_000;
      const tail = i === 0 ? 'aaaaaaa' : `k${String(i).padStart(6, '0')}`;
      return {
        alert: savedAlert(`motion-${at}-${tail}`, at, { acknowledged: true, kind: 'motion', pictureId: `picture-${at}-${tail}` }),
        picture: keptPicture(`picture-${at}-${tail}`, at),
      };
    });
    await seedPictureRows(page, rows);
    expect(monitoringAlerts(await readDatabase(page))).toHaveLength(100);

    await page.goto('/monitor/', { waitUntil: 'networkidle' });
    await startWatching(page);

    await expect.poll(async () => {
      const reading = await databaseNow(page);
      return reading ? monitoringAlerts(reading).some((row) => row.id === 'motion-1763400000000-aaaaaaa') : true;
    }, { timeout: 60_000, message: 'the oldest alert leaves when the 101st is saved' }).toBe(false);
    const reading = (await readDatabase(page))!;
    expect(monitoringAlerts(reading)).toHaveLength(100);
    expect(reading.pictures.map((row) => row.id)).not.toContain('picture-1763400000000-aaaaaaa');
    expect(reading.pictures.filter((row) => row.state === 'kept').length).toBeLessThanOrEqual(100);
  });
});
