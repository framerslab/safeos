/**
 * Whether this window's storage ends when the window closes
 *
 * A private window keeps nothing once it is closed, so SafeOS says so. No
 * browser tells a page outright. Chromium is told by timing: a private window
 * keeps its database in memory, where a commit asked to reach the disk costs
 * what any other commit costs. Firefox and Safari refuse a private window its
 * own folder, each with its own words. Where nothing can be told the answer
 * is false and the page says nothing. The method and its figures are those of
 * detectIncognito (MIT), https://github.com/Joe12387/detectIncognito.
 *
 * @module lib/short-lived-storage
 */

'use client';

import { useEffect, useState } from 'react';

export const WINDOW_STORAGE_MEMO = 'safeos-window-storage';

const PAYLOAD_BYTES = 16384;
const WRITES = 15;
const MAX_ROUNDS = 15;
const MIN_ROUNDS = 7;
const BUDGET_MS = 1000;
/** A disk makes the careful commit this many times slower, or more. */
const DISK_RATIO = 1.3;

/** V8 words this error in 51 characters; the timing below is calibrated for Chromium alone. */
function isV8(): boolean {
  try {
    (-1).toFixed(-1);
  } catch (error) {
    return (error as Error).message.length === 51;
  }
  return false;
}

function timedCommits(db: IDBDatabase, durability: 'strict' | 'relaxed'): Promise<number> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const payload = new Uint8Array(PAYLOAD_BYTES);
    let written = 0;
    const next = () => {
      if (written === WRITES) {
        resolve(performance.now() - started);
        return;
      }
      const tx = db.transaction('s', 'readwrite', { durability });
      tx.objectStore('s').put(payload, written);
      written += 1;
      tx.oncomplete = next;
      tx.onerror = tx.onabort = () => reject(tx.error);
    };
    next();
  });
}

function memoryBackedDatabase(): Promise<boolean> {
  return new Promise((resolve) => {
    const name = `safeos-window-check-${Math.random().toString(36).slice(2)}`;
    const done = (db: IDBDatabase | null, answer: boolean) => {
      db?.close();
      indexedDB.deleteDatabase(name);
      resolve(answer);
    };
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(name, 1);
    } catch {
      resolve(false);
      return;
    }
    request.onupgradeneeded = () => {
      request.result.createObjectStore('s');
    };
    request.onerror = () => done(null, false);
    request.onsuccess = () => {
      const db = request.result;
      void (async () => {
        // A browser that ignores the hint would time two alike commits.
        const probe = db.transaction('s', 'readwrite', { durability: 'strict' });
        const honoured = probe.durability === 'strict';
        probe.abort();
        if (!honoured) return done(db, false);
        const started = performance.now();
        await timedCommits(db, 'relaxed');
        await timedCommits(db, 'strict');
        const ratios: number[] = [];
        for (let round = 0; round < MAX_ROUNDS; round += 1) {
          const relaxed = await timedCommits(db, 'relaxed');
          const strict = await timedCommits(db, 'strict');
          ratios.push(relaxed > 0 ? strict / relaxed : Infinity);
          if (ratios.length >= MIN_ROUNDS && performance.now() - started >= BUDGET_MS) break;
        }
        ratios.sort((a, b) => a - b);
        done(db, ratios[ratios.length >> 1] < DISK_RATIO);
      })().catch(() => done(db, false));
    };
  });
}

async function folderRefused(): Promise<boolean> {
  if (typeof navigator.storage?.getDirectory !== 'function') return false;
  try {
    await navigator.storage.getDirectory();
    return false;
  } catch (error) {
    const said = error instanceof Error ? error.message : String(error);
    return said.includes('Security error') || said.includes('unknown transient reason');
  }
}

/** True when this window's storage ends when the window closes, where the browser lets a page tell. False where it cannot be told. */
export async function storageEndsWithWindow(): Promise<boolean> {
  try {
    const memo = window.sessionStorage.getItem(WINDOW_STORAGE_MEMO);
    if (memo === 'ends' || memo === 'kept') return memo === 'ends';
  } catch {
    // No memo can be read: the probe runs.
  }
  let ends = false;
  try {
    ends = isV8() ? await memoryBackedDatabase() : await folderRefused();
  } catch {
    ends = false;
  }
  try {
    window.sessionStorage.setItem(WINDOW_STORAGE_MEMO, ends ? 'ends' : 'kept');
  } catch {
    // The answer lasts for this page.
  }
  return ends;
}

/** False until known. */
export function useStorageEnds(): boolean {
  const [ends, setEnds] = useState(false);
  useEffect(() => {
    let live = true;
    void storageEndsWithWindow().then((answer) => {
      if (live) setEnds(answer);
    });
    return () => {
      live = false;
    };
  }, []);
  return ends;
}
