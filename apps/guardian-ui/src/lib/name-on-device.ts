/**
 * The name sent to a server of one's own, as this device keeps it
 *
 * Settings keeps the name in `safeos_user_settings`, beside the device's
 * other profile choices, each time it is saved. It shows wherever the
 * profile holds no name: a profile not read yet, or one that came before
 * the name was saved.
 *
 * @module lib/name-on-device
 */

const KEY = 'safeos_user_settings';

function readStored(): Record<string, unknown> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The name this device keeps; empty when it keeps none. */
export function readNameOnDevice(): string {
  if (typeof window === 'undefined') return '';
  const name = readStored().displayName;
  return typeof name === 'string' ? name : '';
}

/** Keeps the name with the device's other profile choices. */
export function keepNameOnDevice(displayName: string): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...readStored(), displayName }));
  } catch {
    // A browser that refuses storage: the server holds the name.
  }
}
