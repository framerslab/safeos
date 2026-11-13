/**
 * Alert ids made in the browser.
 *
 * @module lib/alert-id
 */

/** A kind, the time and a random part, so two tabs that raise an alert in the same millisecond keep both. */
export function newAlertId(kind: string, at: number = Date.now()): string {
  return `${kind}-${at}-${Math.random().toString(36).slice(2, 9)}`;
}
