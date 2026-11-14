/**
 * The QR code's address
 *
 * scripts/generate-site-qr.mjs runs before the build and before the dev
 * server, so it reads the site's address before Next.js does. It reads the
 * same env files Next.js reads, so the QR code opens the address the page
 * names when NEXT_PUBLIC_SITE_URL is set only in .env.local.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const SCRIPT = path.join(__dirname, '..', 'scripts', 'generate-site-qr.mjs');

function run(dir: string, lifecycle: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production', npm_lifecycle_event: lifecycle };
  delete env.NEXT_PUBLIC_SITE_URL;
  const out = path.join(dir, 'qr.svg');
  const said = execFileSync(process.execPath, [SCRIPT, out], { cwd: dir, env, encoding: 'utf8' });
  return { said, svg: fs.readFileSync(out, 'utf8') };
}

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-qr-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

it('reads the site address from .env.local before the build, as Next.js does', () => {
  fs.writeFileSync(path.join(dir, '.env.local'), 'NEXT_PUBLIC_SITE_URL=https://guardian.example.test/\n');
  const { said, svg } = run(dir, 'prebuild');
  expect(said).toContain('QR code for https://guardian.example.test/ written');
  expect(svg).toMatch(/^<svg/);
});

it('reads .env.development before the dev server and not before the build', () => {
  fs.writeFileSync(path.join(dir, '.env.development'), 'NEXT_PUBLIC_SITE_URL=http://localhost:3000\n');
  expect(run(dir, 'predev').said).toContain('QR code for http://localhost:3000/ written');
  expect(run(dir, 'prebuild').said).toContain('QR code for https://safeos.sh/ written');
});

it('falls back to https://safeos.sh with no address set', () => {
  expect(run(dir, 'prebuild').said).toContain('QR code for https://safeos.sh/ written');
});
