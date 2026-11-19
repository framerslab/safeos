/** @jest-environment node */
/**
 * An old address, as a browser without script reads it
 *
 * The page at an old address forwards with its script. Its one line and its
 * link are in the served HTML, drawn at full strength, so a browser without
 * script reads where the page went and follows the link.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TutorialForward from '@/app/tutorial/page';
import AnalyticsForward from '@/app/analytics/page';
import ProfilesForward from '@/app/profiles/page';
import OldSupportAddress from '@/app/donate/page';
import { bare, served, words } from './helpers/served-html';

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

// The old address, its target, the page's one line, its link and its page.
const ROWS: [string, string, string, string, React.ComponentType][] = [
  ['/tutorial/', '/help/', 'Getting started is in Help.', 'Open help', TutorialForward],
  ['/analytics/', '/history/', 'Past alerts are in History.', 'Open history', AnalyticsForward],
  ['/profiles/', '/settings/detection/', 'Watch settings are in Detection.', 'Open Detection', ProfilesForward],
  ['/donate/', '/about/', 'Read about SafeOS.', 'Open About SafeOS', OldSupportAddress],
];

it('serves the line and the link for a browser without script', () => {
  for (const [from, to, line, link, Page] of ROWS) {
    const markup = renderToStaticMarkup(<Page />);
    const page = served(markup);
    const headings = Array.from(page.querySelectorAll('h1'));
    expect([from, headings.map((heading) => words(heading))]).toEqual([from, [line]]);
    // next/link drops the last slash outside the build.
    const links = Array.from(page.querySelectorAll('a'));
    expect([from, links.map((a) => [words(a), bare(a.getAttribute('href'))])]).toEqual([from, [[link, bare(to)]]]);
    expect([from, markup.includes('opacity-0')]).toEqual([from, false]);
    const parts: [string, Element | null][] = [['main', page.querySelector('main')], ['h1', headings[0]], ['a', links[0]]];
    for (const [name, element] of parts) {
      const hidden = element ? element.hasAttribute('hidden') || element.hasAttribute('style') : 'missing';
      expect([from, name, hidden]).toEqual([from, name, false]);
    }
  }
});
