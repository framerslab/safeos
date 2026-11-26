/** @jest-environment node */
/**
 * The base build in the picture run (scripts/capture-pictures.mjs) skips a
 * route it answers 404 for only when the base commit has no page for that
 * route: a page the pull request adds. A route whose page the base holds, and
 * any 404 outside the base capture, fails the run.
 */
import path from 'path';
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';

const APP_ROOT = path.resolve(__dirname, '..');

function skips(cases: Array<{ route: string; status: number; version: string | undefined }>): boolean[] {
  const script = [
    `import { skipsInBase } from ${JSON.stringify(path.join(APP_ROOT, 'scripts', 'base-routes.mjs'))};`,
    `const cases = ${JSON.stringify(cases)};`,
    `console.log(JSON.stringify(cases.map((c) => skipsInBase({ ...c, appDir: ${JSON.stringify(APP_ROOT)} }))));`,
  ].join('\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  expect(result.stderr).toBe('');
  return JSON.parse(result.stdout.trim());
}

it('skips a 404 in the base build only for a route whose page the base commit lacks', () => {
  expect(skips([
    // A page the base commit holds: its 404 is a regression and fails.
    { route: '/settings/', status: 404, version: 'before' },
    { route: '/settings/sounds/', status: 404, version: 'before' },
    // A page the base commit lacks: noted and skipped.
    { route: '/settings/a-page-no-commit-has/', status: 404, version: 'before' },
    // Any other answer, the pull request's own build and a direct run fail.
    { route: '/settings/a-page-no-commit-has/', status: 500, version: 'before' },
    { route: '/settings/a-page-no-commit-has/', status: 404, version: 'after' },
    { route: '/settings/a-page-no-commit-has/', status: 404, version: undefined },
  ])).toEqual([false, false, true, false, false, false]);
});

it('the base build takes only the capture scripts from the pull request, never its walks', () => {
  // A walk from the head run against the base build fails there as soon as
  // the pull request changes a control it presses, and a head that lacks the
  // walk's file stops the step at git show. Only the capture scripts cross.
  const workflow = readFileSync(path.join(APP_ROOT, '../../.github/workflows/pictures.yml'), 'utf8');
  const taken = Array.from(workflow.matchAll(/git show "\$CAPTURE_REF:([^"]+)"/g), (found) => found[1]);
  expect(taken.length).toBeGreaterThan(0);
  expect(taken.filter((file) => !file.startsWith('apps/guardian-ui/scripts/'))).toEqual([]);
  expect(workflow).not.toMatch(/npx playwright test/);
});

it('finds the People count in the words of either build, whichever the run is', () => {
  // The base commit of a later pull request shows the same words as its head,
  // so the base capture reads the words on the page, not the run's label.
  const words = ['people in view', 'Persons Detected', 'More than this watch allows.', '+1 INTRUDER'];
  for (const version of ['before', 'after']) {
    const script = [
      `import { peopleCountText } from ${JSON.stringify(path.join(APP_ROOT, 'scripts', 'watch-page-captures.mjs'))};`,
      `const words = ${JSON.stringify(words)};`,
      `console.log(JSON.stringify(words.map((w) => [peopleCountText.heading.test(w), peopleCountText.over.test(w)])));`,
    ].join('\n');
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8', env: { ...process.env, PICTURE_VERSION: version },
    });
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout.trim())).toEqual([[true, false], [true, false], [false, true], [false, true]]);
  }
});
