/** @jest-environment node */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { HomeRunManifest, RunVariant } from '@/lib/home-runs';

const app = path.join(__dirname, '..');
const publicDir = path.join(app, 'public');
const bundle = 'home/runs';
const record = bundle + '/runs.json';
const verify = (directory: string) => spawnSync(
  process.execPath,
  [path.join(app, 'scripts', 'home-run-inputs.mjs'), '--verify-files', directory],
  { encoding: 'utf8' }
);

type FileManifest = HomeRunManifest & { clips: Array<{ path: string }> };

function changed(mutate: (manifest: FileManifest, directory: string) => void) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'safeos-runs-'));
  try {
    const manifest: FileManifest = JSON.parse(fs.readFileSync(path.join(publicDir, record), 'utf8'));
    fs.cpSync(path.join(publicDir, bundle), path.join(directory, bundle), { recursive: true });
    for (const { path: clip } of manifest.clips) {
      if (!clip.startsWith(bundle + '/')) {
        fs.copyFileSync(path.join(publicDir, clip), path.join(directory, clip));
      }
    }
    mutate(manifest, directory);
    fs.writeFileSync(path.join(directory, record), JSON.stringify(manifest));
    return verify(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

it('holds the committed ordered runs and each transferred file to the manifest', () => {
  const result = verify(publicDir);
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
});

const cases: Array<[string, Parameters<typeof changed>[0], RegExp]> = [
  ['a changed byte', (manifest, directory) => {
    const file = path.join(directory, manifest.runs[0].variants.square.dark.video.path);
    const bytes = fs.readFileSync(file);
    bytes[bytes.length - 1] ^= 1;
    fs.writeFileSync(file, bytes);
  }, /dashboard-square-dark\.mp4: SHA-256 differs/],
  ['a missing WebP', (manifest, directory) => {
    fs.unlinkSync(path.join(directory, manifest.runs[0].variants.square.dark.poster.webp.path));
  }, /dashboard-square-dark\.webp/],
  ['a duplicate ID', (manifest) => {
    manifest.runs[1].id = manifest.runs[0].id;
  }, /Duplicate run ID: dashboard, dashboard/],
  ['barred words', (manifest) => {
    manifest.runs[0].visibleWords.push('identified');
  }, /dashboard: barred wording/],
  ['empty visible words', (manifest) => {
    manifest.runs[0].variants.square.dark.words = [];
  }, /dashboard-square-dark: missing visible words/],
  ['an over-budget wide pair', (manifest, directory) => {
    const { video, poster } = manifest.runs[0].variants.wide.dark;
    const files: Array<[RunVariant['video'] | RunVariant['poster']['webp'], number]> = [
      [video, 1_200_000], [poster.webp, 120_000],
    ];
    for (const [file, length] of files) {
      const bytes = Buffer.alloc(length, 1);
      fs.writeFileSync(path.join(directory, file.path), bytes);
      file.bytes = length;
      file.sha256 = createHash('sha256').update(bytes).digest('hex');
    }
  }, /dashboard-wide-dark: over the combined transfer budget/],
];

it.each(cases)('rejects %s with the affected file or run', (_name, mutate, error) => {
  const result = changed(mutate);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(error);
});
