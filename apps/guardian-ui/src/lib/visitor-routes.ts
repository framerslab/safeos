/**
 * Visitor routes
 *
 * The app's own pages are listed in lib/app-routes. Every other address (the
 * home page, the pages a visitor reads and the page for an address the site
 * does not have) carries the visitor header and footer.
 *
 * @module lib/visitor-routes
 */

import { barePath, isAppRoute } from './app-routes';

export { barePath };

export function isHomeRoute(pathname: string | null | undefined): boolean {
  return barePath(pathname) === '/';
}

/** Every address that is not one of the app's own pages, an address the site does not have among them. */
export function isVisitorRoute(pathname: string | null | undefined): boolean {
  return !isAppRoute(pathname);
}
