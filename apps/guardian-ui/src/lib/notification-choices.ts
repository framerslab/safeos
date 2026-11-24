/**
 * The browser notifications choice
 *
 * Notifications keeps its choices in `safeos_notifications_settings`. Every
 * write goes through writeNotificationChoices, which tells each reader in
 * this tab; another tab's write arrives through the storage event. So the
 * list's Notifications row follows the page's switch with no reload.
 *
 * @module lib/notification-choices
 */

import { useSyncExternalStore } from 'react';

export const NOTIFICATION_CHOICES_KEY = 'safeos_notifications_settings';

// Keys a server needs that are never kept on this device.
const NEVER_KEPT = ['emailResendApiKey', 'smsAuthToken'];

const listeners = new Set<() => void>();

function readStored(): Record<string, unknown> {
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_CHOICES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Browser notifications are on unless the person turned them off (on when nothing is saved). */
export function readBrowserNotificationsOn(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = readStored();
  return typeof stored.browserPush === 'boolean' ? stored.browserPush : true;
}

/** The choices kept on this device, never a key a server needs. */
export function readNotificationChoices(): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  const kept = readStored();
  for (const key of NEVER_KEPT) delete kept[key];
  return kept;
}

/** Saves the choices over those kept, never a key a server needs, and tells every reader in this tab. */
export function writeNotificationChoices(choices: Record<string, unknown>): void {
  const next: Record<string, unknown> = { ...readStored(), ...choices };
  for (const key of NEVER_KEPT) delete next[key];
  try {
    window.localStorage.setItem(NOTIFICATION_CHOICES_KEY, JSON.stringify(next));
  } catch {
    // A browser that refuses storage keeps nothing; the page says so.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const fromAnotherTab = (event: StorageEvent) => {
    if (event.key === NOTIFICATION_CHOICES_KEY || event.key === null) listener();
  };
  window.addEventListener('storage', fromAnotherTab);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', fromAnotherTab);
  };
}

/** The browser notifications choice; null in the served page, before it is read. */
export function useBrowserNotificationsOn(): boolean | null {
  return useSyncExternalStore<boolean | null>(subscribe, readBrowserNotificationsOn, () => null);
}
