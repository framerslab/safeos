/** @jest-environment node */
/**
 * The browser checks of the app's pages (scripts/app-checks.mjs) record a
 * walk that cannot start, its context's setup included, as a finding of that
 * walk, close what they made and go on to the next walk. One bad start never
 * ends the run or hides the findings of the walks after it. Run in Node with
 * a stand-in browser whose contexts refuse a permission, as Chromium refuses
 * one it does not know.
 */
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const APP_ROOT = path.resolve(__dirname, '..');

it('records a walk whose context cannot be set up, closes it and runs the next walk', () => {
  const script = [
    `import { checkApp } from ${JSON.stringify(path.join(APP_ROOT, 'scripts', 'app-checks.mjs'))};`,
    'let made = 0;',
    'let closed = 0;',
    // Every context it makes, in a window or in a profile kept on disk,
    // refuses the permission and opens no page.
    'const refusing = () => {',
    '  made += 1;',
    '  return {',
    "    grantPermissions: async () => { throw new Error('Unknown permission: background-sync-x'); },",
    '    addInitScript: async () => undefined,',
    '    pages: () => [],',
    "    newPage: async () => { throw new Error('the stand-in browser opens no page'); },",
    '    close: async () => { closed += 1; },',
    '  };',
    '};',
    'const browser = {',
    '  newContext: async () => refusing(),',
    '  browserType: () => ({ launchPersistentContext: async () => refusing() }),',
    '};',
    `const count = await checkApp(browser, 'http://127.0.0.1:9/', ${JSON.stringify(os.tmpdir())});`,
    'console.log(JSON.stringify({ count, made, closed }));',
  ].join('\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: APP_ROOT,
    encoding: 'utf8',
    timeout: 60_000,
  });
  expect(result.error).toBeUndefined();
  expect(result.stderr).toContain('failed app check: phone bar at 320 px, light: Unknown permission: background-sync-x');
  expect(result.status).toBe(0);
  const seen = JSON.parse(result.stdout.trim().split('\n').pop() || '{}');
  expect(seen.made).toBeGreaterThan(1);
  expect(seen.count).toBe(seen.made);
  expect(seen.closed).toBe(seen.made);
}, 70_000);
