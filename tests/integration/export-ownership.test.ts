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
let server: SafeOSServer;
let alice: any;
let bob: any;
let foreignId: string;
let client = 0;
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'safeos-export-'));
  db = await createDatabase({ file: join(dir, 'test.sqlite3'), priority: ['better-sqlite3'] } as any);
  dbRef.current = db;
  await runMigrations(db);
  server = new SafeOSServer();
  server.getApp().set('trust proxy', ['127.0.0.1', '::1']);
  const guest = async (deviceId: string) => {
    const response = await request(server.getApp()).post('/api/auth/session').send({ deviceId });
    expect(response.status).toBe(201);
    return response.body.data;
  };
  alice = await guest('export-alice');
  bob = await guest('export-bob');
  foreignId = `profile-${alice.profile.id}-belongs-to-bob`;
  for (const [id, owner] of [['independent-profile-id', alice.profile.id], [foreignId, bob.profile.id]]) {
    await db.run(`INSERT INTO monitoring_profiles (id, name, scenario, settings, is_active, created_at, owner_id)
      VALUES (?, 'Night settings', 'baby', '{}', 0, ?, ?)`, [id, now(), owner]);
  }
  for (const [person, id] of [[alice, 'independent-profile-id'], [bob, foreignId]]) {
    await request(server.getApp()).post(`/api/profiles/${id}/activate`).set('X-Session-Token', person.token).expect(200);
  }
  await request(server.getApp()).post('/api/profiles/profile-pet-default/activate').set('X-Session-Token', alice.token).expect(200);
});
afterAll(async () => {
  await server?.stop().catch(() => {});
  await db?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});
describe.each(['profile', 'all'])('%s export ownership', (kind) => {
  const exported = async () => {
    const response = await request(server.getApp()).get(`/api/export/${kind}`).set('X-Forwarded-For', `198.51.100.${++client}`).set('X-Session-Token', alice.token);
    expect(response.status).toBe(200);
    return kind === 'profile' ? response.body.data : response.body;
  };
  it('includes owned monitoring profiles independently of their identifiers', async () => {
    const data = await exported();
    expect(data.monitoringProfiles).toEqual([expect.objectContaining({ id: 'independent-profile-id', owner_id: alice.profile.id, is_active: 1 })]);
  });
  it('includes personal active choices, including built-in defaults', async () => {
    const data = await exported();
    expect(data.activeMonitoringProfiles).toEqual([
      { owner_id: alice.profile.id, scenario: 'baby', monitoring_profile_id: 'independent-profile-id' },
      { owner_id: alice.profile.id, scenario: 'pet', monitoring_profile_id: 'profile-pet-default' },
    ]);
  });
  it('excludes another persons profiles and choices even when identifiers overlap', async () => {
    const data = await exported();
    expect(JSON.stringify(data)).not.toContain(foreignId);
    expect(JSON.stringify(data)).not.toContain(bob.profile.id);
  });
});
