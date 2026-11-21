/** @jest-environment jsdom */
/**
 * Whether this window's storage ends when the window closes
 *
 * A private window keeps nothing once it is closed, so the dashboard says so.
 * Chromium is told by timing its database's commits; Firefox and Safari by
 * the words they refuse a private window its own folder with. Where nothing
 * can be told the answer is false. The answer is kept for the visit, so the
 * check runs once a window.
 */

import { WINDOW_STORAGE_MEMO, storageEndsWithWindow } from '@/lib/short-lived-storage';

// jsdom runs on V8. An engine that is not V8 words its toFixed error in
// another length than V8's 51 characters.
function notV8() {
  jest.spyOn(Number.prototype, 'toFixed').mockImplementation(() => {
    throw new RangeError('precision is out of range');
  });
}

function folder(answer: () => Promise<unknown>) {
  const getDirectory = jest.fn(answer);
  Object.defineProperty(navigator, 'storage', { configurable: true, value: { getDirectory } });
  return getDirectory;
}

function database(open: () => unknown) {
  const stand = { open: jest.fn(open), deleteDatabase: jest.fn() };
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, writable: true, value: stand });
  return stand;
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete (navigator as unknown as { storage?: unknown }).storage;
  delete (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
});

it("answers from the visit's memo without a probe", async () => {
  const opened = database(() => {
    throw new Error('the probe ran');
  });

  sessionStorage.setItem(WINDOW_STORAGE_MEMO, 'ends');
  await expect(storageEndsWithWindow()).resolves.toBe(true);

  sessionStorage.setItem(WINDOW_STORAGE_MEMO, 'kept');
  await expect(storageEndsWithWindow()).resolves.toBe(false);

  expect(opened.open).not.toHaveBeenCalled();
});

it('tells a private window where the browser refuses its own folder', async () => {
  notV8();
  const answers: [() => Promise<unknown>, boolean][] = [
    [() => Promise.reject(new Error('Security error when calling GetDirectory')), true],
    [() => Promise.reject(new Error('The operation failed for an unknown transient reason (e.g. out of memory).')), true],
    [() => Promise.reject(new Error('The object can not be found here.')), false],
    [() => Promise.resolve({}), false],
  ];
  for (const [answer, ends] of answers) {
    sessionStorage.clear();
    const asked = folder(answer);
    await expect(storageEndsWithWindow()).resolves.toBe(ends);
    expect(asked).toHaveBeenCalledTimes(1);
  }
});

it('keeps its answer for the visit', async () => {
  notV8();
  folder(() => Promise.reject(new Error('Security error when calling GetDirectory')));
  await storageEndsWithWindow();
  expect(sessionStorage.getItem(WINDOW_STORAGE_MEMO)).toBe('ends');

  sessionStorage.clear();
  const asked = folder(() => Promise.resolve({}));
  await storageEndsWithWindow();
  expect(sessionStorage.getItem(WINDOW_STORAGE_MEMO)).toBe('kept');
  await storageEndsWithWindow();
  expect(asked).toHaveBeenCalledTimes(1);
});

it('answers false where nothing can be told', async () => {
  notV8();
  delete (navigator as unknown as { storage?: unknown }).storage;
  await expect(storageEndsWithWindow()).resolves.toBe(false);
});

it('answers false when the timing cannot be made', async () => {
  const thrown = database(() => {
    throw new Error('The operation is insecure.');
  });
  await expect(storageEndsWithWindow()).resolves.toBe(false);
  expect(thrown.open).toHaveBeenCalledTimes(1);

  sessionStorage.clear();
  const refused = database(() => {
    const request: { onerror: (() => void) | null; onsuccess: (() => void) | null; onupgradeneeded: (() => void) | null } = {
      onerror: null,
      onsuccess: null,
      onupgradeneeded: null,
    };
    setTimeout(() => request.onerror?.(), 0);
    return request;
  });
  await expect(storageEndsWithWindow()).resolves.toBe(false);
  expect(refused.open).toHaveBeenCalledTimes(1);
});
