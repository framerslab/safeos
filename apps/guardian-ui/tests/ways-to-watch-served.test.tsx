/** @jest-environment node */
/**
 * The ways to watch as they are served
 *
 * The four ways come in the HTML a browser gets before any script runs,
 * before this device is read: each a working link with its glyph, its name
 * and its line. The pet's photo and the square on the way Start watching
 * uses wait for the read.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WaysToWatch } from '@/components/dashboard/WaysToWatch';
import { bare, served, words } from './helpers/served-html';

const page = served(renderToStaticMarkup(<WaysToWatch setUp={null} subjects={null} />));

it('serves the label and the four ways in one order, each a working link', () => {
  expect(Array.from(page.querySelectorAll('h2'), (heading) => words(heading))).toEqual(['Ways to watch']);

  const lists = page.querySelectorAll('ul');
  expect(lists).toHaveLength(1);
  const items = Array.from(lists[0].children);
  expect(items).toHaveLength(4);
  expect(items.every((item) => item.tagName === 'LI')).toBe(true);

  const rows = items.map((item) => {
    const link = item.querySelector('a');
    return `${words(link?.querySelector('.way__name'))} | ${words(link?.querySelector('.way__line'))} | ${bare(link?.getAttribute('href'))}`;
  });
  expect(rows).toEqual([
    'Motion and sound | Alerts on movement or sound. | /monitor',
    "Lost and Found | Watches for your pet's colours. | /lost-found",
    'People | Alerts when someone is in view. | /security',
    'Wildlife | Alerts when an animal is in view. | /wildlife',
  ]);
});

it("draws each way's glyph for the eye alone, and no photo or square before the device is read", () => {
  const glyphs = Array.from(page.querySelectorAll('.way__glyph'));
  expect(glyphs).toHaveLength(4);
  for (const glyph of glyphs) {
    const drawn = glyph.querySelectorAll('svg');
    expect(drawn).toHaveLength(1);
    expect(drawn[0].getAttribute('aria-hidden')).toBe('true');
  }
  expect(page.querySelectorAll('img')).toHaveLength(0);
  expect(page.querySelectorAll('.way__square')).toHaveLength(0);
});
