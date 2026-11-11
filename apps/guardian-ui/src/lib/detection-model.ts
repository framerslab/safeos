'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { ObjectDetection } from '@tensorflow-models/coco-ssd';
import { useOnboardingStore } from '@/stores/onboarding-store';

export type DetectionModelStatus = 'idle' | 'loading' | 'ready' | 'error';
const initialState = { status: 'idle' as DetectionModelStatus, error: null as string | null };
let state = initialState;
let model: ObjectDetection | null = null;
let loading: Promise<ObjectDetection> | null = null;
let agreed = false;
const CONSENT_KEY = 'safeos-detection-model-consent';
const listeners = new Set<() => void>();

function update(status: DetectionModelStatus, error: string | null = null) {
  state = { status, error };
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Called by detectors only after the page has obtained download agreement. */
export function loadDetectionModel(): Promise<ObjectDetection> {
  if (model) return Promise.resolve(model);
  if (loading) return loading;
  update('loading');
  loading = (async () => {
    try {
      const tf = await import('@tensorflow/tfjs');
      const coco = await import('@tensorflow-models/coco-ssd');
      await tf.setBackend('webgl');
      await tf.ready();
      model = await coco.load({ base: 'lite_mobilenet_v2' });
      update('ready');
      return model;
    } catch (error) {
      update('error', error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export function useDetectionModel() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => initialState);
  const setupComplete = useOnboardingStore(s => s.isComplete);

  useEffect(() => {
    if (!setupComplete) return;
    try { agreed = agreed || localStorage.getItem(CONSENT_KEY) === '1'; } catch { /* Session agreement still works. */ }
    if (agreed) void loadDetectionModel().catch(() => {});
  }, [setupComplete]);

  const download = useCallback(() => {
    if (!setupComplete) return;
    agreed = true;
    try { localStorage.setItem(CONSENT_KEY, '1'); } catch { /* Ask again next session if storage is unavailable. */ }
    void loadDetectionModel().catch(() => {});
  }, [setupComplete]);

  return { ...snapshot, setupComplete, download };
}
