import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react';

export const MODEL_URL = 'https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/model.json';
export const WEIGHT_URL = new URL('weights.bin', MODEL_URL).href;

export function memoryCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const key = (input: RequestInfo | URL) => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost').href;
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name)!;
    return {
      match: async (input: RequestInfo | URL) => entries.get(key(input))?.clone(),
      put: async (input: RequestInfo | URL, response: Response) => { entries.set(key(input), response.clone()); },
      addAll: async (inputs: string[]) => {
        const responses = await Promise.all(inputs.map(async input => {
          const response = await fetch(input);
          if (!response.ok) throw new Error('Cache fetch failed');
          return response;
        }));
        inputs.forEach((input, i) => entries.set(key(input), responses[i]));
      },
      keys: async () => [...entries.keys()].map(url => new Request(url)),
      delete: async (input: RequestInfo | URL) => entries.delete(key(input)),
    };
  };
  return {
    stores, open,
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (input: RequestInfo | URL) => {
      for (const name of stores.keys()) {
        const response = await (await open(name)).match(input);
        if (response) return response;
      }
    },
  };
}

export function prepareBrowser() {
  jest.resetModules();
  jest.doMock('react', () => React);
  jest.doMock('next/navigation', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
  // Keep TensorFlow's real HTTP/weight IO; replace only the GPU runtime.
  jest.doMock('@tensorflow/tfjs', () => ({
    io: jest.requireActual('@tensorflow/tfjs').io,
    setBackend: jest.fn().mockResolvedValue(true),
    ready: jest.fn().mockResolvedValue(undefined),
  }));
  jest.doMock('@tensorflow-models/coco-ssd', () => ({
    load: jest.fn(async ({ modelUrl = MODEL_URL } = {}) => {
      const { io } = require('@tensorflow/tfjs');
      const handlers = io.getLoadHandlers(modelUrl);
      if (handlers.length !== 1) throw new Error('Expected one model IO handler');
      const artifacts = await handlers[0].load();
      if (!artifacts.weightData.byteLength) throw new Error('Missing weights');
      return { detect: jest.fn().mockResolvedValue([]), dispose: jest.fn() };
    }),
  }));
  // This runtime must never be needed by a detection download.
  jest.doMock('@xenova/transformers', () => ({
    env: { backends: { onnx: { wasm: {} } } },
    pipeline: jest.fn().mockRejectedValue(new Error('Unused classifier requested')),
  }));
  localStorage.clear();
  const cache = memoryCaches();
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: cache });
  const getUserMedia = jest.fn().mockResolvedValue({
    getTracks: () => [{ stop: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn(), readyState: 'live' }],
  });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  Object.defineProperty(globalThis, 'Notification', { configurable: true, value: Object.assign(jest.fn(), { permission: 'denied' }) });
  const network = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/tags')) return new Response(JSON.stringify({ models: [] }));
    if (url === MODEL_URL) return new Response(JSON.stringify({
      modelTopology: {},
      weightsManifest: [{ paths: ['weights.bin'], weights: [{ name: 'weight', shape: [1], dtype: 'float32' }] }],
    }));
    if (url === WEIGHT_URL) return new Response(new Uint8Array([0, 0, 0, 0]));
    throw new Error(`Unexpected request: ${url}`);
  });
  globalThis.fetch = network as typeof fetch;
  return { network, cache, getUserMedia };
}

export function finishSetup() {
  require('@/stores/onboarding-store').useOnboardingStore.getState().setComplete(true);
}

// On the old page mount initiates loading; the repaired page asks first.
export async function agreeIfOffered() {
  await act(async () => {});
  const button = screen.queryByRole('button', { name: /download.*model|retry.*download/i });
  if (button) fireEvent.click(button);
  await act(async () => {});
}
