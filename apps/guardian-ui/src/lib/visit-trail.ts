/**
 * The addresses this tab's document has shown, newest last. Setup's Back on
 * its first step returns to the page before setup when this document showed
 * one, and otherwise opens the home page.
 *
 * @module lib/visit-trail
 */

import { barePath } from './app-routes';

const shown: string[] = [];

/** Notes a path this tab's document shows; the site's shell calls it on every change of address. */
export function notePath(pathname: string | null | undefined): void {
  const path = barePath(pathname);
  if (shown[shown.length - 1] !== path) shown.push(path);
}

/** The newest path noted that is not `section` or under it; null when this document has shown nothing else. */
export function pathBefore(section: string): string | null {
  const own = barePath(section);
  for (let index = shown.length - 1; index >= 0; index -= 1) {
    const path = shown[index];
    if (path !== own && !path.startsWith(`${own}/`)) return path;
  }
  return null;
}
