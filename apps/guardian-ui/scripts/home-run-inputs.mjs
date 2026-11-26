import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { limits, sha256, wideView } from './home-run-frames.mjs';
import { barredWording } from './home-wording.cjs';

const app = fileURLToPath(new URL('..', import.meta.url));
const repo = path.resolve(app, '../..');
const appPath = path.relative(repo, app);
const routes = {
  dashboard: ['dashboard', 'monitor', 'history'],
  watching: ['monitor'],
  alert: ['monitor'],
  'lost-found': ['monitor', 'lost-found'],
  settings: ['settings'],
};
const common = [
  'src/app/layout.tsx',
  'src/app/globals.css',
  'public/logo.svg',
  'public/sw.js',
  'package-lock.json',
  'package.json',
  'next.config.js',
  'next.config.mjs',
  'postcss.config.js',
  'postcss.config.mjs',
  'tailwind.config.js',
  'tailwind.config.ts',
  'tsconfig.json',
  'scripts/generate-offline-manifest.mjs',
  'scripts/read-github-stars.mjs',
  'scripts/home-capture-settings.json',
  'scripts/home-run-inputs.mjs',
  'scripts/home-run-frames.mjs',
  'scripts/home-run-list.mjs',
  'scripts/home-run-seed.mjs',
  'scripts/lost-found-walk.mjs',
  'scripts/home-runs.mjs',
  'scripts/home-wording.cjs',
];
const workflow = '.github/workflows/pictures.yml';
const configPath = path.join(app, 'tsconfig.json');

function blobId(bytes) {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

function variableImports(code, name) {
  const file = ts.createSourceFile(name, code, ts.ScriptTarget.Latest);
  let variable = false;
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && !ts.isStringLiteralLike(node.arguments[0])) variable = true;
    ts.forEachChild(node, visit);
  };
  visit(file);
  return variable;
}

// The files a stylesheet names through @import or url().
export function cssReferences(css) {
  return [...css.matchAll(/(?:@import\s+|url\(\s*)["']?([^"'()\s;]+)["']?/g)].map(([, specifier]) => specifier);
}

export function recordingInputs(ids) {
  const result = new Map();
  const tracked = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: repo, encoding: 'utf8' }).split('\0'));
  const host = ts.sys;
  const config = ts.readConfigFile(configPath, host.readFile);
  assert.ok(!config.error, 'Cannot read the app’s TypeScript configuration');
  const { options } = ts.parseJsonConfigFileContent(config.config, host, app);
  const resolutionCache = ts.createModuleResolutionCache(app, (name) => name, options);
  const relative = (name) => path.relative(repo, name).split(path.sep).join('/');
  const appFile = (name) => path.join(appPath, name);
  const local = (specifier, source) => {
    if (specifier.startsWith('/')) return path.join(appPath, 'public', specifier);
    if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null;
    const resolved = ts.resolveModuleName(specifier, path.join(repo, source), options, host, resolutionCache).resolvedModule;
    return resolved ? relative(resolved.resolvedFileName) : relative(
      specifier.startsWith('@/') ? path.join(app, 'src', specifier.slice(2)) : path.resolve(repo, path.dirname(source), specifier),
    );
  };
  const add = (name) => {
    if (!name || !tracked.has(name) || result.has(name)
      || name.endsWith('/page-last-changed.ts')
      || /\/public\/(?:home\/(?:runs\/(?!garden\.)|capture-|card\.jpg|provenance\.json)|screenshots\/)/.test(name)) return;
    const bytes = readFileSync(path.join(repo, name));
    result.set(name, blobId(bytes));

    if (/\.[cm]?[jt]sx?$/.test(name) && !name.includes('/scripts/')) {
      const code = bytes.toString();
      const { importedFiles, referencedFiles } = ts.preProcessFile(code, true, true);
      for (const entry of [...importedFiles, ...referencedFiles]) add(local(entry.fileName, name));
      if (variableImports(code, name)) {
        const directory = path.posix.dirname(name) + '/';
        for (const sibling of tracked) {
          if (sibling.startsWith(directory) && /\.[cm]?[jt]sx?$/.test(sibling)) add(sibling);
        }
      }
    }
    if (/\.css$/.test(name)) {
      for (const specifier of cssReferences(bytes.toString())) add(local(specifier, name));
    }
  };

  for (const name of common) add(appFile(name));
  for (const id of ids) {
    assert.ok(routes[id], `Unknown recording input route for ${id}`);
    for (const route of routes[id]) {
      for (const file of ['page.tsx', 'layout.tsx']) add(appFile(`src/app/${route}/${file}`));
    }
  }
  for (const name of tracked) {
    if (name.startsWith(appFile('public/home/sample-clip.'))
      || (ids.includes('lost-found') && name.startsWith(appFile('public/home/lost-found/')))
      || (ids.includes('alert') && name.startsWith(appFile('public/home/runs/garden.')))
      || (name.startsWith(appFile('src/')) && /\.(woff2?|ttf|otf)$/.test(name))) add(name);
  }
  const commands = readFileSync(path.join(repo, workflow), 'utf8')
    .match(/^ {2}record-home-runs:\n(?:^(?: {3,}.*|)\n?)*/m)?.[0];
  assert.ok(commands, 'Pictures is missing the recording job');
  result.set(workflow + '#record-home-runs', blobId(Buffer.from(commands.trimEnd())));
  const inputs = [...result].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const hash = createHash('sha256');
  for (const [name, oid] of inputs) hash.update(`${name}\0${oid}\0`);
  return { inputDigest: hash.digest('hex'), inputs: Object.fromEntries(inputs) };
}

const ordered = ['watching', 'dashboard', 'alert', 'lost-found', 'settings'];
const launch = ['watching', 'dashboard', 'settings'];
const sizes = ['square', 'wide'];
const looks = ['dark', 'light'];
const mediaPrefix = 'home/runs/';
const hex = /^[a-f0-9]{64}$/;

function checkWords(words, label) {
  assert.ok(Array.isArray(words) && words.length, label + ': missing visible words');
  assert.ok(words.every((word) => typeof word === 'string' && word.trim()), label + ': empty visible word');
  assert.doesNotMatch(words.join(' '), barredWording, label + ': barred wording');
}

export function verifyBundle(directory) {
  const folder = path.resolve(directory);
  const manifest = JSON.parse(readFileSync(path.join(folder, mediaPrefix, 'runs.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 1, 'Unknown recording manifest version');
  assert.match(manifest.commit, /^[a-f0-9]{40}$/, 'Missing recording commit');
  assert.match(manifest.run, /^https:\/\/github\.com\/framerslab\/safeos\/actions\/runs\/\d+$/, 'Missing recording workflow');
  assert.match(manifest.inputDigest, hex, 'Missing source digest');
  assert.ok(manifest.browser && manifest.encoder, 'Missing recording tool versions');
  const ids = manifest.runs.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length, 'Duplicate run ID: ' + ids.join(', '));
  assert.ok(ids.length >= 3 && ids.length <= 5, 'Expected three to five runs');
  for (const id of launch) assert.ok(ids.includes(id), 'Missing required run: ' + id);
  assert.deepEqual(ids, ordered.filter((id) => ids.includes(id)), 'Runs are outside the published order');
  assert.equal(new Set(manifest.runs.map(({ key }) => key)).size, ids.length, 'Run keys must be unique');
  assert.deepEqual(manifest.omitted.map(({ id }) => id), ordered.filter((id) => !ids.includes(id)), 'Missing omitted runs');
  assert.ok(manifest.omitted.every(({ reason }) => reason?.trim()), 'Omitted runs need a reason');
  const paths = new Set([mediaPrefix + 'runs.json']);
  const clipPaths = new Set();
  for (const clip of manifest.clips) {
    assert.match(clip.path, /^home\/(?:sample-clip(?:\.wide)?\.mp4|runs\/garden\.mp4)$/);
    assert.match(clip.sha256, hex);
    assert.ok(clip.credit?.trim(), 'Clip needs a credit: ' + clip.path);
    assert.equal(sha256(readFileSync(path.join(folder, clip.path))), clip.sha256, 'Clip hash mismatch: ' + clip.path);
    clipPaths.add(clip.path);
  }
  const totals = {};
  let hasAvif;
  function checkFile(file, expected, max, crop, scale, kind) {
    assert.ok(file && file.path === expected, 'Missing or invalid ' + expected);
    assert.ok(!paths.has(file.path), 'Duplicate recording file: ' + file.path);
    paths.add(file.path);
    assert.ok(Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= max,
      file.path + ': exceeds its file budget or has no bytes');
    assert.match(file.sha256, hex, file.path + ': invalid hash');
    assert.equal(file.kind, kind, file.path + ': unexpected file kind');
    assert.deepEqual([file.width, file.height], [Math.round(crop.width * scale), Math.round(crop.height * scale)],
      file.path + ': dimensions differ from the crop');
    const bytes = readFileSync(path.join(folder, file.path));
    assert.equal(bytes.length, file.bytes, file.path + ': byte count differs');
    assert.equal(sha256(bytes), file.sha256, file.path + ': SHA-256 differs');
  }
  for (const run of manifest.runs) {
    const { id, description, longDescription, visibleWords, variants } = run;
    assert.ok(run.key && run.route?.startsWith('/') && run.state, id + ': missing route or state');
    assert.ok(Number.isFinite(run.seconds) && run.seconds > 0, id + ': missing duration');
    assert.ok(run.posterAt >= 0 && run.posterAt < run.seconds, id + ': poster is outside the recording');
    assert.ok(run.eventAt >= 0 && run.eventAt <= run.seconds, id + ': missing event time');
    assert.ok(id === 'settings' ? run.clip === null : clipPaths.has(run.clip), id + ': invalid clip');
    assert.ok(description?.trim() && longDescription?.length, id + ': missing text equivalent');
    assert.doesNotMatch([run.key, description, ...longDescription].join(' '), barredWording, id + ': barred caption');
    checkWords(visibleWords, id);
    assert.deepEqual(Object.keys(variants).sort(), sizes, id + ': size variants');
    for (const size of sizes) {
      assert.deepEqual(Object.keys(variants[size]).sort(), looks, id + ': look variants');
      for (const look of looks) {
        const variant = variants[size][look];
        const { video, poster, crop, viewport, scale, words, posterAt } = variant;
        const label = id + '-' + size + '-' + look;
        const base = mediaPrefix + label;
        const budget = limits[size];
        const wide = wideView(id);
        assert.equal(scale, size === 'square' ? 3 : wide.scale, label + ': wrong capture scale');
        assert.equal(viewport.height, size === 'square' ? 844 : wide.height, label + ': wrong viewport height');
        assert.ok(size === 'square' ? viewport.width >= 320 && viewport.width <= 390 : viewport.width === wide.width,
          label + ': wrong viewport width');
        assert.equal(crop.x, 0, label + ': capture must use the whole width');
        assert.equal(crop.width, viewport.width, label + ': crop width differs from the viewport');
        assert.equal(crop.height, size === 'square' ? crop.width : crop.width * 5 / 8, label + ': unexpected crop height');
        assert.ok(crop.y >= 0 && crop.y + crop.height <= viewport.height, label + ': crop leaves the viewport');
        assert.ok(posterAt >= 0 && posterAt < run.seconds, label + ': poster is outside the recording');
        assert.deepEqual(Object.keys(poster).sort(), poster.avif ? ['avif', 'webp'] : ['webp'], label + ': unexpected poster formats');
        hasAvif ??= Boolean(poster.avif);
        assert.equal(Boolean(poster.avif), hasAvif, label + ': inconsistent AVIF availability');
        const offered = Math.max(...Object.values(poster).map(({ bytes }) => bytes));
        assert.ok(video?.bytes + offered <= budget.first, label + ': over the combined transfer budget');
        checkFile(video, base + '.mp4', budget.video, crop, scale, 'video');
        assert.equal(video.codec, 'h264', label + ': invalid codec');
        assert.equal(video.format, 'mp4', label + ': invalid video format');
        assert.ok(Math.abs(video.seconds - run.seconds) <= 1 / 15, label + ': duration differs');
        for (const format of Object.keys(poster)) {
          checkFile(poster[format], base + '.' + format, budget.poster, crop, scale, 'poster');
          assert.equal(poster[format].format, format, label + ': invalid poster format');
        }
        checkWords(words?.map(({ word }) => word), label);
        if (id === 'watching') {
          const { posterReading, meterPeaks, motionLine, motionOverAt, pictureAt, watchEvents } = variant;
          assert.ok(posterReading?.clipAt >= 22 && posterReading.clipAt <= 25, label + ': missing the kitten’s face in the poster');
          assert.ok(meterPeaks?.motion > motionLine && motionOverAt > posterAt && motionOverAt < pictureAt,
            label + ': missing the Motion reading over its line');
          assert.ok(watchEvents?.some(({ kind, clipAt }) => kind === 'motion' && clipAt >= 25.2 && clipAt <= 26.8),
            label + ': missing the motion alert from the kitten walking past');
          assert.ok(pictureAt >= variant.eventAt && run.seconds - pictureAt >= 2.5,
            label + ': the motion picture must stay in frame for at least 2.5 seconds');
        }
        if (id === 'dashboard') {
          const { eventAt, pictureAt, watchEvents } = variant;
          const movement = watchEvents?.findLast(({ kind }) => kind === 'motion');
          assert.ok(movement?.clipAt >= 22 && movement.clipAt <= 25.25,
            label + ': the saved movement picture must show the kitten’s face');
          assert.ok(run.seconds >= 6 && run.seconds <= 8 && eventAt >= 1.9 && eventAt <= 2.5
            && pictureAt > eventAt && run.seconds - pictureAt >= 3.5,
          label + ': the Dashboard must show the list, open its movement alert and hold its picture');
        }
        for (const { word, x, y, width, height, size: font } of words) {
          assert.ok([x, y, width, height, font].every(Number.isFinite) && x >= -0.5 && y >= -0.5
            && width > 0 && height > 0 && font > 0 && x + width <= crop.width + 0.5 && y + height <= crop.height + 0.5,
          label + ': invalid word bounds for ' + word);
        }
        const group = size + '-' + look;
        totals[group] = (totals[group] ?? 0) + video.bytes + offered;
        assert.ok(totals[group] <= budget.all, group + ': over the total transfer budget');
      }
    }
  }
  const inventory = readdirSync(path.join(folder, mediaPrefix))
    .map((file) => mediaPrefix + file)
    .filter((file) => ![mediaPrefix + 'garden.mp4', mediaPrefix + 'garden.json'].includes(file));
  assert.deepEqual(inventory.sort(), [...paths].sort(), 'Unexpected or missing recording files');
  return { manifest, paths: [...paths] };
}

function verifyInputs(manifest) {
  const actual = recordingInputs(manifest.runs.map(({ id }) => id));
  if (actual.inputDigest !== manifest.inputDigest) {
    const previous = manifest.inputs ?? {};
    const names = new Set([...Object.keys(actual.inputs), ...Object.keys(previous)]);
    const changed = [...names].filter((name) => actual.inputs[name] !== previous[name]);
    throw Error('Stale recording sources. Changed paths: ' + changed.join(', '));
  }
  for (const [name, oid] of Object.entries(actual.inputs)) console.log(oid + '  ' + name);
}


function checkDigestScope(manifest) {
  const ids = manifest.runs.map(({ id }) => id);
  const before = recordingInputs(ids).inputDigest;
  const proof = (file, changesDigest) => {
    const name = path.join(repo, file);
    const bytes = readFileSync(name);
    try {
      writeFileSync(name, Buffer.concat([bytes, Buffer.from('\n')]));
      const after = recordingInputs(ids).inputDigest;
      assert.equal(after !== before, changesDigest, 'Incorrect source digest behavior for ' + file);
    } finally {
      writeFileSync(name, bytes);
    }
  };
  proof(path.join(appPath, 'src/app/settings/page.tsx'), true);
  proof(path.join(appPath, 'src/app/history/page.tsx'), true);
  proof(path.join(appPath, 'tailwind.config.js'), true);
  proof('README.md', false);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const [option, directory, artifact] = process.argv.slice(2);
  assert.ok(['--verify-files', '--verify-export', '--verify-committed', '--compare-artifact', '--prove-input-digest'].includes(option),
    'Unknown home run verification command');
  assert.ok(directory, 'Pass the public or exported directory');
  const { manifest, paths } = verifyBundle(directory);
  if (option === '--verify-export' || option === '--verify-committed') verifyInputs(manifest);
  if (option === '--prove-input-digest') checkDigestScope(manifest);
  if (option === '--compare-artifact') {
    assert.ok(artifact, 'Pass the producer artifact directory');
    const expected = paths.map((file) => path.basename(file)).sort();
    assert.deepEqual(readdirSync(artifact).sort(), expected, 'Producer artifact inventory differs');
    for (const file of paths) {
      assert.ok(readFileSync(path.join(directory, file)).equals(readFileSync(path.join(artifact, path.basename(file)))),
        'Producer artifact bytes differ: ' + file);
    }
  }
  console.log('Verified ' + manifest.runs.length + ' committed runs (' + paths.length + ' files)');
}
