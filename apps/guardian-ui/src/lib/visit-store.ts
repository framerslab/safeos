/**
 * Storage that lasts the visit when the browser refuses it
 *
 * A browser can refuse to read or write this site's storage (a blocked
 * setting, a full device). What SafeOS would have kept is then held in memory
 * until the tab closes, so a page works for the visit.
 *
 * @module lib/visit-store
 */

const visit = new Map<string, string>();
let refused = false;

export function readKept(key: string): string | null {
  if (visit.has(key)) return visit.get(key) ?? null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    refused = true;
    return null;
  }
}

/** False when the browser refused the write and the value lasts for this visit only. */
export function writeKept(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    visit.delete(key);
    return true;
  } catch {
    refused = true;
    visit.set(key, value);
    return false;
  }
}

/** True once the browser has refused a read or a write in this visit. */
export function storageRefused(): boolean {
  return refused;
}

/** Empties what the visit holds. For tests. */
export function forgetVisit(): void {
  visit.clear();
  refused = false;
}
