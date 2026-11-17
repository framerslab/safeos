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

// Each font size a stylesheet sets that is not a size token, the shell's
// 100% (the browser's own text size) or a rem or px value of 16 px or more.
function sizeFaults(css: string): string[] {
  const faults: string[] = [];
  for (const { selector, declarations } of rulesOf(css)) {
    for (const [property, value] of declarations) {
      if (property !== 'font-size') continue;
      const number = value.match(/^(\d*\.?\d+)(rem|px)$/);
      const px = number ? (number[2] === 'rem' ? Number(number[1]) * 16 : Number(number[1])) : 0;
      const ok = /^var\(--type-[\w-]+\)$/.test(value) || (value === '100%' && selector === 'html:has(.app-shell)') || px >= 16;
      if (!ok) faults.push(value);
    }
  }
  return faults;
}

// Each colour a stylesheet writes itself instead of taking it from a token:
// a hex value that is not one of the light look's tokens, a colour function
// that states a colour, and a colour's name. A mask's black and transparent
// are not colours a person sees, and transparent names none.
function colourFaults(css: string): string[] {
  const hexes = css.match(/#[0-9a-f]{3,8}(?![\w-])/gi) ?? [];
  const faults = hexes.filter((hex) => !LIGHT_TOKENS.includes(hex.toLowerCase()));
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
