/** @jest-environment node */
/**
 * The app's stylesheet
 *
 * Read as text: it loads after the visitor pages' stylesheet, takes every
 * colour from a token of the look, and names no monospaced face and no size
 * under 16 px.
 */

import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', 'src');
const read = (file: string) => fs.readFileSync(path.join(SRC, file), 'utf8');
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// The light look's token values, as the device block of visitor.css lists
// them (html.light's, design-system.css).
const LIGHT_TOKENS = [
  '#f8f9fa',
  '#f1f3f4',
  '#e8ebee',
  '#dee2e6',
  '#ced4da',
  '#adb5bd',
  '#868e96',
  '#5a6270',
  '#495057',
  '#212529',
  '#0f1215',
  '#14532d',
  '#052e16',
  '#ffffff',
  '#991b1b',
];

it("the app's stylesheet is loaded after the visitor pages'", () => {
  const globals = read('app/globals.css');
  const visitor = globals.indexOf("@import '../styles/visitor.css';");
  const app = globals.indexOf("@import '../styles/app.css';");
  expect(visitor).toBeGreaterThan(-1);
  expect(app).toBeGreaterThan(visitor);
});

it('takes every colour from a token', () => {
  const css = read('styles/app.css');
  const hexes = css.match(/#[0-9a-f]{3,8}(?![\w-])/gi) ?? [];
  for (const hex of hexes) expect([hex, LIGHT_TOKENS.includes(hex.toLowerCase())]).toEqual([hex, true]);
  expect(withoutComments(css)).not.toMatch(/rgba?\(/);
});

it('names no monospaced face and no size under 16 px', () => {
  const css = read('styles/app.css');
  expect(css).not.toContain('--font-mono');
  expect(css).not.toContain('monospace');
  const sizes = Array.from(withoutComments(css).matchAll(/font-size\s*:\s*([^;}]+)/g), (found) => found[1].trim());
  for (const size of sizes) {
    for (const [, value, unit] of Array.from(size.matchAll(/(\d*\.?\d+)(rem|px)\b/g))) {
      const px = unit === 'rem' ? Number(value) * 16 : Number(value);
      expect([size, px >= 16]).toEqual([size, true]);
    }
  }
});
