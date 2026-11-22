/** @jest-environment node */
/**
 * The watch's stylesheet
 *
 * Read as text: the Motion and sound page sets its words at weights 400 and
 * 600 through the two weight tokens, takes every colour from a token of the
 * look, names no monospaced face and no size under 15 px, and loads after the
 * Watch for stylesheet so its rules win where the two meet.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const css = readFileSync(join(__dirname, '..', 'src', 'styles', 'watch.css'), 'utf8');

it('sets the watch at weights 400 and 600 through the two weight tokens', () => {
  expect(css).toMatch(/\.watch\s*\{[^}]*--weight-bold:\s*600;/);
  for (const [, value] of css.matchAll(/font-weight:\s*([^;]+);/g)) {
    expect(['var(--weight-regular)', 'var(--weight-bold)']).toContain(value.trim());
  }
});

it('names no colour of its own and no monospaced face', () => {
  expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
  expect(css).not.toMatch(/monospace|ui-monospace/);
});

it('sets no word under 15 px', () => {
  for (const [, size] of css.matchAll(/font-size:\s*([0-9.]+)(rem|px)/g)) {
    expect(Number(size)).toBeGreaterThanOrEqual(0.9375);
  }
  expect(css).not.toMatch(/font-size:\s*[0-9.]+px/);
});

it('is read after the Watch for stylesheet', () => {
  const globals = readFileSync(join(__dirname, '..', 'src', 'app', 'globals.css'), 'utf8');
  expect(globals.indexOf("'../styles/watch.css'")).toBeGreaterThan(
    globals.indexOf("'../styles/watch-for.css'"),
  );
});
