/** @jest-environment jsdom */
import './helpers/browser-data';
import { cacheAlert, getAlertPicture, getCachedMonitoringAlerts, repeatCachedAlert, saveAlertPicture } from '@/lib/client-db';
import { pictureStampNow } from '@/lib/local-data-generation';

it('a repeat with no picture and no zone leaves the stored card with neither, and deletes its earlier picture', async () => {
  const at = Date.now() - 60_000;
  const first = `picture-${at}-first`;
  const card = {
    id: `motion-${at}-repeat`, streamId: 'local', severity: 'medium', message: 'Motion', acknowledged: false,
    monitoring: true, kind: 'motion', createdAt: new Date(at).toISOString(), timestamp: new Date(at).toISOString(),
    pictureId: first, zone: 'Front door',
  };
  // A kept row with no Blob in it: the test's stand-in for structuredClone cannot copy a Blob.
  expect(await saveAlertPicture({ id: first, state: 'kept', kind: 'motion', takenAt: at }, pictureStampNow()))
    .toEqual({ result: 'saved', deleted: [] });
  expect(await cacheAlert(card)).toBe(true);

  // The repeat had no frame to take and no named zone: the card on screen shows neither.
  const later = new Date(at + 30_000).toISOString();
  await repeatCachedAlert({ ...card, timestamp: later, pictureId: undefined, zone: undefined });

  // After a reload the stored card says the same, and the earlier picture has gone with it.
  const [stored] = await getCachedMonitoringAlerts();
  expect(stored.timestamp).toBe(later);
  expect(stored.pictureId).toBeUndefined();
  expect(stored.zone).toBeUndefined();
  expect(await getAlertPicture(first)).toBeNull();
});
