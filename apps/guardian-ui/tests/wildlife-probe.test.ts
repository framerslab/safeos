/** @jest-environment node */
/**
 * Measure's Wildlife watch (scripts/wildlife-probe.mjs) reports its own
 * failure in its result. When it threw instead, the laptop's finished model
 * measurement was replaced by the watch's error, and Measure said the model
 * measurement stopped before the watch could start.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const APP_ROOT = path.resolve(__dirname, '..');

function probe(outDir: string, newPageError: string): { attempts: unknown[]; error?: string } {
  const script = [
    `import { probeWildlife } from ${JSON.stringify(path.join(APP_ROOT, 'scripts', 'wildlife-probe.mjs'))};`,
    `const context = { newPage: async () => { throw new Error(${JSON.stringify(newPageError)}); } };`,
    `const report = await probeWildlife({ context, baseUrl: 'http://127.0.0.1:4173', modelHost: 'storage.googleapis.com', outDir: ${JSON.stringify(outDir)}, seed: () => undefined, settings: {} });`,
    `console.log('REPORT ' + JSON.stringify(report));`,
  ].join('\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', cwd: APP_ROOT });
  expect(result.stderr).toBe('');
  const line = result.stdout.split('\n').find((text) => text.startsWith('REPORT '));
  expect(line).toBeDefined();
  return JSON.parse(line!.slice('REPORT '.length));
}

it('returns the watch’s error, and writes it to wildlife-probe.json, when the browser closes', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wildlife-probe-'));
  const report = probe(outDir, 'Target page, context or browser has been closed');
  expect(report).toEqual({ attempts: [], error: 'Error: Target page, context or browser has been closed' });
  expect(JSON.parse(fs.readFileSync(path.join(outDir, 'wildlife-probe.json'), 'utf8'))).toEqual(report);
});

it('returns the watch’s error when its folder cannot be written', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wildlife-probe-')), 'not-a-folder');
  fs.writeFileSync(file, '');
  const report = probe(path.join(file, 'measurements'), 'unused');
  expect(report.attempts).toEqual([]);
  expect(report.error).toMatch(/^Error: (ENOTDIR|EEXIST)/);
});
