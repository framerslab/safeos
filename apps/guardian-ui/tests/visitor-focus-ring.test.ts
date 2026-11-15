/** @jest-environment node */
/**
 * The focus ring on the public pages
 *
 * The visitor pages draw their own ring on keyboard focus and drop the
 * browser's ring on a pointer press. A browser that does not know
 * :focus-visible (Safari before 15.4, Chrome before 86) drops the rule that
 * names it, so the rule that removes the browser's ring must name it too:
 * such a browser then keeps its own ring on every control.
 */

import fs from 'fs';
import path from 'path';

const css = fs
  .readFileSync(path.resolve(__dirname, '..', 'src', 'styles', 'visitor.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

// Every rule whose declarations remove an outline, as [selector, declarations].
const outlineRemovals = Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
  .map((rule) => [rule[1].trim().replace(/\s+/g, ' '), rule[2]] as const)
  .filter(([, body]) => /outline\s*:\s*(none|0)\b/.test(body));

it('removes the browser\'s ring only where the browser knows :focus-visible', () => {
  expect(outlineRemovals.length).toBeGreaterThan(0);
  for (const [selector] of outlineRemovals) {
    for (const part of selector.split(',')) {
      if (/:focus\b(?!-)/.test(part)) expect(part).toMatch(/:focus:not\(:focus-visible\)/);
    }
  }
});

it('draws the visitor pages\' ring on keyboard focus', () => {
  expect(css).toMatch(/\.visitor-shell :focus-visible\s*\{[^}]*outline:\s*2px solid var\(--look-accent\)/);
});
