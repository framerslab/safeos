/**
 * The day each public page last changed
 *
 * The sitemap gives a page this day as its last change, and the page prints
 * the same day in its structured data. A page with no entry here takes the
 * day of the build. Change a page's entry in the change that edits its words,
 * its layout or its pictures.
 *
 * @module lib/page-last-changed
 */

export const PAGE_LAST_CHANGED: Record<string, string> = {
  '/': '2026-11-26',
};

/** The day the home page's own files last changed, as YYYY-MM-DD. */
export const HOME_LAST_CHANGED = PAGE_LAST_CHANGED['/'];
