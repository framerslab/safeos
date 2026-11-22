/** @jest-environment node */
/**
 * The settings pages' stylesheet
 *
 * src/styles/settings.css is read as text. It loads after the app's and
 * Watch for's stylesheets, takes every colour from a token of the look, names
 * no monospaced face and no size under 15 px, sets its two weights to 400
 * and 600, and writes its layout stops in em.
 */

import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', 'src');
const read = (file: string) => fs.readFileSync(path.join(SRC, file), 'utf8');
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const settingsCss = () => withoutComments(read('styles/settings.css'));

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

// The colours CSS knows by name.
const NAMED_COLOURS = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood ' +
    'cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray ' +
    'darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen ' +
    'darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue ' +
    'firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew ' +
    'hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan ' +
    'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
    'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue ' +
    'mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred ' +
    'midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid ' +
    'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple ' +
    'rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue ' +
    'slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white ' +
    'whitesmoke yellow yellowgreen'
  ).split(' ')
);

// Each rule of a stylesheet as its selector and its declarations, the rules
// inside a media or a supports block included.
function rulesOf(css: string): { selector: string; declarations: [string, string][] }[] {
  return Array.from(withoutComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g), (found) => ({
    selector: found[1].replace(/\s+/g, ' ').trim(),
    declarations: found[2]
      .split(';')
      .map((line) => line.trim())
      .filter((line) => line.includes(':'))
      .map((line): [string, string] => [line.slice(0, line.indexOf(':')).trim(), line.slice(line.indexOf(':') + 1).trim()]),
  }));
}

/** The `@import` lines of a stylesheet, in order, as the paths they name. */
function importsOf(file: string): string[] {
  return Array.from(withoutComments(read(file)).matchAll(/@import\s+['"]([^'"]+)['"]/g), (found) => found[1]);
}

// Each font size that is not a size token or a rem or px value of 15 px or more.
function sizeFaults(css: string): string[] {
  const faults: string[] = [];
  for (const { declarations } of rulesOf(css)) {
    for (const [property, value] of declarations) {
      if (property !== 'font-size') continue;
      const number = value.match(/^(\d*\.?\d+)(rem|px)$/);
      const px = number ? (number[2] === 'rem' ? Number(number[1]) * 16 : Number(number[1])) : 0;
      if (!(/^var\(--type-[\w-]+\)$/.test(value) || px >= 15)) faults.push(value);
    }
  }
  return faults;
}

// Each colour written in place of a token: a hex value, a colour function and
// a colour's name. A mask's black and transparent are not colours a person sees.
function colourFaults(css: string): string[] {
  const faults: string[] = withoutComments(css).match(/#[0-9a-f]{3,8}(?![\w-])/gi) ?? [];
  for (const { declarations } of rulesOf(css)) {
    for (const [property, value] of declarations) {
      const plain = value.replace(/var\(--[\w-]+\)/g, ' ').toLowerCase();
      faults.push(...(plain.match(/(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/g) ?? []));
      const mask = /^(-webkit-)?mask(-image)?$/.test(property);
      for (const word of plain.match(/(?<![\w-])[a-z]+(?![\w(-])/g) ?? []) {
        if (NAMED_COLOURS.has(word) && !(mask && word === 'black')) faults.push(word);
      }
    }
  }
  return faults;
}

/** Each font-weight value the stylesheet sets. */
function fontWeights(css: string): string[] {
  return rulesOf(css).flatMap(({ declarations }) =>
    declarations.filter(([property]) => property === 'font-weight').map(([, value]) => value)
  );
}

/** Each width a media query of the stylesheet names. */
function stops(css: string): string[] {
  return Array.from(withoutComments(css).matchAll(/\((?:min|max)-width\s*:\s*([^)]+)\)/g), (found) => found[1].trim());
}

it('loads after the app and Watch for stylesheets', () => {
  const order = importsOf('app/globals.css');
  expect(order).toContain('../styles/settings.css');
  expect(order.indexOf('../styles/settings.css')).toBeGreaterThan(order.indexOf('../styles/app.css'));
  expect(order.indexOf('../styles/settings.css')).toBeGreaterThan(order.indexOf('../styles/watch-for.css'));
});

it('takes every colour from a token', () => {
  expect(colourFaults(settingsCss())).toEqual([]);
  // The check finds a colour written in place of a token.
  expect(colourFaults('.settings { color: #0b131b; background: white; border-color: rgb(0 0 0); }')).toEqual([
    '#0b131b',
    'rgb(',
    'white',
  ]);
});

it('names no monospaced face and no size under 15 px', () => {
  const css = settingsCss();
  expect(css).not.toContain('--font-mono');
  expect(css).not.toContain('monospace');
  expect(sizeFaults(css)).toEqual([]);
  expect(sizeFaults('.a { font-size: 0.875rem; } .b { font-size: 0.9375rem; } .c { font-size: small; }')).toEqual([
    '0.875rem',
    'small',
  ]);
});

it('sets its two weights to 400 and 600', () => {
  const css = settingsCss();
  expect(css).toMatch(/\.settings\s*\{[^}]*--weight-bold:\s*600/);
  const weights = fontWeights(css);
  expect(weights.length).toBeGreaterThan(0);
  expect(weights.every((w) => w === 'var(--weight-regular)' || w === 'var(--weight-bold)')).toBe(true);
});

it('writes its layout stops in em', () => {
  const found = stops(settingsCss());
  expect(found.length).toBeGreaterThan(0);
  expect(found.every((stop) => ['48em', '64em', '90em'].includes(stop))).toBe(true);
});
