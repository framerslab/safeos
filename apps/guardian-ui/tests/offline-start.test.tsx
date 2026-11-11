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
  });
  async function lifecycle(name: 'install' | 'activate') {
    let pending: Promise<unknown> = Promise.resolve();
    listeners[name]({ waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
    await pending;
  }
  function request(url: string, mode = 'cors') {
    let result: Promise<Response> | null = null;
    listeners.fetch({
      request: { url: new URL(url, 'http://localhost').href, method: 'GET', headers: new Headers(), mode },
      respondWith: (promise: Promise<Response>) => { result = promise; }, waitUntil: () => {},
    });
    return result as Promise<Response> | null;
  }
  return { self, lifecycle, request };
}

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
