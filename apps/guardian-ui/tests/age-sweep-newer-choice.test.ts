/** @jest-environment jsdom */
import './helpers/browser-data';
import { getAlertPicture, saveAlertPicture } from '@/lib/client-db';
import { pictureStampNow } from '@/lib/local-data-generation';
import { sweepPicturesByAge } from '@/lib/alert-pictures/keeper';
import { useAlertPicturesStore } from '@/stores/alert-pictures-store';

// Nothing here is heard by other tabs.
jest.mock('@/lib/tab-channel', () => ({
  ...jest.requireActual('@/lib/tab-channel'),
  tellTabs: jest.fn(),
}));

const DAY = 86_400_000;

/**
 * Opens a transaction on the picture store and keeps it open, one read after another, until the
 * answer is called: a sweep begun meanwhile waits for it, as it waits behind another tab's write.
 */
function holdPictureStore(): Promise<() => void> {
  return new Promise((ready, failed) => {
    const opening = indexedDB.open('safeos-guardian');
    opening.onerror = () => failed(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const tx = db.transaction(['alert_picture'], 'readwrite');
      const store = tx.objectStore('alert_picture');
      let held = true;
      const readAgain = () => {
        store.get('held-open').onsuccess = () => { if (held) readAgain(); };
      };
      readAgain();
      tx.oncomplete = () => db.close();
      ready(() => { held = false; });
    };
  });
}

it('a sweep by an age that waits for the store deletes nothing once Until I delete them is chosen', async () => {
  const now = Date.now();
  const at = now - 2 * DAY;
  const id = `picture-${at}-old`;
  // A kept row with no Blob in it: the test's stand-in for structuredClone cannot copy a Blob.
  expect(await saveAlertPicture({ id, state: 'kept', kind: 'motion', takenAt: at }, pictureStampNow()))
    .toEqual({ result: 'saved', deleted: [] });

  // 1 day is chosen, and its sweep begins while another transaction holds the store.
  useAlertPicturesStore.getState().setDeleteAfterDays(1);
  const release = await holdPictureStore();
  const sweeping = sweepPicturesByAge(now);
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Before the sweep reads the store, the person chooses Until I delete them.
  useAlertPicturesStore.getState().setDeleteAfterDays(null);
  release();
  await sweeping;

  expect((await getAlertPicture(id))?.state).toBe('kept');
});

it('a sweep by an age deletes nothing when Until I delete them is chosen while it writes', async () => {
  const now = Date.now();
  const at = now - 2 * DAY;
  const id = `picture-${at}-written`;
  expect(await saveAlertPicture({ id, state: 'kept', kind: 'motion', takenAt: at }, pictureStampNow()))
    .toEqual({ result: 'saved', deleted: [] });
  useAlertPicturesStore.getState().setDeleteAfterDays(1);

  // The person chooses Until I delete them as the sweep writes the row that says the picture went.
  const put = IDBObjectStore.prototype.put;
  let chose = false;
  const spy = jest.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
    if (!chose && (value as { state?: string } | null)?.state === 'gone') {
      chose = true;
      useAlertPicturesStore.getState().setDeleteAfterDays(null);
    }
    return put.call(this, value, key);
  });
  try {
    await sweepPicturesByAge(now);
  } finally {
    spy.mockRestore();
  }
  expect(chose).toBe(true);
  expect((await getAlertPicture(id))?.state).toBe('kept');
});
