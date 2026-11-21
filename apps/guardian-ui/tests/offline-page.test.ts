/** @jest-environment node */
/**
 * The page a device shows offline for an address it has not stored
 *
 * public/offline.html is what the worker answers with when the device is
 * offline and the installed copy does not hold the address asked for. It
 * says so, offers the address again and a way to the dashboard, which the
 * installed copy does hold, and follows the device's light or dark setting
 * or the look a person chose here. It loads nothing, so it shows when the
 * installed copy holds little else.
 */

import fs from 'fs';
import path from 'path';
import { served, words } from './helpers/served-html';

const text = fs.readFileSync(path.join(__dirname, '..', 'public', 'offline.html'), 'utf8');
// The document's body, read as a page.
const page = served(text.slice(text.indexOf('<body>') + '<body>'.length, text.lastIndexOf('</body>')));

// Every value the file gives a property, the root's own text size left out:
// `html { font-size: 100% }` is the size the reader has set.
const declared = (property: string) =>
  Array.from(
    text.replace(/html\s*\{\s*font-size:\s*100%;\s*\}/, '').matchAll(new RegExp(`(?<![-\\w])${property}:\\s*([^;}]+)`, 'g'))
  ).map((match) => match[1].trim());

it('says the page is not on this device and gives two ways forward', () => {
  expect(Array.from(page.querySelectorAll('h1')).map((heading) => words(heading))).toEqual(['This page is not on this device']);
  expect(Array.from(page.querySelectorAll('p')).map((sentence) => words(sentence))).toEqual([
    'This device is offline, and this page is not saved on it. The dashboard opens without a connection.',
  ]);
  // The key comes before the link.
  expect(
    Array.from(page.querySelectorAll('button, a')).map((control) => `${control.tagName.toLowerCase()} ${words(control)}`)
  ).toEqual(['button Try again', 'a Open dashboard']);
  expect(page.querySelector('a')?.getAttribute('href')).toBe('/dashboard/');
});

it('makes no claim about a server and carries nothing from the page it replaces', () => {
  expect(text).not.toMatch(/monitoring server|internet connection|You're Offline|cached alerts|analysis results/i);
  // Plain characters only, but for the apostrophe a page's words are typed with.
  expect(Array.from(new Set<string>(text.match(/[^\x20-\x7e\n’]/g) || []))).toEqual([]);
});

it('loads nothing from anywhere', () => {
  expect(text).not.toMatch(/<link\b/i);
  expect(text).not.toMatch(/<img\b/i);
  expect(text).not.toMatch(/<script\b[^>]*\ssrc\s*=/i);
  expect(text).not.toMatch(/url\(/i);
  expect(text).not.toMatch(/@import/i);
});

it('takes both looks from the device, and the look a person chose on this device', () => {
  expect(text).toContain('@media (prefers-color-scheme: light)');
  const values = ['#0b131b', '#f4f5f6', '#9ca3af', '#4ade80', '#f8f9fa', '#0f1215', '#495057', '#14532d'];
  expect(values.filter((value) => !text.includes(value))).toEqual([]);
  // The chosen look is read before the page is drawn and outranks the device's.
  const scripts = Array.from(text.matchAll(/<script>([\s\S]*?)<\/script>/g)).map((match) => match[1]);
  expect(scripts.join('\n')).toContain("localStorage.getItem('guardian-theme')");
  expect(text).toContain(':root:not(.dark)');
  expect(text).toContain(':root.light');
});

it('uses two weights, nothing under 16 px and no monospaced face', () => {
  const weights = declared('font-weight');
  expect(weights.length).toBeGreaterThan(0);
  expect(weights.filter((weight) => weight !== '400' && weight !== '700')).toEqual([]);
  const sizes = declared('font-size');
  expect(sizes.length).toBeGreaterThan(0);
  expect(sizes.filter((size) => !/^\d*\.?\d+rem$/.test(size) || parseFloat(size) < 1)).toEqual([]);
  expect(text).not.toMatch(/monospace/i);
});
