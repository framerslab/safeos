import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const app = fileURLToPath(new URL('..', import.meta.url));
const repo = path.resolve(app, '../..');
const appPath = path.relative(repo, app);
const routes = {
  dashboard: ['dashboard', 'monitor'],
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
  'tailwind.config.ts',
  'tsconfig.json',
  'scripts/generate-offline-manifest.mjs',
  'scripts/read-github-stars.mjs',
  'scripts/home-capture-settings.json',
  'scripts/home-run-inputs.mjs',
  'scripts/home-run-frames.mjs',
  'scripts/home-run-list.mjs',
  'scripts/home-run-seed.mjs',
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
      for (const [, specifier] of bytes.toString().matchAll(/(?:@import\s+|url\(\s*)["']?([^"'()\s;]+)["']?/g)) {
        add(local(specifier, name));
      }
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
