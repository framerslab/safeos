import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createDatabase } from '@framers/sql-storage-adapter';

const { dbRef } = vi.hoisted(() => ({ dbRef: { current: null as any } }));
vi.mock('../../src/db/index.js', async (original) => ({
  ...await original<typeof import('../../src/db/index.js')>(),
  getSafeOSDatabase: async () => dbRef.current,
}));
import { runMigrations, now } from '../../src/db/index.js';
import { SafeOSServer } from '../../src/api/server.js';

let dir: string;
let db: any;
let instance: SafeOSServer | undefined;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'safeos-upgrade-'));
  db = await createDatabase({ file: join(dir, 'test.sqlite3'), priority: ['better-sqlite3'] } as any);
  dbRef.current = db;
});
afterAll(async () => {
  await instance?.stop().catch(() => {});
  await db?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('upgrade from a database written by the previous release', () => {
  it('starts, and keeps each owner\'s active choice, when an owner row has been removed', async () => {
    // The previous release's schema: no per-person choice table, and the
    // active flag kept on the monitoring profile row itself.
    await runMigrations(db);
    await db.exec('DROP TABLE active_monitoring_profiles');
    const t = now();
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await db.run(
      `INSERT INTO user_profiles (id, display_name, created_at, updated_at) VALUES ('owner-a', 'A', ?, ?)`,
      [t, t]
    );
    await db.run(
      `INSERT INTO sessions (id, token, device_id, is_guest, profile_id, created_at, expires_at, last_active_at)
       VALUES ('session-a', 'token-a', NULL, 1, 'owner-a', ?, ?, ?)`,
      [t, expires, t]
    );
    await db.run(
      `INSERT INTO monitoring_profiles (id, name, scenario, settings, is_active, created_at, owner_id)
       VALUES ('nights', 'Nights', 'baby', '{}', 1, ?, 'owner-a')`,
      [t]
    );
    // Its owner's user profile was removed by the operator (a deletion request).
    await db.run(
      `INSERT INTO monitoring_profiles (id, name, scenario, settings, is_active, created_at, owner_id)
       VALUES ('left-behind', 'Old', 'pet', '{}', 1, ?, 'removed-person')`,
      [t]
    );

    await expect(runMigrations(db)).resolves.toBeUndefined();

    instance = new SafeOSServer();
    const app = instance.getApp();
    const res = await request(app).get('/api/profiles?scenario=baby').set('X-Session-Token', 'token-a');
    expect(res.status).toBe(200);
    expect(res.body.profiles.filter((p: any) => p.is_active).map((p: any) => p.id)).toEqual(['nights']);
  });
});
