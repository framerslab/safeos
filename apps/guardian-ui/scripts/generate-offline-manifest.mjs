// Runs after the static export; includes lazy chunks as well as initial scripts.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve('out');
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  }));
  return files.flat();
}
const files = (await walk(root)).filter(file => {
  const relative = path.relative(root, file).split(path.sep).join('/');
  // Pages, their scripts and route data, and the images pages and notifications
  // show (logo, favicons, logos, diagrams). Alert sounds are generated in the
  // browser, so there is no sound file to install.
  return relative.startsWith('_next/static/') || relative.startsWith('icons/') ||
    /\.(html|txt|css|js|woff2?|svg|png|ico|webp|jpe?g|gif)$/.test(relative) && relative !== 'sw.js' || relative === 'manifest.json';
}).sort();
const worker = await readFile('public/sw.js', 'utf8');
// Keep each path and content digest in a separate, unambiguous record.
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const hash = createHash('sha256').update(JSON.stringify(['worker', digest(worker)]));
const urls = [];
for (const file of files) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  hash.update(JSON.stringify(['file', relative, digest(await readFile(file))]));
  urls.push('/' + relative.replace(/(^|\/)index\.html$/, '$1'));
}
if (!urls.includes('/') || !urls.some(url => url.startsWith('/_next/static/') && url.endsWith('.js'))) {
  throw new Error('Static export is missing HTML or scripts.');
}
const manifest = { version: hash.digest('hex'), urls };
await writeFile(path.join(root, 'sw.js'), `self.__SAFEOS_PRECACHE = ${JSON.stringify(manifest)};\n${worker}`);
console.log(`Offline shell includes ${urls.length} files.`);
