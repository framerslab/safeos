/** @jest-environment node */
/**
 * The ways to watch as they are served
 *
 * The four ways come in the HTML a browser gets before any script runs,
 * before this device is read: each a working link with its glyph, its name
 * and its line. The pet's photo, the square on the way Start watching uses
 * and People's kept number wait for the read, so the first render in a
 * browser holds what was served.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WaysToWatch } from '@/components/dashboard/WaysToWatch';
import { useSecurityStore } from '@/stores/security-store';
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
    // Before the device is read, each row goes through setup with its way
    // named; setup sends a device already set up on to that way.
    'Motion and sound | Alerts on movement or sound. | /setup?next=monitor',
    "Lost and Found | Watches for your pet's colours. | /setup?next=lost-found",
    'People | Alerts when someone is in view. | /setup?next=security',
    'Wildlife | Alerts when an animal is in view. | /setup?next=wildlife',
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

it("holds People's own line on the first render when this device keeps a number of people, as the served page does", () => {
  // In a browser the kept number is in the store before the first render,
  // which has to hold what the served page holds for the page to carry on
  // from it.
  useSecurityStore.getState().setAllowedPersons(2);
  const first = served(renderToStaticMarkup(<WaysToWatch setUp={null} subjects={null} />));
  const people = Array.from(first.querySelectorAll('a')).find((link) => words(link.querySelector('.way__name')) === 'People');
  expect(words(people?.querySelector('.way__line'))).toBe('Alerts when someone is in view.');
  expect(people?.getAttribute('aria-label')).toBe('People: Alerts when someone is in view.');
});
