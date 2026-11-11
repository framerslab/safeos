import { it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, chmodSync, statSync, copyFileSync, existsSync, readdirSync, utimesSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { createDatabase } from '@framers/sql-storage-adapter';
import { boundary, startPipeline } from '../helpers/pipeline.js';

const guide = readFileSync(new URL('../../docs/DEPLOYMENT.md', import.meta.url), 'utf8');
const command = (heading: string) => guide.split(heading)[1].match(/```bash\n([\s\S]*?)```/)![1];
const backup = command('### Database Backup');
const restore = command('### Database Restore');
const automated = command('### Automated Backup Script');
type Pipeline = Awaited<ReturnType<typeof startPipeline>>;

function shell(script: string, dir: string, env: NodeJS.ProcessEnv = process.env) {
  return execFileSync('bash', ['-e', '-c', script], { cwd: dir, env, stdio: 'pipe' });
}

function faultyIntegrityEnvironment(dir: string) {
  const bin = join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'sqlite3'), '#!/bin/sh\ncase "$2" in *integrity_check*) echo "integrity failed"; exit 0;; esac\nexec /usr/bin/sqlite3 "$@"\n', { mode: 0o755 });
  return { ...process.env, PATH: `${bin}:${process.env.PATH}` };
}

async function stoppedDatabase(check: (p: Pipeline) => Promise<void>) {
  const p = await startPipeline();
  await p.service.stop();
  await p.db.close();
  const original = join(p.dir, 'original.sqlite3');
  copyFileSync(join(p.dir, 'db_data/app.sqlite3'), original);
  try { await check(p); }
  finally {
    copyFileSync(original, join(p.dir, 'db_data/app.sqlite3'));
    boundary.db = await createDatabase({ file: join(p.dir, 'db_data/app.sqlite3'), priority: ['better-sqlite3'] } as any);
    await p.service.start();
    await p.close();
  }
}

it('makes an existing host backup directory and snapshot private', async () => {
  const p = await startPipeline();
  try {
    mkdirSync(join(p.dir, 'backup'));
    writeFileSync(join(p.dir, 'backup/safeos.sqlite3'), '');
    chmodSync(join(p.dir, 'backup'), 0o777);
    chmodSync(join(p.dir, 'backup/safeos.sqlite3'), 0o666);
    shell(`umask 022\n${backup}`, p.dir);
    expect.soft(statSync(join(p.dir, 'backup')).mode & 0o077).toBe(0);
    expect.soft(statSync(join(p.dir, 'backup/safeos.sqlite3')).mode & 0o077).toBe(0);
  } finally { await p.close(); }
});

it('fails a host backup when the integrity query reports damage', async () => {
  const p = await startPipeline();
  try { expect(() => shell(backup, p.dir, faultyIntegrityEnvironment(p.dir))).toThrow(); }
  finally { await p.close(); }
});

it.each(['empty', 'unrelated'])('refuses a %s snapshot before replacing the database', async (kind) => {
  await stoppedDatabase(async (p) => {
    mkdirSync(join(p.dir, 'backup'));
    const snapshot = join(p.dir, 'backup/safeos.sqlite3');
    if (kind === 'empty') writeFileSync(snapshot, '');
    else execFileSync('sqlite3', [snapshot, 'CREATE TABLE unrelated (id INTEGER);']);
    const before = readFileSync(join(p.dir, 'db_data/app.sqlite3'));
    expect.soft(() => shell(restore, p.dir)).toThrow();
    expect(readFileSync(join(p.dir, 'db_data/app.sqlite3'))).toEqual(before);
  });
});

it('restores a valid snapshot over a corrupt destination while preserving the damaged file', async () => {
  await stoppedDatabase(async (p) => {
    shell(backup, p.dir);
    writeFileSync(join(p.dir, 'db_data/app.sqlite3'), 'corrupt database header\n');
    shell(restore, p.dir);
    expect(execFileSync('sqlite3', [join(p.dir, 'db_data/app.sqlite3'), 'SELECT id FROM streams;'], { encoding: 'utf8' }).trim()).toBe(p.streamId);
    const rollback = readdirSync(join(p.dir, 'backup')).find((name) => name.startsWith('before-restore.'));
    expect(rollback).toBeTruthy();
    expect(readFileSync(join(p.dir, 'backup', rollback!, 'app.sqlite3'), 'utf8')).toBe('corrupt database header\n');
  });
});

function automatedCommand() {
  return automated.replace('SOURCE_DB=/opt/safeos/db_data/app.sqlite3', 'SOURCE_DB="$TEST_SOURCE_DB"')
    .replace('BACKUP_DIR=/backups/safeos', 'BACKUP_DIR="$TEST_BACKUP_DIR"');
}

it('keeps older automated backups when snapshot integrity fails', async () => {
  const p = await startPipeline();
  try {
    const target = join(p.dir, 'snapshots');
    mkdirSync(target);
    const previous = join(target, 'safeos-old.sqlite3.gz');
    writeFileSync(previous, 'previous snapshot');
    utimesSync(previous, new Date(0), new Date(0));
    const env = { ...faultyIntegrityEnvironment(p.dir), TEST_SOURCE_DB: join(p.dir, 'db_data/app.sqlite3'), TEST_BACKUP_DIR: target };
    expect.soft(() => shell(automatedCommand(), p.dir, env)).toThrow();
    expect(existsSync(previous)).toBe(true);
  } finally { await p.close(); }
});

it('creates private automated backups even with a permissive shell umask', async () => {
  const p = await startPipeline();
  try {
    const target = join(p.dir, 'snapshots');
    mkdirSync(target); chmodSync(target, 0o777);
    shell(`umask 022\n${automatedCommand()}`, p.dir, { ...process.env, TEST_SOURCE_DB: join(p.dir, 'db_data/app.sqlite3'), TEST_BACKUP_DIR: target });
    expect.soft(statSync(target).mode & 0o077).toBe(0);
    for (const file of readdirSync(target)) expect(statSync(join(target, file)).mode & 0o077).toBe(0);
  } finally { await p.close(); }
});

it('preserves the active database while preparing and importing a recovery snapshot', async () => {
  await stoppedDatabase(async (p) => {
    const text = readFileSync(new URL('../../docs/TROUBLESHOOTING.md', import.meta.url), 'utf8');
    const recovery = text.split('3. **Export and recreate:**')[1].match(/```bash\n([\s\S]*?)```/)![1];
    const bin = join(p.dir, 'bin'); mkdirSync(bin);
    // The recovery instructions must not start an API process before importing data.
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const before = readFileSync(join(p.dir, 'db_data/app.sqlite3'));
    shell(recovery, p.dir, { ...process.env, PATH: `${bin}:${process.env.PATH}` });
    expect.soft(existsSync(join(p.dir, 'db_data/app.sqlite3'))).toBe(true);
    expect.soft(existsSync(join(p.dir, 'backup/safeos.sqlite3'))).toBe(true);
    if (existsSync(join(p.dir, 'db_data/app.sqlite3'))) expect(readFileSync(join(p.dir, 'db_data/app.sqlite3'))).toEqual(before);
    if (existsSync(join(p.dir, 'backup/safeos.sqlite3'))) {
      shell(restore, p.dir);
      expect(execFileSync('sqlite3', [join(p.dir, 'db_data/app.sqlite3'), 'SELECT id FROM streams;'], { encoding: 'utf8' }).trim()).toBe(p.streamId);
    }
  });
});
