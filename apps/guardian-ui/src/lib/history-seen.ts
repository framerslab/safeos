/**
 * What this device held unseen when this code first ran
 *
 * Nothing a device saved before this release counts as new. The first time
 * this code runs on a device it keeps the ids of every alert and frame the
 * device then holds not marked as seen, under safeos-history-seen, and the
 * list does not change after that. Where the browser refuses to store it,
 * the list holds for the visit.
 *
 * @module lib/history-seen
 */

import { readKept, writeKept } from './visit-store';

export const HISTORY_SEEN_KEY = 'safeos-history-seen';

// A stored value that is not a JSON array of strings is read as none.
function idsOf(kept: string | null): string[] | null {
  if (kept === null) return null;
  try {
    const value: unknown = JSON.parse(kept);
    return Array.isArray(value) && value.every((id) => typeof id === 'string') ? value : null;
  } catch {
    return null;
  }
}

/**
 * The ids this device held, not marked as seen, when this code first ran on
 * it. The first call writes them from `unseenNow`; every later call reads
 * them, and `unseenNow` is not called.
 */
export function heldAtFirstRun(unseenNow: () => string[]): ReadonlySet<string> {
  const kept = idsOf(readKept(HISTORY_SEEN_KEY));
  if (kept) return new Set(kept);
  const ids = unseenNow();
  writeKept(HISTORY_SEEN_KEY, JSON.stringify(ids));
  return new Set(ids);
}
