// Every animation the app's stylesheets name has its @keyframes in the CSS
// the app ships, so no loading bar or pulse stands still for want of its
// frames. Run with: node --test scripts/css-animations.test.mjs
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('..', import.meta.url));
const src = path.join(app, 'src');

function cssFiles(directory, deep) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) return deep ? cssFiles(name, deep) : [];
    return entry.name.endsWith('.css') ? [name] : [];
  });
}

// The stylesheets whose animation names are checked: the shared ones and the app's own.
const checked = [...cssFiles(path.join(src, 'styles'), false), ...cssFiles(path.join(src, 'app'), true)];
// Every stylesheet the app ships can hold the frames.
const shipped = cssFiles(src, true);

const KEYWORDS = new Set([
  'none', 'initial', 'inherit', 'unset', 'revert', 'revert-layer',
  'infinite', 'normal', 'reverse', 'alternate', 'alternate-reverse',
  'forwards', 'backwards', 'both', 'running', 'paused',
  'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end',
  '!important',
]);

const withoutComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// Splits on commas outside brackets, as an animation list does.
function topLevel(value, separator) {
  const parts = [];
  let depth = 0;
  let part = '';
  for (const character of value) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (depth === 0 && separator.test(character)) {
      parts.push(part);
      part = '';
    } else {
      part += character;
    }
  }
  parts.push(part);
  return parts.map((entry) => entry.trim()).filter(Boolean);
}

/** The animation names a stylesheet uses, through `animation` or `animation-name`. */
export function animationNames(css) {
  const names = [];
  for (const [, property, value] of withoutComments(css).matchAll(/(?:^|[;{\s])(animation(?:-name)?)\s*:\s*([^;}]+)/g)) {
    for (const layer of topLevel(value, /,/)) {
      const tokens = topLevel(layer, /\s/).filter((token) => !KEYWORDS.has(token.toLowerCase()));
      const name = tokens.find((token) => property === 'animation-name'
        || !/^(?:-?[\d.]+(?:m?s)?|var\(.*\)|(?:cubic-bezier|steps|linear)\(.*\))$/i.test(token));
      if (name && !/^var\(/.test(name)) names.push(name.replace(/^["']|["']$/g, ''));
    }
  }
  return names;
}

/** The @keyframes names a stylesheet defines. */
export function keyframeNames(css) {
  return [...withoutComments(css).matchAll(/@(?:-webkit-)?keyframes\s+["']?([\w-]+)["']?/g)].map(([, name]) => name);
}

test('the parser reads names from shorthands, lists and animation-name, and leaves out times and keywords', () => {
  const css = `
    .a { animation: capture-loading 1.6s ease-in-out infinite; }
    .b { animation: fade 0.3s cubic-bezier(0.4, 0, 0.6, 1) both, spin 1s linear infinite !important; }
    .c { animation-name: pulse; }
    /* .d { animation: in-a-comment 1s; } */
    .e { animation: none; }
  `;
  assert.deepEqual(animationNames(css), ['capture-loading', 'fade', 'spin', 'pulse']);
  assert.deepEqual(keyframeNames('@keyframes fade { from { opacity: 0; } } @keyframes "spin" {}'), ['fade', 'spin']);
});

test('every animation named in src/styles and src/app has its @keyframes in the shipped CSS', () => {
  const defined = new Set(shipped.flatMap((file) => keyframeNames(readFileSync(file, 'utf8'))));
  const missing = checked.flatMap((file) => animationNames(readFileSync(file, 'utf8'))
    .filter((name) => !defined.has(name))
    .map((name) => `${path.relative(app, file)}: ${name}`));
  assert.ok(checked.length > 5, 'Expected the app’s stylesheets: ' + checked.length);
  assert.deepEqual(missing, [], 'Animations with no @keyframes in the shipped CSS');
});
