/**
 * The third-party notices name the fonts the site serves
 *
 * scripts/generate-notices.mjs writes the notices the built site serves at
 * /third-party-notices.txt. The site serves Inter, Space Grotesk and
 * JetBrains Mono itself (next/font/google in src/app/layout.tsx downloads
 * them at build time and the export carries the files), so the notices name
 * each with its copyright line and carry the SIL Open Font License 1.1 text
 * each comes with, from the licence files committed under scripts/licenses/.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const APP = path.join(__dirname, '..');
const SCRIPT = path.join(APP, 'scripts', 'generate-notices.mjs');

const FONTS = [
  { name: 'Inter', loader: 'Inter', copyright: 'Copyright 2020 The Inter Project Authors (https://github.com/rsms/inter)' },
  { name: 'Space Grotesk', loader: 'Space_Grotesk', copyright: 'Copyright 2020 The Space Grotesk Project Authors (https://github.com/floriankarsten/space-grotesk)' },
  { name: 'JetBrains Mono', loader: 'JetBrains_Mono', copyright: 'Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)' },
];

let dir: string;
let notices: string;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notices-'));
  const out = path.join(dir, 'third-party-notices.txt');
  execFileSync(process.execPath, [SCRIPT, out], { cwd: APP, encoding: 'utf8' });
  notices = fs.readFileSync(out, 'utf8');
}, 60_000);
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

it('the fonts it names are the ones the layout loads', () => {
  const layout = fs.readFileSync(path.join(APP, 'src', 'app', 'layout.tsx'), 'utf8');
  const loaded = layout.match(/import \{([^}]+)\} from 'next\/font\/google'/)?.[1].split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  expect(loaded.sort()).toEqual(FONTS.map((font) => font.loader).sort());
});

it('names each font with its licence and its copyright line', () => {
  for (const font of FONTS) {
    expect(notices).toMatch(new RegExp(`^${font.name} \\(font\\) OFL-1\\.1\\n    ${font.copyright.replace(/[()./]/g, '\\$&')}$`, 'm'));
  }
});

it('carries the SIL Open Font License 1.1 text under each font, from a committed file', () => {
  for (const font of FONTS) {
    const block = notices.split(/^----- /m).find((part) => part.startsWith(`${font.name} (font) -----`));
    expect([font.name, Boolean(block)]).toEqual([font.name, true]);
    expect(block).toContain(font.copyright);
    expect(block).toContain('SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007');
    expect(block).toContain('THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND');
  }
  const licences = fs.readdirSync(path.join(APP, 'scripts', 'licenses'));
  expect(licences).toEqual(expect.arrayContaining(['Inter-OFL.txt', 'SpaceGrotesk-OFL.txt', 'JetBrainsMono-OFL.txt']));
  // The texts are read from those files: the script fetches nothing.
  expect(fs.readFileSync(SCRIPT, 'utf8')).not.toMatch(/\bfetch\(|https?\.get\(|node:https/);
});
