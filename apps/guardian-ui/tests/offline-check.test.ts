/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const APP_ROOT = path.resolve(__dirname, '..');
const script = path.join(APP_ROOT, 'scripts/check-offline-start.mjs');

function runCheck(args: string[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'safeos-offline-check-'));
  try {
    fs.mkdirSync(path.join(root, 'out'));
    fs.writeFileSync(path.join(root, 'out/index.html'), '<html>offline check fixture</html>');
    return spawnSync(process.execPath, [...args, script], {
      cwd: root, encoding: 'utf8', timeout: 5000,
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: path.join(root, 'no-browsers') },
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

it('reports browser launch failure and exits without keeping the server alive', () => {
  const result = runCheck([]);
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/Executable doesn't exist/);
}, 10000);

it('reports a worker that never becomes ready and releases the browser and server', () => {
  const result = runCheck(['--loader', path.join(__dirname, 'helpers/offline-check-loader.mjs')]);
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/Service worker.*ready.*no registration/i);
  expect(result.stdout).toContain('Browser closed');
}, 10000);
