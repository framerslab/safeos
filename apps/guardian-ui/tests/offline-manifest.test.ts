/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const APP_ROOT = path.resolve(__dirname, '..');

// Runs the real postbuild step against a small static export.
function generate(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'safeos-export-'));
  for (const [file, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), body);
  }
  fs.mkdirSync(path.join(root, 'public'), { recursive: true });
  fs.copyFileSync(path.join(APP_ROOT, 'public', 'sw.js'), path.join(root, 'public', 'sw.js'));
  execFileSync(process.execPath, [path.join(APP_ROOT, 'scripts', 'generate-offline-manifest.mjs')], { cwd: root, stdio: 'pipe' });
  const worker = fs.readFileSync(path.join(root, 'out', 'sw.js'), 'utf8');
  const match = worker.match(/^self\.__SAFEOS_PRECACHE = (.*);$/m);
  fs.rmSync(root, { recursive: true, force: true });
  return JSON.parse(match![1]) as { version: string; urls: string[] };
}

it('installs the images the exported pages and notifications show', () => {
  const { urls } = generate({
    'out/index.html': '<img src="/logo.svg"><img src="/diagrams/how-it-works.svg">',
    'out/_next/static/chunks/main.js': '',
    'out/logo.svg': '<svg/>',
    'out/favicon.svg': '<svg/>',
    'out/favicon-32x32.png': 'png',
    'out/diagrams/how-it-works.svg': '<svg/>',
    'out/logos/react.svg': '<svg/>',
    'out/icons/icon-192.png': 'png',
    'out/sounds/alert.mp3': 'mp3',
    'out/sw.js': '',
  });
  expect(urls).toEqual(expect.arrayContaining([
    '/', '/_next/static/chunks/main.js', '/logo.svg', '/favicon.svg', '/favicon-32x32.png',
    '/diagrams/how-it-works.svg', '/logos/react.svg', '/icons/icon-192.png',
  ]));
  expect(urls).not.toContain('/sw.js');
});
