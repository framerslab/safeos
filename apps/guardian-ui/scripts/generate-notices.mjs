// Writes the third-party notices the built site serves at /third-party-notices.txt.
//
//   node scripts/generate-notices.mjs [<out-file>]
//
// Runs before every build (package.json "prebuild"), after the QR code. It
// reads package-lock.json: every package the lockfile does not mark as a
// development dependency (dev or devOptional) is listed with its version, its
// licence and the first copyright line of its licence file. Then comes the
// line for the COCO dataset the detection model was trained on, then each
// licence's full text once: Apache-2.0 from scripts/licenses/Apache-2.0.txt,
// every other licence from the licence file of the first package listed with
// it. The file is made at build time and is not committed.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.resolve(process.argv[2] || path.join(appRoot, 'public/third-party-notices.txt'));

const COCO_LINE =
  "The COCO-SSD model was trained on the COCO dataset; COCO's annotations are © COCO Consortium, licensed CC BY 4.0 (https://cocodataset.org/#termsofuse).";

const lock = JSON.parse(await readFile(path.join(appRoot, 'package-lock.json'), 'utf8'));
const apache = await readFile(path.join(appRoot, 'scripts/licenses/Apache-2.0.txt'), 'utf8');

/** The licence file a package carries, read as text, or null where it carries none. */
async function licenceText(dir) {
  let names;
  try {
    names = await readdir(dir);
  } catch {
    return null;
  }
  const name =
    names.find((n) => /^(licen[cs]e|copying)(\.(md|txt|markdown))?$/i.test(n)) ??
    names.find((n) => /^(licen[cs]e|copying)/i.test(n));
  if (!name) return null;
  try {
    return await readFile(path.join(dir, name), 'utf8');
  } catch {
    return null;
  }
}

/** The licence a package names: the lockfile's field, else its package.json's. */
async function licenceName(entry, dir) {
  const read = (field) => {
    if (typeof field === 'string') return field;
    if (Array.isArray(field)) return field.map((l) => (typeof l === 'string' ? l : l?.type)).filter(Boolean).join(' OR ');
    if (field && typeof field === 'object' && typeof field.type === 'string') return field.type;
    return null;
  };
  const fromLock = read(entry.license ?? entry.licenses);
  if (fromLock) return fromLock;
  try {
    const manifest = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
    return read(manifest.license ?? manifest.licenses) ?? 'no licence named';
  } catch {
    return 'no licence named';
  }
}

/** The first line of a licence file that names a copyright holder; a template's placeholder line is not one. */
function copyrightLine(text) {
  if (!text) return null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!/^(copyright\b|\(c\)\s|©)/i.test(line)) continue;
    if (/\[yyyy\]|\{yyyy\}|\[name of copyright owner\]|^copyright notice/i.test(line)) continue;
    return line;
  }
  return null;
}

const listed = [];
const texts = new Map([['Apache-2.0', apache.trimEnd()]]);

for (const [key, entry] of Object.entries(lock.packages ?? {})) {
  if (!key || entry.dev || entry.devOptional || entry.link) continue;
  const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
  const dir = path.join(appRoot, key);
  const licence = await licenceName(entry, dir);
  const text = await licenceText(dir);
  if (text && !texts.has(licence)) texts.set(licence, text.trimEnd());
  listed.push({ name, version: entry.version ?? 'no version', licence, copyright: copyrightLine(text) });
}

listed.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
const used = new Set(listed.map((p) => p.licence));

const out = [
  'Third-party notices for SafeOS Guardian (safeos.sh)',
  '',
  'The packages SafeOS Guardian depends on to run, as its package-lock.json holds them: each',
  'with its version and its licence, and under it the first copyright line of its licence file.',
  'The licence texts follow the list.',
  '',
];
for (const p of listed) {
  out.push(`${p.name} ${p.version} ${p.licence}`);
  if (p.copyright) out.push(`    ${p.copyright}`);
}
out.push('', COCO_LINE, '', 'Licence texts', '');
for (const [licence, text] of texts) {
  if (!used.has(licence)) continue;
  out.push(`----- ${licence} -----`, '', text, '');
}

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, `${out.join('\n').trimEnd()}\n`);
console.log(`Third-party notices for ${listed.length} packages written to ${path.relative(process.cwd(), outFile)}`);
