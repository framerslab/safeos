// Runs after the static export; includes lazy chunks as well as initial scripts.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve('out');
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const relativePath = (file) => path.relative(root, file).split(path.sep).join('/');
const posterPattern = /^home\/runs\/[a-z]+(?:-[a-z]+)*-square-(?:dark|light)\.webp$/;
const exported = (await walk(root)).sort();
const posters = exported.filter((file) => posterPattern.test(relativePath(file)));
const files = exported.filter((file) => {
  const relative = relativePath(file);
  // Install the shell, route data, lazy scripts and its everyday images.
  // Home recordings and their posters are transferred separately.
  if (/^home\/(?:runs\/|capture-|card\.jpg$)/.test(relative)
    || relative.startsWith('screenshots/') || relative.endsWith('.mp4')) return false;
  return relative.startsWith('_next/static/') || relative.startsWith('icons/') ||
    /\.(html|txt|css|js|woff2?|svg|png|ico|webp|jpe?g|gif)$/.test(relative) && relative !== 'sw.js' || relative === 'manifest.json';
});
const worker = await readFile('public/sw.js', 'utf8');
// Keep each path and content digest in a separate, unambiguous record.
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const hash = createHash('sha256').update(JSON.stringify(['worker', digest(worker)]));
const urls = [];
for (const file of files) {
  const relative = relativePath(file);
  hash.update(JSON.stringify(['file', relative, digest(await readFile(file))]));
  urls.push('/' + relative.replace(/(^|\/)index\.html$/, '$1'));
}
if (!urls.includes('/') || !urls.some(url => url.startsWith('/_next/static/') && url.endsWith('.js'))) {
  throw new Error('Static export is missing HTML or scripts.');
}
const posterUrls = [];
for (const file of posters) {
  const relative = relativePath(file);
  hash.update(JSON.stringify(['poster', relative, digest(await readFile(file))]));
  posterUrls.push('/' + relative);
}
const manifest = { version: hash.digest('hex'), urls, posters: posterUrls };
await writeFile(path.join(root, 'sw.js'), `self.__SAFEOS_PRECACHE = ${JSON.stringify(manifest)};\n${worker}`);
console.log(`Offline shell includes ${urls.length} files.`);
