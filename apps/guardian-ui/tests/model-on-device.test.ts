/** @jest-environment jsdom */
/**
 * Whether the detection model is on this device
 *
 * People and Wildlife need the detection model. Start watching opens their
 * page at its own question, and asks for no camera, unless the person agreed
 * to the download and every file of the model is stored on this device. The
 * loader stores each file under its own address, so a download cut short
 * leaves some files and not others.
 */

import { act, renderHook } from '@testing-library/react';
import { useDetectionModel } from '@/lib/detection-model';
import { MODEL_URL } from '@/lib/detection-model-facts';
import { modelOnDevice } from '@/lib/model-on-device';
import { useOnboardingStore } from '@/stores/onboarding-store';

// The model's library loads nothing here: the load fails, as with no WebGL.
jest.mock('@tensorflow/tfjs', () => ({
  setBackend: async () => {
    throw new Error('No WebGL in this browser.');
  },
  ready: async () => {},
  io: {},
}));
jest.mock('@tensorflow-models/coco-ssd', () => ({ load: async () => ({}) }));

const CONSENT_KEY = 'safeos-detection-model-consent';
const MODEL_CACHE = 'safeos-detection-model-v1';
const FOLDER = 'https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/';
const WEIGHTS = ['group1-shard1of2.bin', 'group1-shard2of2.bin'];
const manifest = { weightsManifest: [{ paths: WEIGHTS }] };

/** A response stand-in for every address stored, and `undefined` for any other. */
function stored({ listed = manifest as unknown, weights = WEIGHTS, json }: { listed?: unknown; weights?: string[]; json?: () => Promise<unknown> } = {}) {
  const files: Record<string, unknown> = { [MODEL_URL]: { json: json ?? (async () => listed) } };
  for (const path of weights) files[FOLDER + path] = {};
  return files;
}

function standInCaches(files: Record<string, unknown> | null, { has = true } = {}) {
  const cache = { match: jest.fn(async (url: string) => (files ? files[url] : undefined)) };
  const caches = {
    has: jest.fn(async (name: string) => has && name === MODEL_CACHE),
    open: jest.fn(async () => cache),
  };
  Object.defineProperty(globalThis, 'caches', { configurable: true, writable: true, value: caches });
  return caches;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(CONSENT_KEY, '1');
});

afterEach(() => {
  delete (globalThis as unknown as { caches?: unknown }).caches;
});

it('is on the device when the person agreed and every file is stored', async () => {
  const caches = standInCaches(stored());
  await expect(modelOnDevice()).resolves.toBe(true);
  expect(caches.open).toHaveBeenCalledWith(MODEL_CACHE);
});

it('is not when either is missing', async () => {
  localStorage.removeItem(CONSENT_KEY);
  standInCaches(stored());
  await expect(modelOnDevice()).resolves.toBe(false);

  localStorage.setItem(CONSENT_KEY, '1');
  const noManifest = stored();
  delete noManifest[MODEL_URL];
  standInCaches(noManifest);
  await expect(modelOnDevice()).resolves.toBe(false);

  standInCaches(stored(), { has: false });
  await expect(modelOnDevice()).resolves.toBe(false);

  delete (globalThis as unknown as { caches?: unknown }).caches;
  await expect(modelOnDevice()).resolves.toBe(false);
});

it('is not when a download stopped part way', async () => {
  standInCaches(stored({ weights: [WEIGHTS[0]] }));
  await expect(modelOnDevice()).resolves.toBe(false);

  standInCaches(stored({ listed: { weightsManifest: [{ paths: [] }] }, weights: [] }));
  await expect(modelOnDevice()).resolves.toBe(false);

  standInCaches(stored({ json: () => Promise.reject(new SyntaxError('Unexpected end of JSON input')) }));
  await expect(modelOnDevice()).resolves.toBe(false);
});

it('opens no cache it does not find', async () => {
  const caches = standInCaches(stored(), { has: false });
  await expect(modelOnDevice()).resolves.toBe(false);
  expect(caches.has).toHaveBeenCalledWith(MODEL_CACHE);
  expect(caches.open).not.toHaveBeenCalled();
});

// Last in this file: the agreement holds for the rest of the visit.
it("counts this visit's agreement when storage refuses to keep it", async () => {
  localStorage.removeItem(CONSENT_KEY);
  useOnboardingStore.setState({ isComplete: true });
  const refused = jest.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
  });
  try {
    const { result } = renderHook(() => useDetectionModel());
    await act(async () => {
      result.current.download();
    });
    expect(localStorage.getItem(CONSENT_KEY)).toBeNull();

    standInCaches(stored());
    await expect(modelOnDevice()).resolves.toBe(true);
  } finally {
    refused.mockRestore();
  }
});
