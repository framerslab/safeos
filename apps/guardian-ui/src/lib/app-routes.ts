/**
 * App routes
 *
 * The app's own pages carry the app's header and, on a phone, its bar. Every
 * other address is a page a visitor reads (the home page, About, the FAQ, the
 * guides, the blog, Privacy, Terms, the old support address and the page for
 * an address the site does not have) and carries the visitor header.
 *
 * @module lib/app-routes
 */

export type WayId = 'monitor' | 'lost-found' | 'security' | 'wildlife';

export interface Way {
  id: WayId;
  /** The way's page, with its closing slash. */
  href: string;
  name: string;
  /** One line a new person can choose from. */
  line: string;
}

/** The four ways to watch, in the one order every page shows them. */
export const WAYS: readonly Way[] = [
  { id: 'monitor', href: '/monitor/', name: 'Motion and sound', line: 'Alerts on movement or sound.' },
  { id: 'lost-found', href: '/lost-found/', name: 'Lost and Found', line: 'Watches for your pet’s colours.' },
  { id: 'security', href: '/security/', name: 'People', line: 'Alerts when someone is in view.' },
  { id: 'wildlife', href: '/wildlife/', name: 'Wildlife', line: 'Alerts when an animal is in view.' },
];

export interface Destination {
  href: string;
  label: string;
  /** The address, without its closing slash, that the destination's pages sit under. */
  section: string;
}

/**
 * History opened on its Local Timeline, the device's own alerts, whatever view it would open on
 * by itself: a link from an alert the device keeps, such as a sighting, goes there.
 */
export const LOCAL_TIMELINE_HREF = '/history/?view=local';

/** The app's four destinations, in the header's order. A phone's bar carries the first three. */
export const DESTINATIONS: readonly Destination[] = [
  { href: '/dashboard/', label: 'Dashboard', section: '/dashboard' },
  { href: '/history/', label: 'History', section: '/history' },
  { href: '/settings/', label: 'Settings', section: '/settings' },
  { href: '/help/', label: 'Help', section: '/help' },
];

// The hub, the four ways, History, Settings and its pages, Help and its
// guides, Setup, the two pages of a connected server, the two pages History
// will take in, Nap Mode, and the three old addresses that forward to an app
// page.
const APP_SECTIONS = [
  '/dashboard', '/monitor', '/lost-found', '/security', '/wildlife', '/history', '/settings', '/help', '/setup',
  '/webhooks', '/admin', '/export', '/nap', '/tutorial', '/analytics', '/profiles',
];

// The pages built in the readable look: their whole body follows the device's
// light or dark setting before any script runs. The watch is /monitor.
const LOOK_SECTIONS = ['/dashboard', '/monitor', '/tutorial', '/analytics', '/profiles'];

// Single pages built in the readable look inside a section that is not: one
// path each, so a page still on its old layout keeps it.
const LOOK_PAGES = ['/settings', '/settings/data', '/settings/server'];

/** A pathname without its query, fragment and closing slash; the root stays "/". */
export function barePath(pathname: string | null | undefined): string {
  const bare = (pathname || '').split(/[?#]/)[0].replace(/\/+$/, '');
  return bare === '' ? '/' : bare;
}

const under = (path: string, sections: readonly string[]) =>
  sections.some((section) => path === section || path.startsWith(`${section}/`));

export function isAppRoute(pathname: string | null | undefined): boolean {
  return under(barePath(pathname), APP_SECTIONS);
}

/** The bar at the foot of a phone shows on every app page but Setup. */
export function showsPhoneBar(pathname: string | null | undefined): boolean {
  const path = barePath(pathname);
  return under(path, APP_SECTIONS) && !under(path, ['/setup']);
}

export function isLookBuiltRoute(pathname: string | null | undefined): boolean {
  const path = barePath(pathname);
  return under(path, LOOK_SECTIONS) || LOOK_PAGES.includes(path);
}

/** The destination whose page, or a page under it, is being read; null on any other page. */
export function destinationOf(pathname: string | null | undefined): string | null {
  const path = barePath(pathname);
  return DESTINATIONS.find((d) => under(path, [d.section]))?.section ?? null;
}

/** The way an address names (`?next=monitor`); any other value names none. */
export function wayFromParam(value: string | null | undefined): Way | null {
  return WAYS.find((way) => way.id === value) ?? null;
}
