/**
 * A time of day as this device writes it
 *
 * @module lib/clock-time
 */

/** "14:05" or "2:05 PM", by the device's own locale and clock format. */
export function clockTime(at: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(at));
}
