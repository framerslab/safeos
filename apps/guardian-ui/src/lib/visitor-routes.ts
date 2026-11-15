/**
 * Visitor routes
 *
 * The pages a visitor can read before using the app (the home page and the
 * pages the sitemap lists) carry the visitor header and footer. Every other
 * route is an app screen and keeps the app's own header.
 *
 * @module lib/visitor-routes
 */

const VISITOR_SECTIONS = ['/about', '/faq', '/help', '/tutorials', '/tutorial', '/blog', '/privacy', '/terms', '/donate'];

/** A pathname without its trailing slash; the root stays "/". */
export function barePath(pathname: string | null | undefined): string {
  const bare = (pathname || '').split(/[?#]/)[0].replace(/\/+$/, '');
  return bare === '' ? '/' : bare;
}

export function isHomeRoute(pathname: string | null | undefined): boolean {
  return barePath(pathname) === '/';
}

export function isVisitorRoute(pathname: string | null | undefined): boolean {
  const bare = barePath(pathname);
  if (bare === '/') return true;
  return VISITOR_SECTIONS.some((section) => bare === section || bare.startsWith(`${section}/`));
}
