/** @jest-environment jsdom */
/**
 * Delete picture before the picture's save is written
 *
 * A picture whose save waits (for room, or behind another write) can be
 * deleted before its row exists. The delete leaves the row that says the
 * person deleted it, so the save that comes after writes nothing.
 */
import './helpers/browser-data';
import { getAlertPicture, goneAlertPicture, saveAlertPicture } from '@/lib/client-db';
import { pictureStampNow } from '@/lib/local-data-generation';

// Nothing here is heard by other tabs.
jest.mock('@/lib/tab-channel', () => ({
  ...jest.requireActual('@/lib/tab-channel'),
  tellTabs: jest.fn(),
}));

it('a picture deleted before its save is written stays deleted', async () => {
  const at = Date.now();
  const id = `picture-${at}-waiting`;
  const stamp = pictureStampNow();
  expect(await goneAlertPicture(id, 'person', { kind: 'motion', takenAt: at })).toBe('deleted');
  expect(await saveAlertPicture({ id, state: 'kept', kind: 'motion', takenAt: at }, stamp)).toEqual({ result: 'dropped' });
  expect(await getAlertPicture(id)).toEqual({ id, state: 'gone', kind: 'motion', takenAt: at, gone: 'person' });
});
