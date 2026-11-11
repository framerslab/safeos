/** @jest-environment ./tests/helpers/browser-environment.cjs */
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { prepareBrowser, finishSetup, agreeIfOffered, MODEL_URL, WEIGHT_URL } from './helpers/model-browser';

afterEach(cleanup);

it('keeps detection weights for a fresh offline page and shares them across detectors', async () => {
  const { network, cache } = prepareBrowser();
  finishSetup();
  const Security = require('@/app/security/page').default;
  const first = render(<Security />);
  await agreeIfOffered();
  await waitFor(() => expect(screen.getByText('AI: Ready')).toBeTruthy());
  expect(await cache.match(MODEL_URL)).toBeDefined();
  expect(await cache.match(WEIGHT_URL)).toBeDefined();
  // resetModules clears globally installed spies when simulating a new document.
  expect(network.mock.calls.filter(([url]) => String(url) === WEIGHT_URL)).toHaveLength(1);
  first.unmount();

  // A fresh JS realm retains browser storage but no model singleton.
  prepareBrowser();
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: cache });
  globalThis.fetch = jest.fn().mockRejectedValue(new Error('Offline'));
  finishSetup();
  localStorage.setItem('safeos-detection-model-consent', '1');
  const Wildlife = require('@/app/wildlife/page').default;
  render(<Wildlife />);
  await agreeIfOffered();
  await waitFor(() => expect(screen.getByText('AI: Ready')).toBeTruthy());
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

type MemoryCaches = ReturnType<typeof prepareBrowser>['cache'];
const storageRefusals: Array<[string, (cache: MemoryCaches) => void]> = [
  ['has no Cache Storage', () => { Object.defineProperty(globalThis, 'caches', { configurable: true, value: undefined }); }],
  ['refuses to open the model cache', () => {
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: { open: jest.fn().mockRejectedValue(new DOMException('The operation is insecure.', 'SecurityError')) },
    });
  }],
  ['is over its storage quota', cache => {
    const open = cache.open;
    Object.assign(cache, {
      open: async (name: string) => ({
        ...(await open(name)),
        put: async () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); },
      }),
    });
  }],
];

it.each(storageRefusals)('loads detection from the network when the browser %s, and says it is not saved', async (_case, refuseStorage) => {
  const { network, cache } = prepareBrowser();
  refuseStorage(cache);
  finishSetup();
  const Security = require('@/app/security/page').default;
  render(<Security />);
  await agreeIfOffered();
  await waitFor(() => expect(screen.getByText('AI: Ready')).toBeTruthy());
  expect(network.mock.calls.filter(([url]) => String(url) === WEIGHT_URL)).toHaveLength(1);
  expect(screen.getByText(/could not be saved/i)).toBeTruthy();
});

it('the offered download supplies detection rather than the unused classifier', async () => {
  prepareBrowser();
  finishSetup();
  const { ModelDownloadProgress } = require('@/components/ModelDownloadProgress');
  render(<ModelDownloadProgress autoStart />);
  await agreeIfOffered();
  await waitFor(() => expect(require('@tensorflow-models/coco-ssd').load).toHaveBeenCalled());
  expect(require('@xenova/transformers').pipeline).not.toHaveBeenCalled();
});
