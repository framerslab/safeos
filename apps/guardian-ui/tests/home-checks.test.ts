import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';

const app = path.resolve(__dirname, '..');

it('fails the Pictures readability step when the home was requested without word boxes', () => {
  const workflow = readFileSync(path.join(app, '../../.github/workflows/pictures.yml'), 'utf8');
  const step = workflow.match(/- name: Measure home readability from the captured pixels\n[\s\S]*? {8}run: \|\n((?: {10}[^\n]*\n)+)/)?.[1];
  expect(step).toBeDefined();
  const directory = mkdtempSync(path.join(tmpdir(), 'home-pixels-'));
  try {
    const run = (routes: string) => spawnSync('bash', ['-ec', step ?? ''], {
      env: { ...process.env, ROUTES: routes, RUNNER_TEMP: directory },
      cwd: app,
      encoding: 'utf8',
    });
    expect(run('/privacy/').status).toBe(0);
    const missing = run('/ /privacy/');
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('home-readability-boxes.json');
  } finally {
    rmSync(directory, { recursive: true });
  }
});

it('polls again after a transient navigation failure and reports the last HTTP response', async () => {
  const script = readFileSync(path.join(app, 'scripts/check-published-home.mjs'), 'utf8');
  const expected = 'a'.repeat(64);
  const goto = jest.fn().mockRejectedValueOnce(new Error('Navigation timed out'))
    .mockResolvedValue({ ok: () => false, status: () => 503 });
  const close = jest.fn().mockResolvedValue(undefined);
  const wait = jest.fn().mockResolvedValue(undefined);
  // Run the entry point with its browser and timer imports supplied by the test.
  const entry = script.replace(/^import .*;\n/gm, '');
  const check: Promise<void> = runInNewContext(`(async () => { ${entry} })()`, {
    chromium: { launch: async () => ({
      newContext: async () => ({ newPage: async () => ({ goto }), close }),
      close: jest.fn(),
    }) },
    assert,
    wait,
    console: { log: jest.fn() },
    process: { argv: ['', '', expected] },
  });

  await expect(check).rejects.toThrow(`expected ${expected}, served HTTP 503`);
  expect(goto).toHaveBeenCalledTimes(6);
  expect(close).toHaveBeenCalledTimes(6);
  expect(wait).toHaveBeenCalledTimes(5);
});
