/** @jest-environment node */
/**
 * The watch's stylesheet
 *
 * Read as text, its comments left out: the Motion and sound page sets its
 * words at weights 400 and 600 through the two weight tokens, takes every
 * colour from a token of the look, sets its words in the look's two faces, in
 * rem (so the browser's text size scales them) and never under 15 px, and
 * loads after the Watch for stylesheet so its rules win where the two meet.
 * Each check also reads stylesheets that break it, so a check that cannot
 * fail shows here.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const read = (...parts: string[]) => readFileSync(join(__dirname, '..', ...parts), 'utf8');
const css = read('src', 'styles', 'watch.css');
const designSystem = read('src', 'styles', 'design-system.css');

const live = (sheet: string) => sheet.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every declaration of a stylesheet as [property, value], its comments left out and `!important` dropped. */
function declarations(sheet: string): Array<[string, string]> {
  return [...live(sheet).matchAll(/([-\w]+)\s*:\s*([^;{}]+)(?=;|})/g)].map(([, property, value]): [string, string] => [
    property,
    value.replace(/\s*!important\s*$/, '').trim(),
  ]);
}

const WEIGHTS = ['var(--weight-regular)', 'var(--weight-bold)'];

function weightProblems(sheet: string): string[] {
  const problems: string[] = [];
  if (!/(^|})\s*\.watch\s*\{[^}]*--weight-bold:\s*600\s*;/.test(live(sheet))) problems.push('the watch does not set --weight-bold to 600');
  const used = new Set<string>();
  for (const [property, value] of declarations(sheet)) {
    if (property === 'font') problems.push(`font: ${value} sets the weight in a shorthand`);
    if (property === '--weight-regular' && value !== '400') problems.push(`--weight-regular: ${value}`);
    if (property !== 'font-weight') continue;
    used.add(value);
    if (!WEIGHTS.includes(value)) problems.push(`font-weight: ${value}`);
  }
  for (const weight of WEIGHTS) if (!used.has(weight)) problems.push(`no words are set at ${weight}`);
  return problems;
}

// CSS Color 4's named colours and the system colours: a colour of its own,
// whatever the look.
const NAMED_COLOURS = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood
  cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray
  darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
  darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue
  firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew
  hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
  lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray
  lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue
  mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred
  midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
  palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple
  rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue
  slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white
  whitesmoke yellow yellowgreen accentcolor accentcolortext activetext buttonborder buttonface buttontext canvas
  canvastext field fieldtext graytext highlight highlighttext linktext mark marktext selecteditem selecteditemtext
  visitedtext`.split(/\s+/),
);

function colourProblems(sheet: string): string[] {
  const problems: string[] = [];
  for (const [property, value] of declarations(sheet)) {
    // What the value says beside its tokens and its quoted names.
    const own = value.replace(/var\(--[\w-]+\)/g, ' ').replace(/(["'])[^"']*\1/g, ' ');
    const words = own.toLowerCase().match(/(?<![\w-])[a-z][\w-]*/g) ?? [];
    if (
      /#[0-9a-f]{3,8}\b/i.test(own) ||
      /(?<![\w-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|device-cmyk)\(/i.test(own) ||
      words.some((word) => NAMED_COLOURS.has(word))
    ) {
      problems.push(`${property}: ${value}`);
    }
  }
  return problems;
}

const FACES = ['var(--font-display)', 'var(--font-sans)', 'inherit'];

function faceProblems(sheet: string): string[] {
  const problems: string[] = [];
  for (const [property, value] of declarations(sheet)) {
    if (property === 'font') problems.push(`font: ${value} sets the face in a shorthand`);
    else if (property === 'font-family' && !FACES.includes(value)) problems.push(`font-family: ${value}`);
    else if (/monospace/i.test(value)) problems.push(`${property}: ${value}`);
  }
  return problems;
}

/** A size in rem of 15 px or more, or one of the look's two type sizes. */
const sizeHolds = (value: string) => {
  if (/^var\(--type-(body|word)-size\)$/.test(value)) return true;
  const rem = /^(\d*\.?\d+)rem$/.exec(value);
  return rem !== null && Number(rem[1]) >= 0.9375;
};

function sizeProblems(sheet: string): string[] {
  const problems: string[] = [];
  for (const [property, value] of declarations(sheet)) {
    if (property === 'font') problems.push(`font: ${value} sets the size in a shorthand`);
    else if (property === 'font-size' && !sizeHolds(value)) problems.push(`font-size: ${value}`);
  }
  return problems;
}

describe('weights', () => {
  it('sets the watch at weights 400 and 600 through the two weight tokens', () => {
    expect(weightProblems(css)).toEqual([]);
    expect(declarations(designSystem)).toContainEqual(['--weight-regular', '400']);
  });

  it.each([
    ['the root rule commented out', '/* .watch { --weight-bold: 600; } */ .a { font-weight: var(--weight-bold); } .b { font-weight: var(--weight-regular); }'],
    ['a weight of its own', '.watch { --weight-bold: 600; } .a { font-weight: 700; } .b { font-weight: var(--weight-regular); } .c { font-weight: var(--weight-bold); }'],
    ['the regular token set to 300', '.watch { --weight-bold: 600; --weight-regular: 300; } .a { font-weight: var(--weight-bold); } .b { font-weight: var(--weight-regular); }'],
    ['no words set at either weight', '.watch { --weight-bold: 600; }'],
    ['the weight in a shorthand', '.watch { --weight-bold: 600; } .a { font: 600 1rem var(--font-sans); } .b { font-weight: var(--weight-regular); } .c { font-weight: var(--weight-bold); }'],
  ])('finds %s', (_, sheet) => {
    expect(weightProblems(sheet)).not.toEqual([]);
  });
});

describe('colours', () => {
  it('names no colour of its own', () => {
    expect(colourProblems(css)).toEqual([]);
  });

  it.each([
    ['a named colour', '.a { color: red; }'],
    ['a named colour in another case', '.a { box-shadow: 0 0 0 2px White; }'],
    ['a system colour', '.a { background: Canvas; }'],
    ['a short hex colour', '.a { border: 1px solid #fff; }'],
    ['an oklch colour', '.a { background: oklch(70% 0.1 150); }'],
    ['an rgb colour', '.a { outline-color: rgb(0 0 0); }'],
    ['a hex colour beside a token', '.a { background: linear-gradient(var(--look-accent), #0b131b); }'],
    ['a named colour in a custom property', '.a { --edge: navy; }'],
  ])('finds %s', (_, sheet) => {
    expect(colourProblems(sheet)).not.toEqual([]);
  });

  it('reads tokens, transparent and currentColor as the look', () => {
    expect(colourProblems('.a { color: var(--color-steel-50) !important; border: 1px solid currentColor; background: transparent; }')).toEqual([]);
  });
});

describe('faces', () => {
  it('sets its words in the look\'s two faces, none monospaced', () => {
    expect(faceProblems(css)).toEqual([]);
  });

  it.each([
    ['a face of its own', '.a { font-family: Courier New; }'],
    ['a monospaced face', '.a { font-family: ui-monospace, monospace; }'],
    ['the face in a shorthand', '.a { font: 1rem var(--font-sans); }'],
  ])('finds %s', (_, sheet) => {
    expect(faceProblems(sheet)).not.toEqual([]);
  });
});

describe('sizes', () => {
  it('sets every size in rem at 15 px or more, or as one of the look\'s two type sizes', () => {
    expect(sizeProblems(css)).toEqual([]);
    for (const [property, value] of declarations(designSystem)) {
      if (/^--type-(body|word)-size$/.test(property)) expect(sizeHolds(value)).toBe(true);
    }
  });

  it.each([
    ['a size in em', '.a { font-size: 1em; }'],
    ['a size under 15 px in rem', '.a { font-size: 0.875rem; }'],
    ['a size in px, which the browser\'s text size does not scale', '.a { font-size: 15px; }'],
    ['a size keyword', '.a { font-size: small; }'],
    ['a calculated size', '.a { font-size: calc(1rem - 2px); }'],
    ['a size in a shorthand', '.a { font: 0.75rem var(--font-sans); }'],
  ])('finds %s', (_, sheet) => {
    expect(sizeProblems(sheet)).not.toEqual([]);
  });
});

describe('order', () => {
  /** Where an import stands in the global stylesheet, its comments left out; -1 when it is not there. */
  const importAt = (sheet: string, file: string) => live(sheet).search(new RegExp(`@import\\s+'\\.\\./styles/${file.replace('.', '\\.')}'`));

  it('is read after the Watch for stylesheet', () => {
    const globals = read('src', 'app', 'globals.css');
    expect(importAt(globals, 'watch-for.css')).toBeGreaterThanOrEqual(0);
    expect(importAt(globals, 'watch.css')).toBeGreaterThan(importAt(globals, 'watch-for.css'));
  });

  it.each([
    ['the Watch for import gone', "@import '../styles/watch.css';"],
    ['the Watch for import commented out', "/* @import '../styles/watch-for.css'; */\n@import '../styles/watch.css';"],
    ['the watch import before Watch for', "@import '../styles/watch.css';\n@import '../styles/watch-for.css';"],
  ])('finds %s', (_, sheet) => {
    const watchFor = importAt(sheet, 'watch-for.css');
    expect(watchFor >= 0 && importAt(sheet, 'watch.css') > watchFor).toBe(false);
  });
});
