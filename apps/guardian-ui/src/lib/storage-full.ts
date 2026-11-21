/**
 * A device out of room
 *
 * A device out of room refuses new alerts and pictures. SafeOS notes it once
 * for the visit so the dashboard can say so, and the alert sound plays all
 * the same: a save that fails for lack of room never stops the alert it was
 * saving.
 *
 * @module lib/storage-full
 */

import type { StateStorage } from 'zustand/middleware';

const FULL_NAMES = new Set(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED']);

let full = false;
const listeners = new Set<() => void>();

/** True for the error a browser raises when this site's storage is full. */
export function isStorageFull(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const name = (error as { name?: unknown }).name;
  return typeof name === 'string' && FULL_NAMES.has(name);
}

/** Remembers, for the visit, that a save failed for lack of room, and tells the listeners. Any other error is ignored. */
export function noteStorageFull(error: unknown): void {
  if (full || !isStorageFull(error)) return;
  full = true;
  listeners.forEach((listener) => listener());
}

export function storageIsFull(): boolean {
  return full;
}

export function onStorageFull(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** localStorage for a persisted store: a refused write is noted and never thrown, so the store's action goes on. */
export const guardedStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch (error) {
      noteStorageFull(error);
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      // A browser that refuses storage keeps the record; nothing else is lost.
    }
  },
};

/** For tests. */
export function forgetStorageFull(): void {
  full = false;
}
