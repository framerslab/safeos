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
  expect(network.mock.calls.filter(([url]) => String(url) === WEIGHT_URL)).toHaveLength(1);
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
