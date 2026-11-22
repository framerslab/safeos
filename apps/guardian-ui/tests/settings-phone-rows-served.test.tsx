/** @jest-environment node */
/**
 * Settings' first two rows as they are served
 *
 * Before the page's script runs, the look row's place is held empty, so
 * nothing moves when the row appears, and Help is already a working link.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PhoneRows } from '@/components/settings/PhoneRows';
import { bare, served, words } from './helpers/served-html';

describe("Settings' first rows as served", () => {
  it("holds the look row's place before script and keeps Help a working link", () => {
    const doc = served(renderToStaticMarkup(<PhoneRows />));
    const place = doc.querySelector('.settings-phone-rows .settings-row--place');
    expect(place?.getAttribute('aria-hidden')).toBe('true');
    expect(words(place)).toBe('');
    expect(doc.querySelector('button')).toBeNull();
    const help = doc.querySelector('.settings-phone-rows a.settings-row');
    expect(words(help)).toBe('Help');
    expect(bare(help?.getAttribute('href'))).toBe('/help');
  });
});
