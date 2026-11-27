/**
 * The page before setup in this tab's history. Each entry of the browser's
 * history this document shows is marked, in the entry's own state, with the
 * path this document showed before it: none for the entry the document opened
 * on, and none for an entry the browser's back or forward button reaches
 * before it was marked (setup's step 2, pushed on the same address, is one),
 * since the page before such an entry is not known. An entry the browser
 * returns to keeps its mark.
 * So setup's Back on its first step goes back only when the entry before
 * setup's is a page of this site this document showed, and otherwise opens
 * the home page; a person who came to setup from another site and returned to
 * it with the back button never leaves the site by Back.
 *
 * @module lib/visit-trail
 */

import { barePath } from './app-routes';

/** This document, told apart from an earlier one of the same tab (a reload keeps the entries' states). */
const DOCUMENT = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const MARK = 'safeosFrom';

interface Mark {
  document: string;
  from: string | null;
}

let lastShown: string | null = null;

/** True from the browser's back or forward button until the shell notes the path it shows. */
let traversed = false;
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    traversed = true;
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** This document's mark on the entry shown, or null. */
function markOfEntry(): Mark | null {
  if (typeof window === 'undefined') return null;
  const state: unknown = window.history.state;
  const mark = isRecord(state) ? state[MARK] : undefined;
  if (!isRecord(mark) || mark.document !== DOCUMENT) return null;
  return typeof mark.from === 'string' || mark.from === null ? { document: DOCUMENT, from: mark.from } : null;
}

/** Notes a path this tab's document shows; the site's shell calls it on every change of address. */
export function notePath(pathname: string | null | undefined): void {
  const path = barePath(pathname);
  if (typeof window !== 'undefined' && markOfEntry() === null) {
    const state: unknown = window.history.state;
    const mark: Mark = { document: DOCUMENT, from: traversed ? null : lastShown };
    try {
      window.history.replaceState({ ...(isRecord(state) ? state : {}), [MARK]: mark }, '');
    } catch {
      // An entry that cannot be marked reads as one this document did not open from a page of its own.
    }
  }
  lastShown = path;
  traversed = false;
}

/**
 * The path this document showed before the entry shown, when that path is
 * neither `section` nor under it; null when the entry is the first this
 * document showed, was opened from `section` itself, or carries no mark of
 * this document.
 */
export function pathBefore(section: string): string | null {
  const from = markOfEntry()?.from ?? null;
  if (from === null) return null;
  const own = barePath(section);
  return from === own || from.startsWith(`${own}/`) ? null : from;
}
