/** @jest-environment jsdom */
/**
 * A page that fails recovers instead of going blank
 *
 * Each deploy replaces the site's script files. A tab opened before a deploy,
 * or a browser that keeps a page from before it, can then ask for a file the
 * new build no longer has, and Next.js leaves a blank page reading
 * "Application error". The app's error pages reload once to fetch the newest
 * build when the error is a missing script file, and otherwise say what
 * happened with a Reload key, a link home and the error's own words for a
 * report. A second missing file within five minutes, or a browser that keeps
 * no session storage, shows the message instead of reloading again, so a page
 * never reloads in a loop.
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import ErrorPage from '@/app/error';
import GlobalError from '@/app/global-error';
import { isMissingBuildFile, reloadForNewBuild } from '@/lib/recover-from-stale-build';

function chunkError(): Error {
  return Object.assign(new Error('Loading chunk 2117 failed.\n(error: https://safeos.sh/_next/static/chunks/2117-bf831a3c41e1f4e2.js)'), { name: 'ChunkLoadError' });
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

beforeEach(() => { sessionStorage.clear(); });
afterEach(() => { jest.restoreAllMocks(); });

it('knows a missing script file from any other error', () => {
  expect(isMissingBuildFile(chunkError())).toBe(true);
  expect(isMissingBuildFile(new TypeError('Failed to fetch dynamically imported module: https://safeos.sh/_next/static/chunks/app/blog/page.js'))).toBe(true);
  expect(isMissingBuildFile(new Error('Loading CSS chunk 3232 failed.'))).toBe(true);
  expect(isMissingBuildFile(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
  expect(isMissingBuildFile('not an error')).toBe(false);
});

it('reloads once for a missing script file, and not again within five minutes', () => {
  const storage = memoryStorage();
  const reload = jest.fn();
  const start = Date.UTC(2026, 10, 18, 8, 0);

  expect(reloadForNewBuild(chunkError(), { now: start, storage, reload })).toBe(true);
  expect(reloadForNewBuild(chunkError(), { now: start + 60_000, storage, reload })).toBe(false);
  expect(reload).toHaveBeenCalledTimes(1);

  expect(reloadForNewBuild(chunkError(), { now: start + 6 * 60_000, storage, reload })).toBe(true);
  expect(reload).toHaveBeenCalledTimes(2);
});

it('never reloads for an error that is not a missing file, or where it cannot remember the reload', () => {
  const reload = jest.fn();
  const blocked = memoryStorage();
  blocked.setItem = () => { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); };

  expect(reloadForNewBuild(new Error('A bug'), { storage: memoryStorage(), reload })).toBe(false);
  expect(reloadForNewBuild(chunkError(), { storage: blocked, reload })).toBe(false);
  expect(reload).not.toHaveBeenCalled();
});

it('says what happened on a page that fails, with a Reload key and a link home', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  render(<ErrorPage error={new Error('A bug')} reset={jest.fn()} />);
  await act(async () => {});

  expect(screen.getByRole('heading', { name: 'This page stopped working' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Go to the home page' }).getAttribute('href')).toBe('/');
});

it("shows the error's own words under What went wrong, for a report", async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  render(<ErrorPage error={new TypeError("Cannot read properties of undefined (reading 'days')")} reset={jest.fn()} />);
  await act(async () => {});

  expect(screen.getByText('What went wrong')).toBeTruthy();
  expect(screen.getByText("Cannot read properties of undefined (reading 'days')")).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Report it on GitHub' }).getAttribute('href')).toBe('https://github.com/framerslab/safeos/issues/new');
});

it('says what happened when the whole app fails, in a page of its own', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  // It draws its own html and body; inside the test's container React only warns about the nesting.
  render(<GlobalError error={new Error('A bug')} reset={jest.fn()} />);
  await act(async () => {});

  expect(screen.getByRole('heading', { name: 'This page stopped working' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
  expect(screen.getByText('A bug')).toBeTruthy();
});
