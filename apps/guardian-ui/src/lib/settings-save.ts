/**
 * Whether this browser kept a change
 *
 * Every settings value saves the moment it moves. A browser that refuses this
 * site's storage (a locked-down or private profile) still moves the value for
 * the visit; the row then says it was not saved, and that stays.
 *
 * @module lib/settings-save
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const CHECK_KEY = 'safeos-settings-check';

/** True when this browser refuses to write or remove a key of this site's storage. */
export function writeRefused(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(CHECK_KEY, '1');
    window.localStorage.removeItem(CHECK_KEY);
    return false;
  } catch {
    return true;
  }
}

export type SaveNote = 'saved' | 'not-saved' | null;

/** How long "Saved" shows after a change. */
export const SAVED_FOR_MS = 2000;

/**
 * The note a row shows after a change: "saved" for two seconds, or
 * "not-saved" while the browser refuses its storage, which stays.
 */
export function useSaveNote(): { note: SaveNote; changed: () => void } {
  const [note, setNote] = useState<SaveNote>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const changed = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (writeRefused()) {
      setNote('not-saved');
      return;
    }
    setNote('saved');
    timer.current = setTimeout(() => {
      timer.current = null;
      setNote(null);
    }, SAVED_FOR_MS);
  }, []);

  return { note, changed };
}
