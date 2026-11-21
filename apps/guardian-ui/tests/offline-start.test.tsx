/** @jest-environment ./tests/helpers/browser-environment.cjs */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { prepareBrowser } from './helpers/model-browser';

afterEach(cleanup);

it('installs the page scripts before a previously unopened route is used offline', async () => {
  const { cache } = prepareBrowser();
  const listeners: Record<string, (event: any) => void> = {};
  const manifest = {
    version: 'fixture-build',
    urls: ['/settings/models/', '/_next/static/chunks/models.js', '/_next/static/css/app.css', '/offline.html'],
  };
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    return new Response(url.endsWith('.js') ? 'window.modelsLoaded = true' : url.endsWith('.css') ? 'body {}' :
      '<html><script src="/_next/static/chunks/models.js"></script><link rel="stylesheet" href="/_next/static/css/app.css"></html>');
  });
  const context = {
    self: {
      __SAFEOS_PRECACHE: manifest,
      addEventListener: (name: string, callback: (event: any) => void) => { listeners[name] = callback; },
      skipWaiting: jest.fn(), clients: { claim: jest.fn() }, location: { origin: 'http://localhost' },
    },
    caches: cache, fetch: (input: RequestInfo | URL) => globalThis.fetch(input),
    URL, Response, Request, console, location: { origin: 'http://localhost' },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8'), context);
  let installation: Promise<unknown> = Promise.resolve();
  listeners.install({ waitUntil: (promise: Promise<unknown>) => { installation = promise; } });
  await installation;
  globalThis.fetch = jest.fn().mockRejectedValue(new Error('Offline'));
  async function request(url: string, mode: string) {
    let result: Promise<Response> = Promise.resolve(new Response('', { status: 500 }));
    listeners.fetch({
      request: { url: new URL(url, 'http://localhost').href, method: 'GET', headers: new Headers(), mode },
      respondWith: (promise: Promise<Response>) => { result = promise; }, waitUntil: () => {},
    });
    return result;
  }
  const html = await (await request('/settings/models/', 'navigate')).text();
  const document = new DOMParser().parseFromString(html, 'text/html');
  const resources = [...document.querySelectorAll('script[src], link[rel="stylesheet"]')].map(el => el.getAttribute('src') || el.getAttribute('href')!);
  expect(resources.length).toBeGreaterThan(0);
  for (const resource of resources) expect((await request(resource, 'cors')).status).toBe(200);

  const Page = require('@/app/settings/models/page').default;
  render(<Page />);
  fireEvent.click(await screen.findByRole('button', { name: /hybrid/i }));
  expect(require('@/stores/settings-store').useSettingsStore.getState().globalSettings.processingMode).toBe('hybrid');
});

it('activation preserves downloaded models and unrelated caches', async () => {
  const { cache } = prepareBrowser();
  await cache.open('safeos-detection-model-v1');
  await cache.open('another-app');
  const listeners: Record<string, (event: any) => void> = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8'), {
    self: { __SAFEOS_PRECACHE: { version: 'new', urls: [] }, addEventListener: (name: string, callback: (event: any) => void) => { listeners[name] = callback; }, clients: { claim: jest.fn() } },
    caches: cache, console,
  });
  let activation: Promise<unknown> = Promise.resolve();
  listeners.activate({ waitUntil: (promise: Promise<unknown>) => { activation = promise; } });
  await activation;
  expect(await cache.keys()).toEqual(expect.arrayContaining(['safeos-detection-model-v1', 'another-app']));
});

function loadWorker(cache: ReturnType<typeof prepareBrowser>['cache'], manifest?: { version: string; urls: string[] }) {
  const listeners: Record<string, (event: any) => void> = {};
  const self = {
    ...(manifest ? { __SAFEOS_PRECACHE: manifest } : {}),
    addEventListener: (name: string, callback: (event: any) => void) => { listeners[name] = callback; },
    skipWaiting: jest.fn(), clients: { claim: jest.fn() }, location: { origin: 'http://localhost' },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8'), {
    self, caches: cache, fetch: (input: RequestInfo | URL) => globalThis.fetch(input),
    URL, Response, Request, console, location: { origin: 'http://localhost' },
    // The worker's waits between attempts pass at once here.
    setTimeout: (callback: () => void) => globalThis.setTimeout(callback, 0),
  });
  async function lifecycle(name: 'install' | 'activate') {
    let pending: Promise<unknown> = Promise.resolve();
    listeners[name]({ waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
    await pending;
  }
  // What the worker asks the browser to wait for after it has answered.
  const followUps: Promise<unknown>[] = [];
  function request(url: string, mode = 'cors') {
    let result: Promise<Response> | null = null;
    listeners.fetch({
      request: { url: new URL(url, 'http://localhost').href, method: 'GET', headers: new Headers(), mode },
      respondWith: (promise: Promise<Response>) => { result = promise; },
      waitUntil: (promise: Promise<unknown>) => { followUps.push(promise); },
    });
    return result as Promise<Response> | null;
  }
  /** Waits for the worker's own work after its answers. */
  async function settled() {
    while (followUps.length) await followUps.shift();
  }
  return { self, lifecycle, request, settled };
}

// The network's answer to a request names the address asked for, whether the
// worker passes it on as text or as the page's own request.
const addressOf = (input: RequestInfo | URL) =>
  new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost').pathname;

it('opens a stored page for an address without its closing slash and for one with a query', async () => {
  const { cache } = prepareBrowser();
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => new Response(`page ${new URL(String(input), 'http://localhost').pathname}`));
  const worker = loadWorker(cache, { version: 'build-a', urls: ['/monitor/', '/history/', '/offline.html'] });
  await worker.lifecycle('install');
  globalThis.fetch = jest.fn().mockRejectedValue(new Error('Offline'));
  expect(await (await worker.request('/monitor', 'navigate'))!.text()).toBe('page /monitor/');
  expect(await (await worker.request('/history', 'navigate'))!.text()).toBe('page /history/');
  expect(await (await worker.request('/monitor/?source=shortcut', 'navigate'))!.text()).toBe('page /monitor/');
  // An address the build does not hold gets the offline page, never another page.
  expect(await (await worker.request('/no-such-page', 'navigate'))!.text()).toBe('page /offline.html');
});

it('stores the build again when a load with a connection finds the installed copy emptied', async () => {
  const { cache } = prepareBrowser();
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => new Response(`page ${addressOf(input)}`));
  const worker = loadWorker(cache, { version: 'build-a', urls: ['/dashboard/', '/history/', '/offline.html'] });
  await worker.lifecycle('install');
  await cache.delete('safeos-shell-build-a');
  expect(await (await worker.request('/dashboard/', 'navigate'))!.text()).toBe('page /dashboard/');
  await worker.settled();
  globalThis.fetch = jest.fn().mockRejectedValue(new Error('Offline'));
  expect(await (await worker.request('/history/', 'navigate'))!.text()).toBe('page /history/');
});

it('stores the build again when its cache was cleared between installation and taking over', async () => {
  const { cache } = prepareBrowser();
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => new Response(`page ${addressOf(input)}`));
  const worker = loadWorker(cache, { version: 'build-a', urls: ['/dashboard/', '/history/', '/offline.html'] });
  await worker.lifecycle('install');
  // Clear All Local Data deletes the build's cache before the worker takes over.
  await cache.delete('safeos-shell-build-a');
  await worker.lifecycle('activate');
  expect(await worker.request('/dashboard/', 'navigate')).not.toBeNull();
  await worker.settled();
  globalThis.fetch = jest.fn().mockRejectedValue(new Error('Offline'));
  expect(await (await worker.request('/history/', 'navigate'))!.text()).toBe('page /history/');
});

it('tries the store again when one of its files met a passing error, and opens the page offline after', async () => {
  const { cache } = prepareBrowser();
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => new Response(`page ${addressOf(input)}`));
  const worker = loadWorker(cache, { version: 'build-a', urls: ['/dashboard/', '/history/', '/offline.html'] });
  await worker.lifecycle('install');
  await cache.delete('safeos-shell-build-a');
  // The first time the store asks for /history/, the host answers 503.
  let failed = false;
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    if (addressOf(input) === '/history/' && !failed) {
      failed = true;
      return new Response('busy', { status: 503 });
    }
    return new Response(`page ${addressOf(input)}`);
  });
  expect(await (await worker.request('/dashboard/', 'navigate'))!.text()).toBe('page /dashboard/');
  await worker.settled();
  expect(failed).toBe(true);
  globalThis.fetch = jest.fn().mockRejectedValue(new Error('Offline'));
  expect(await (await worker.request('/history/', 'navigate'))!.text()).toBe('page /history/');
});

it('stores the build once when the first try succeeds', async () => {
  const { cache } = prepareBrowser();
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => new Response(`page ${addressOf(input)}`));
  const worker = loadWorker(cache, { version: 'build-a', urls: ['/dashboard/', '/offline.html'] });
  await worker.lifecycle('install');
  await cache.delete('safeos-shell-build-a');
  (globalThis.fetch as jest.Mock).mockClear();
  await worker.request('/dashboard/', 'navigate');
  await worker.settled();
  // The page itself, then each of the build's two files once.
  expect(globalThis.fetch).toHaveBeenCalledTimes(3);
});

it('asks the network for nothing more while the installed copy is whole', async () => {
  const { cache } = prepareBrowser();
  globalThis.fetch = jest.fn(async () => new Response('page'));
  const worker = loadWorker(cache, { version: 'build-a', urls: ['/dashboard/', '/offline.html'] });
  await worker.lifecycle('install');
  (globalThis.fetch as jest.Mock).mockClear();
  await worker.request('/dashboard/', 'navigate');
  await worker.settled();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

it('serves route data the router requests with a query from the installed build', async () => {
  const { cache } = prepareBrowser();
  globalThis.fetch = jest.fn(async () => new Response('route payload'));
  const worker = loadWorker(cache, { version: 'build-a', urls: ['/security/', '/security/index.txt'] });
  await worker.lifecycle('install');
  globalThis.fetch = jest.fn().mockRejectedValue(new Error('Offline'));
  const response = await worker.request('/security/index.txt?_rsc=1x2y3');
  expect(response!.status).toBe(200);
  expect(await response!.text()).toBe('route payload');
});

it('takes over once it has stored its build, so a returning visitor gets it on the next load', async () => {
  const { cache } = prepareBrowser();
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => new Response(`page ${addressOf(input)}`));
  const earlier = await cache.open('safeos-shell-earlier-build');
  await earlier.put('http://localhost/', new Response('earlier page'));
  const worker = loadWorker(cache, { version: 'build-b', urls: ['/', '/offline.html'] });
  await worker.lifecycle('install');
  expect(worker.self.skipWaiting).toHaveBeenCalledTimes(1);
  await worker.lifecycle('activate');
  expect(await (await worker.request('/', 'navigate'))!.text()).toBe('page /');
});

it('keeps the build that ran last for pages still loading from it, and lets every build before it go', async () => {
  const { cache } = prepareBrowser();
  const earlier = await cache.open('safeos-shell-earlier-build');
  await earlier.put('http://localhost/_next/static/chunks/main-earlier.js', new Response('earlier script'));
  // The server holds only the newest build's files.
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) =>
    addressOf(input).startsWith('/_next/static/chunks/main-earlier') ? new Response('', { status: 404 }) : new Response(`file ${addressOf(input)}`));
  const b = loadWorker(cache, { version: 'build-b', urls: ['/', '/offline.html'] });
  await b.lifecycle('install');
  await b.lifecycle('activate');
  // A page loaded from the earlier build still gets its own script after build B took over.
  expect(await cache.keys()).toEqual(['safeos-shell-earlier-build', 'safeos-shell-build-b']);
  expect(await (await b.request('/_next/static/chunks/main-earlier.js'))!.text()).toBe('earlier script');

  // Build C takes over: build B ran last and stays; the earlier build goes.
  const c = loadWorker(cache, { version: 'build-c', urls: ['/', '/offline.html'] });
  await c.lifecycle('install');
  await c.lifecycle('activate');
  expect(await cache.keys()).toEqual(['safeos-shell-build-b', 'safeos-shell-build-c']);
  expect((await c.request('/_next/static/chunks/main-earlier.js'))!.status).toBe(404);
});

it('does not take over while its build could not be stored whole', async () => {
  const { cache } = prepareBrowser();
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) =>
    addressOf(input) === '/offline.html' ? new Response('', { status: 404 }) : new Response(`page ${addressOf(input)}`));
  const worker = loadWorker(cache, { version: 'build-c', urls: ['/', '/offline.html'] });
  await expect(worker.lifecycle('install')).rejects.toThrow();
  expect(worker.self.skipWaiting).not.toHaveBeenCalled();
});

it('a worker without a build list replaces an earlier build and leaves requests to the network', async () => {
  const { cache } = prepareBrowser();
  const earlier = await cache.open('safeos-shell-earlier-build');
  await earlier.put('http://localhost/', new Response('stale page'));
  await cache.open('safeos-detection-model-v1');
  const worker = loadWorker(cache);
  await worker.lifecycle('install');
  expect(worker.self.skipWaiting).toHaveBeenCalled();
  await worker.lifecycle('activate');
  expect(await cache.keys()).toEqual(['safeos-detection-model-v1']);
  expect(worker.request('/', 'navigate')).toBeNull();
});
