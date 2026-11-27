/** @jest-environment node */
/**
 * The GitHub link asked to open a new tab, in every place and form
 *
 * Renders GitHubLink with newTab in the header row, the Menu and the footer,
 * with the word alone and in full, with the star count handed to the build and
 * without it. Each opens GitHub in a new tab, so a watch running on the page
 * goes on, and its name ends with the words that say so.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GitHubLink, NEW_TAB_WORDS } from '@/components/visitor/GitHubLink';
import { served, words } from './helpers/served-html';

const COUNT = 'NEXT_PUBLIC_GITHUB_STARS';
const DAY = 'NEXT_PUBLIC_GITHUB_STARS_DATE';
const before = { count: process.env[COUNT], day: process.env[DAY] };

afterAll(() => {
  if (before.count === undefined) delete process.env[COUNT];
  else process.env[COUNT] = before.count;
  if (before.day === undefined) delete process.env[DAY];
  else process.env[DAY] = before.day;
});

/** A link's name: its label when it has one, otherwise its own content without what is hidden from assistive technology. */
function nameOf(link: Element): string {
  const label = link.getAttribute('aria-label');
  if (label) return label;
  const copy = link.cloneNode(true) as Element;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((part) => part.remove());
  return words(copy);
}

const STARS = [
  ['with a count', '58', '2026-11-20'],
  ['without a count', undefined, undefined],
] as const;

describe.each(STARS)('%s', (_, count, day) => {
  beforeEach(() => {
    if (count === undefined) delete process.env[COUNT];
    else process.env[COUNT] = count;
    if (day === undefined) delete process.env[DAY];
    else process.env[DAY] = day;
  });

  for (const place of ['row', 'menu', 'footer'] as const) {
    for (const full of [false, true]) {
      it(`opens a new tab and says so in ${place}${full ? ', in full' : ''}`, () => {
        const link = served(renderToStaticMarkup(<GitHubLink place={place} full={full} newTab />)).querySelector('a');
        expect(link).not.toBeNull();
        const seen = [link?.getAttribute('target'), link?.getAttribute('rel'), nameOf(link as Element).endsWith(NEW_TAB_WORDS)];
        expect([place, full, ...seen]).toEqual([place, full, '_blank', 'noopener noreferrer', true]);
      });

      it(`opens the same tab and says nothing of one in ${place}${full ? ', in full' : ''} without newTab`, () => {
        const link = served(renderToStaticMarkup(<GitHubLink place={place} full={full} />)).querySelector('a');
        const seen = [link?.getAttribute('target'), link?.getAttribute('rel'), nameOf(link as Element).includes(NEW_TAB_WORDS)];
        expect([place, full, ...seen]).toEqual([place, full, null, null, false]);
      });
    }
  }
});
