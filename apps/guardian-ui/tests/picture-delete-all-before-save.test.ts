/** @jest-environment jsdom */
import './helpers/browser-data';
import { getAlertPicture, goneAllAlertPictures, saveAlertPicture } from '@/lib/client-db';
import { pictureStampNow, PICTURES_CLEAR_MARKER_KEY } from '@/lib/local-data-generation';

it.each([
  { outcome: 'aborts', deletion: 'failed', save: { result: 'saved', deleted: [] }, stored: 'kept' },
  { outcome: 'commits', deletion: 'deleted', save: { result: 'dropped' }, stored: undefined },
])('a waiting save reads the outcome when Delete all pictures $outcome', async ({ outcome, deletion, save, stored }) => {
  await getAlertPicture('waiting');
  localStorage.removeItem(PICTURES_CLEAR_MARKER_KEY);
  const stamp = pictureStampNow();
  const picture = { id: `waiting-${deletion}`, state: 'kept', kind: 'motion', takenAt: Date.now() } as const;
  let deleting: IDBTransaction | undefined;
  let saving: ReturnType<typeof saveAlertPicture> | undefined;
  const transaction = IDBDatabase.prototype.transaction;
  const watchTransaction = jest.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (
    this: IDBDatabase, names: string | Iterable<string>, mode?: IDBTransactionMode, options?: IDBTransactionOptions,
  ) {
    const tx = transaction.call(this, names, mode, options);
    if (mode === 'readwrite' && tx.objectStoreNames.contains('alert_picture')) deleting ??= tx;
    return tx;
  });

  const setItem = localStorage.setItem;
  const writeMarker = jest.spyOn(localStorage, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key !== PICTURES_CLEAR_MARKER_KEY) {
      setItem.call(this, key, value);
      return;
    }
    // Hold the deleting tab's follow-up marker write while the waiting save proceeds.
    if (saving) return;
    setItem.call(this, key, value);
    saving = saveAlertPicture(picture, stamp);
    if (outcome === 'aborts') deleting!.abort();
  });

  try {
    expect(await goneAllAlertPictures()).toMatchObject({ result: deletion });
    expect(saving).toBeDefined();
    expect(await saving).toEqual(save);
    expect((await getAlertPicture(picture.id))?.state).toBe(stored);
  } finally {
    writeMarker.mockRestore();
    watchTransaction.mockRestore();
    localStorage.removeItem(PICTURES_CLEAR_MARKER_KEY);
  }
});
