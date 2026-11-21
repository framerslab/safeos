/**
 * Whether the detection model is on this device
 *
 * People and Wildlife watch with a detection model the person agrees to
 * download. Start watching opens their page at its own question, and asks
 * for no camera, unless the person agreed and every file of the model is
 * stored on this device. The loader stores each file under its own address
 * (lib/detection-model), so a download cut short leaves some files and not
 * others. TensorFlow asks for each weight file at the manifest's folder
 * followed by the path the manifest lists, so the same addresses are looked
 * up here.
 *
 * @module lib/model-on-device
 */

'use client';

import { useEffect, useState } from 'react';
import { MODEL_CACHE, modelAgreed } from './detection-model';
import { MODEL_URL } from './detection-model-facts';

interface StoredManifest {
  weightsManifest?: { paths?: unknown }[];
}

/**
 * True when the person agreed to the detection model, in this visit or an
 * earlier one, and its files are stored on this device.
 */
export async function modelOnDevice(): Promise<boolean> {
  try {
    if (!modelAgreed()) return false;
    if (typeof caches === 'undefined' || !(await caches.has(MODEL_CACHE))) return false;
    const cache = await caches.open(MODEL_CACHE);
    const stored = await cache.match(MODEL_URL);
    if (!stored) return false;
    const manifest = (await stored.json()) as StoredManifest;
    const groups = Array.isArray(manifest?.weightsManifest) ? manifest.weightsManifest : [];
    const paths = groups.flatMap((group) => (Array.isArray(group?.paths) ? group.paths.map(String) : []));
    if (paths.length === 0) return false;
    const folder = MODEL_URL.slice(0, MODEL_URL.lastIndexOf('/') + 1);
    const weights = await Promise.all(paths.map((path) => cache.match(folder + path)));
    return weights.every(Boolean);
  } catch {
    return false;
  }
}

/** null until read. */
export function useModelOnDevice(): boolean | null {
  const [here, setHere] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void modelOnDevice().then((answer) => {
      if (live) setHere(answer);
    });
    return () => {
      live = false;
    };
  }, []);
  return here;
}
