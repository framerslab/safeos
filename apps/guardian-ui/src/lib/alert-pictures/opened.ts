/**
 * Which alert's picture is open over the page, if any.
 *
 * One picture is open at a time. The key that opened it takes focus back
 * when it closes; where that key went with the picture (the picture was
 * deleted), the alert's own block takes it.
 *
 * @module lib/alert-pictures/opened
 */

import type { Alert } from '../../stores/monitoring-store';

export interface OpenedPicture {
  alert: Alert;
  /** The key that opened it. */
  opener: HTMLElement | null;
}

/** The mark on an alert's picture block, which takes focus when the key that opened its picture has gone. */
export const PICTURE_BLOCK_MARK = 'data-picture-block';

let opened: OpenedPicture | null = null;
const listeners = new Set<() => void>();

function set(next: OpenedPicture | null): void {
  opened = next;
  for (const listener of [...listeners]) listener();
}

export function subscribeOpened(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const openedNow = (): OpenedPicture | null => opened;

/** Opens an alert's picture over the page. */
export function openPicture(alert: Alert, opener: HTMLElement | null): void {
  set({ alert, opener });
}

/** Closes the open picture with no focus change: the page that showed it is leaving. */
export function dropOpenedPicture(): void {
  if (opened) set(null);
}

/** Closes the open picture and gives focus back. */
export function closePicture(): void {
  const was = opened;
  if (!was) return;
  set(null);
  // Once the panel has left the page: the key that opened it, or the alert's own block.
  setTimeout(() => {
    if (was.opener && was.opener.isConnected) {
      was.opener.focus();
      return;
    }
    const block = Array.from(document.querySelectorAll<HTMLElement>(`[${PICTURE_BLOCK_MARK}]`))
      .find((el) => el.getAttribute(PICTURE_BLOCK_MARK) === was.alert.id);
    block?.focus();
  }, 0);
}
