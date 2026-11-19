/** @jest-environment node */
/**
 * The title and the robots tag of the app's own pages
 *
 * What an app page shows depends on the device that opens it, so each one
 * asks search engines not to index it. Its title is its own name and
 * " | SafeOS", set whole: the root layout's pattern is for the pages a
 * visitor reads. A way's page carries the name and the line of its row on the
 * dashboard. robots.txt lets a crawler fetch every page that carries the tag,
 * because a crawler that may not fetch a page never reads its tag, and the
 * sitemap lists none of them.
 */

import type { Metadata } from 'next';
import { metadata as dashboardMetadata } from '@/app/dashboard/layout';
import { metadata as monitorMetadata } from '@/app/monitor/layout';
import { metadata as lostFoundMetadata } from '@/app/lost-found/layout';
import { metadata as securityMetadata } from '@/app/security/layout';
import { metadata as wildlifeMetadata } from '@/app/wildlife/layout';
import { metadata as historyMetadata } from '@/app/history/layout';
import { metadata as settingsMetadata } from '@/app/settings/layout';
import { metadata as setupMetadata } from '@/app/setup/layout';
import { metadata as napMetadata } from '@/app/nap/layout';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { WAYS, type WayId } from '@/lib/app-routes';

// Each page's address, its name, its description and its metadata.
const PAGES: [string, string, string, Metadata][] = [
  ['/dashboard/', 'Dashboard', 'Motion and sound alerts that run in your browser.', dashboardMetadata],
  ['/monitor/', 'Motion and sound', 'Alerts on movement or sound.', monitorMetadata],
  ['/lost-found/', 'Lost and Found', 'Watches for your pet’s colours.', lostFoundMetadata],
  ['/security/', 'People', 'Alerts when someone is in view.', securityMetadata],
  ['/wildlife/', 'Wildlife', 'Alerts when an animal is in view.', wildlifeMetadata],
  ['/history/', 'History', 'Motion and sound alerts that run in your browser.', historyMetadata],
  ['/settings/', 'Settings', 'Motion and sound alerts that run in your browser.', settingsMetadata],
  [
    '/setup/',
    'Setup',
    'Set up SafeOS Guardian in six steps: a welcome, the safety notice, what you are watching, camera and microphone access, notifications and a summary.',
    setupMetadata,
  ],
  ['/nap/', 'Nap Mode', 'A watch while you rest, with a reminder when your planned time is up.', napMetadata],
];

const WAY_PAGES: Record<WayId, Metadata> = {
  monitor: monitorMetadata,
  'lost-found': lostFoundMetadata,
  security: securityMetadata,
  wildlife: wildlifeMetadata,
};

const SECTIONS = /\/(dashboard|monitor|lost-found|security|wildlife|history|settings|setup)\//;

it.each(PAGES)('titles %s whole, outside the pattern the reading pages carry', (pagePath, name, description, metadata) => {
  const title = `${name} | SafeOS`;
  expect(metadata.title).toEqual({ absolute: title });
  expect(metadata.openGraph?.title).toBe(title);
  expect(metadata.twitter?.title).toBe(title);
  expect(metadata.alternates?.canonical).toBe(pagePath);
  expect(metadata.description).toBe(description);
});

it.each(PAGES)('asks search engines not to index %s', (_pagePath, _name, _description, metadata) => {
  expect(metadata.robots).toEqual({ index: false, follow: true });
});

it('names each way\'s page as the dashboard\'s row names it', () => {
  expect(WAYS.map((way) => way.id).sort()).toEqual(Object.keys(WAY_PAGES).sort());
  for (const way of WAYS) {
    const metadata = WAY_PAGES[way.id];
    expect(metadata.title).toEqual({ absolute: `${way.name} | SafeOS` });
    expect(metadata.description).toBe(way.line);
  }
});

it('lets a crawler fetch every page that carries the tag, so the tag is read', () => {
  const { rules } = robots();
  const list = Array.isArray(rules) ? rules : [rules];
  expect(list).toHaveLength(1);
  expect(list[0].disallow).toEqual(['/api/', '/admin/', '/export/', '/webhooks/', '/private/']);
});

it('keeps the app\'s pages out of the sitemap and the home page and Help in it', () => {
  const urls = sitemap().map((entry) => entry.url);
  expect(urls.filter((url) => SECTIONS.test(url))).toEqual([]);
  // Nap Mode and the old addresses that forward are not listed either.
  expect(urls.filter((url) => /\/(nap|tutorial|analytics|profiles|donate)\//.test(url))).toEqual([]);
  expect(urls).toContain('https://safeos.sh/');
  expect(urls).toContain('https://safeos.sh/help/');
});
