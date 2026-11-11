import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createDatabase } from '@framers/sql-storage-adapter';

const { dbRef, verificationMail, resetMail } = vi.hoisted(() => ({
  dbRef: { current: null as any },
  verificationMail: vi.fn().mockResolvedValue({ id: 'verification' }),
  resetMail: vi.fn().mockResolvedValue({ id: 'reset' }),
}));
vi.mock('../../src/db/index.js', async (original) => ({
  ...await original<typeof import('../../src/db/index.js')>(),
  getSafeOSDatabase: async () => dbRef.current,
}));
vi.mock('../../src/lib/alerts/email.js', async (original) => ({
  ...await original<typeof import('../../src/lib/alerts/email.js')>(),
  isResendConfigured: () => true,
  sendVerificationEmail: verificationMail,
  sendPasswordResetEmail: resetMail,
}));
import { runMigrations, now } from '../../src/db/index.js';
import { SafeOSServer } from '../../src/api/server.js';

let dir: string;
let db: any;
let instance: SafeOSServer;
let app: ReturnType<SafeOSServer['getApp']>;
let client = 0;
function call(method: 'get' | 'post' | 'patch' | 'delete', path: string, token?: string) {
  const req = request(app)[method](path).set('X-Forwarded-For', `198.51.100.${++client}`);
  return token ? req.set('X-Session-Token', token) : req;
}
async function guest(deviceId = `device-${++client}`) {
  const res = await call('post', '/api/auth/session').send({ deviceId, displayName: 'Alice' });
  expect(res.status).toBe(201);
  return res.body.data;
}
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'safeos-sessions-'));
  db = await createDatabase({ file: join(dir, 'test.sqlite3'), priority: ['better-sqlite3'] } as any);
  dbRef.current = db;
  await runMigrations(db);
  instance = new SafeOSServer();
  app = instance.getApp();
  // Model a known loopback proxy; proxy configuration has its own real-path suite.
  app.set('trust proxy', ['127.0.0.1', '::1']);
});
afterAll(async () => {
  await instance?.stop().catch(() => {});
  await db?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('guest session proof and stored profile fields', () => {
  it('returns stored metadata and reads and updates the current profile', async () => {
    const first = await guest();
    const session = await call('get', '/api/auth/session', first.token);
    expect(session.status).toBe(200);
    expect(session.body.data).toMatchObject({ isGuest: true, expiresAt: first.expiresAt, profile: first.profile });
    const profile = await call('get', '/api/auth/profile', first.token);
    expect(profile.status).toBe(200);
    expect(profile.body.data).toEqual(first.profile);
    const updated = await call('patch', '/api/auth/profile', first.token).send({ displayName: 'Alice updated', preferences: { theme: 'light' } });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ id: first.profile.id, displayName: 'Alice updated', preferences: { theme: 'light', defaultScenario: 'pet' } });
  });

  it('reuses the profile only with the live session for that device', async () => {
    const deviceId = 'returning-device';
    const first = await guest(deviceId);
    const resumed = await call('post', '/api/auth/session', first.token).send({ deviceId });
    expect(resumed.status).toBe(201);
    expect(resumed.body.data.profile).toEqual(first.profile);
    expect(resumed.body.data.token).not.toBe(first.token);
    const stranger = await call('post', '/api/auth/session').send({ deviceId });
    expect(stranger.status).toBe(201);
    expect(stranger.body.data.profile.id).not.toBe(first.profile.id);
  });

  it('refuses invalid, expired and mismatched proof without issuing a session', async () => {
    const first = await guest('proof-device');
    const before = await db.get('SELECT COUNT(*) AS count FROM sessions');
    expect((await call('post', '/api/auth/session', 'unknown').send({ deviceId: 'proof-device' })).status).toBe(401);
    expect((await call('post', '/api/auth/session', first.token).send({ deviceId: 'different-device' })).status).toBe(401);
    await db.run('UPDATE sessions SET expires_at = ? WHERE token = ?', [new Date(Date.now() - 1000).toISOString(), first.token]);
    expect((await call('post', '/api/auth/session', first.token).send({ deviceId: 'proof-device' })).status).toBe(401);
    expect((await call('get', '/api/auth/session', first.token)).status).toBe(401);
    expect((await call('get', '/api/auth/profile', first.token)).status).toBe(401);
    expect((await call('post', '/api/auth/device', first.token).send({ deviceId: 'new-device' })).status).toBe(401);
    expect(await db.get('SELECT COUNT(*) AS count FROM sessions')).toEqual(before);
  });
});
