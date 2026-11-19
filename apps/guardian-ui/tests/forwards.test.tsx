/** @jest-environment jsdom */
/**
 * Old addresses that forward
 *
 * Four old addresses keep working as forwards to the page that does their job
 * now: /tutorial to Help, /analytics to History, /profiles to Detection and
 * /donate to About. Each replaces itself with its target, adding no entry to
 * the history, so Back returns to the page before it, and says in one line,
 * with one link, where the page went. Each asks search engines not to index
 * it and names its target as its address; the three app addresses carry the
 * target's own title, and /donate names About.
 */

import React from 'react';
import type { Metadata } from 'next';
import { cleanup, render, screen } from '@testing-library/react';
import TutorialForward, { metadata as tutorialMetadata } from '@/app/tutorial/page';
import AnalyticsForward, { metadata as analyticsMetadata } from '@/app/analytics/page';
import ProfilesForward, { metadata as profilesMetadata } from '@/app/profiles/page';
import OldSupportAddress, { metadata as donateMetadata } from '@/app/donate/page';
import { bare, words } from './helpers/served-html';

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

// The old address, its target, the page's one line, its link and its page,
// with the page's metadata and the title it carries.
type Row = [string, string, string, string, React.ComponentType, Metadata, Metadata['title']];
const ROWS: Row[] = [
  ['/tutorial/', '/help/', 'Getting started is in Help.', 'Open help', TutorialForward, tutorialMetadata, { absolute: 'Help | SafeOS' }],
  ['/analytics/', '/history/', 'Past alerts are in History.', 'Open history', AnalyticsForward, analyticsMetadata, { absolute: 'History | SafeOS' }],
  [
    '/profiles/',
    '/settings/detection/',
    'Watch settings are in Detection.',
    'Open Detection',
    ProfilesForward,
    profilesMetadata,
    { absolute: 'Detection | SafeOS' },
  ],
  ['/donate/', '/about/', 'Read about SafeOS.', 'Open About SafeOS', OldSupportAddress, donateMetadata, 'About SafeOS'],
];

beforeEach(() => {
  mockReplace.mockReset();
  mockPush.mockReset();
});
afterEach(cleanup);

it.each(ROWS)('forwards %s to %s with no entry in the history, saying where the page went', (_from, to, line, link, Page) => {
  render(<Page />);

  expect(mockReplace).toHaveBeenCalledTimes(1);
  expect(mockReplace).toHaveBeenCalledWith(to);
  expect(mockPush).not.toHaveBeenCalled();
  expect(screen.getAllByRole('heading', { level: 1 }).map((heading) => words(heading))).toEqual([line]);
  expect(screen.getAllByRole('link').map((a) => [words(a), bare(a.getAttribute('href'))])).toEqual([[link, bare(to)]]);
  expect(document.body.textContent).not.toMatch(/donat|sponsor|charit|non-?profit|tax-deductible|preset/i);
});

it.each(ROWS)('%s asks search engines not to index it and names its target as its address', (_from, to, _line, _link, _Page, metadata, title) => {
  expect(metadata.robots).toEqual({ index: false, follow: true });
  expect(metadata.alternates?.canonical).toBe(to);
  expect(metadata.title).toEqual(title);
});
