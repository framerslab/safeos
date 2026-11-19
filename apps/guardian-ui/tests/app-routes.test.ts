/** @jest-environment node */
/**
 * Which pages are the app's
 *
 * The app's own pages carry the app's header and, on a phone, its bar; every
 * other address, one the site does not have among them, is a page a visitor
 * reads. One list names the app's pages, the ones that show the phone bar,
 * the ones built in the readable look, the four destinations and the four
 * ways to watch.
 */

import {
  DESTINATIONS,
  WAYS,
  destinationOf,
  isAppRoute,
  isLookBuiltRoute,
  showsPhoneBar,
  wayFromParam,
} from '@/lib/app-routes';

it("names the app's own pages", () => {
  for (const pathname of [
    '/dashboard/',
    '/monitor',
    '/lost-found/',
    '/lost-found/gallery/',
    '/security/',
    '/wildlife/',
    '/history/',
    '/settings/',
    '/settings/notifications/',
    '/help/',
    '/help/integrations/telegram/',
    '/setup/',
    '/setup/?again=1',
    '/webhooks/',
    '/admin/',
    '/export/',
    '/nap/',
    '/tutorial',
    '/analytics/',
    '/profiles/',
  ]) {
    expect([pathname, isAppRoute(pathname)]).toEqual([pathname, true]);
  }
});

it('leaves every other address to the visitor pages, an address the site does not have among them', () => {
  for (const pathname of [
    '/',
    '/about/',
    '/faq',
    '/tutorials/',
    '/tutorialsx',
    '/blog/how-safeos-guardian-works/',
    '/privacy/',
    '/terms/',
    '/donate/',
    '/no-such-page',
    '/dashboards',
  ]) {
    expect([pathname, isAppRoute(pathname)]).toEqual([pathname, false]);
  }
});

it('shows the phone bar on every app page but Setup', () => {
  for (const pathname of ['/dashboard/', '/history', '/settings/zones/', '/monitor/', '/help/']) {
    expect([pathname, showsPhoneBar(pathname)]).toEqual([pathname, true]);
  }
  for (const pathname of ['/setup/', '/setup/?next=monitor', '/', '/faq/']) {
    expect([pathname, showsPhoneBar(pathname)]).toEqual([pathname, false]);
  }
});

it('names the pages whose whole body is built in the readable look', () => {
  for (const pathname of ['/dashboard/', '/tutorial/', '/analytics', '/profiles/']) {
    expect([pathname, isLookBuiltRoute(pathname)]).toEqual([pathname, true]);
  }
  for (const pathname of ['/history/', '/monitor/', '/settings/', '/help/', '/setup/', '/nap/']) {
    expect([pathname, isLookBuiltRoute(pathname)]).toEqual([pathname, false]);
  }
});

it('gives the destination a page sits under', () => {
  expect(destinationOf('/dashboard/')).toBe('/dashboard');
  expect(destinationOf('/settings/detection/')).toBe('/settings');
  expect(destinationOf('/help/integrations/push/')).toBe('/help');
  expect(destinationOf('/monitor/')).toBeNull();
  expect(destinationOf('/lost-found/')).toBeNull();
  expect(destinationOf('/')).toBeNull();
});

it('lists the four ways in one order, each with a line of 33 characters or fewer', () => {
  expect(WAYS.map((w) => [w.id, w.href, w.name, w.line])).toEqual([
    ['monitor', '/monitor/', 'Motion and sound', 'Alerts on movement or sound.'],
    ['lost-found', '/lost-found/', 'Lost and Found', 'Watches for your pet’s colours.'],
    ['security', '/security/', 'People', 'Alerts when someone is in view.'],
    ['wildlife', '/wildlife/', 'Wildlife', 'Alerts when an animal is in view.'],
  ]);
  for (const way of WAYS) expect([way.id, way.line.length <= 33]).toEqual([way.id, true]);
  expect(DESTINATIONS.map((d) => [d.label, d.href])).toEqual([
    ['Dashboard', '/dashboard/'],
    ['History', '/history/'],
    ['Settings', '/settings/'],
    ['Help', '/help/'],
  ]);
});

it('reads the way an address names and takes any other value as none', () => {
  expect(wayFromParam('monitor')?.name).toBe('Motion and sound');
  expect(wayFromParam('lost-found')?.name).toBe('Lost and Found');
  expect(wayFromParam('security')?.name).toBe('People');
  expect(wayFromParam('wildlife')?.name).toBe('Wildlife');
  for (const value of ['nap', 'Monitor', '/monitor', '', null]) {
    expect([value, wayFromParam(value)]).toEqual([value, null]);
  }
});
