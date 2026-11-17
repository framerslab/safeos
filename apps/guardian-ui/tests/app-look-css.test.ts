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

// Each font size a stylesheet sets that is under 16 px.
function sizeFaults(css: string): string[] {
  const faults: string[] = [];
  const sizes = Array.from(withoutComments(css).matchAll(/font-size\s*:\s*([^;}]+)/g), (found) => found[1].trim());
  for (const size of sizes) {
    for (const [, value, unit] of Array.from(size.matchAll(/(\d*\.?\d+)(rem|px)\b/g))) {
      const px = unit === 'rem' ? Number(value) * 16 : Number(value);
      if (px < 16) faults.push(size);
    }
  }
  return faults;
}

// Each colour a stylesheet writes itself instead of taking it from a token.
function colourFaults(css: string): string[] {
  const hexes = css.match(/#[0-9a-f]{3,8}(?![\w-])/gi) ?? [];
  return [
    ...hexes.filter((hex) => !LIGHT_TOKENS.includes(hex.toLowerCase())),
    ...(withoutComments(css).match(/rgba?\(/g) ?? []),
  ];
}

it("the app's stylesheet is loaded after the visitor pages'", () => {
  const globals = read('app/globals.css');
  const visitor = globals.indexOf("@import '../styles/visitor.css';");
  const app = globals.indexOf("@import '../styles/app.css';");
  expect(visitor).toBeGreaterThan(-1);
  expect(app).toBeGreaterThan(visitor);
});

it('takes every colour from a token', () => {
  expect(colourFaults(read('styles/app.css'))).toEqual([]);
});

it('names no monospaced face and no size under 16 px', () => {
  const css = read('styles/app.css');
  expect(css).not.toContain('--font-mono');
  expect(css).not.toContain('monospace');
  expect(sizeFaults(css)).toEqual([]);
});

it('finds a size that is not a token and a colour that is not one, however each is written', () => {
  expect(sizeFaults('.app-more__row { font-size: 0.875em; }')).toEqual(['0.875em']);
  expect(sizeFaults('.app-more__row { font-size: 90%; }')).toEqual(['90%']);
  expect(sizeFaults('.app-more__row { font-size: small; }')).toEqual(['small']);
  expect(sizeFaults('@media (min-width: 48em) { .app-more__row { font-size: 0.9375rem; } }')).toEqual(['0.9375rem']);
  expect(
    sizeFaults('html:has(.app-shell) { font-size: 100%; } .a { font-size: var(--type-word-size); } .b { font-size: 1rem; } .c { font-size: 18px; }')
  ).toEqual([]);
  expect(colourFaults('.app-more__row { color: hsl(0 0% 100%); }')).toEqual(['hsl(']);
  expect(colourFaults('.app-more__row { background: oklch(0.7 0.1 150); }')).toEqual(['oklch(']);
  expect(colourFaults('.app-more__row { color: white; border-bottom: 1px solid RebeccaPurple; }')).toEqual(['white', 'rebeccapurple']);
  expect(colourFaults('.app-more__row { color: #123456; }')).toEqual(['#123456']);
  expect(colourFaults('.app-more__row { background: linear-gradient(to right, black, transparent); }')).toEqual(['black']);
  expect(
    colourFaults(
      '.a { mask-image: linear-gradient(to right, black calc(100% - 24px), transparent); color: var(--color-steel-50); background: transparent; }' +
        ' .b { background: color-mix(in srgb, var(--color-steel-950) 80%, transparent); white-space: nowrap; }'
    )
  ).toEqual([]);
});
