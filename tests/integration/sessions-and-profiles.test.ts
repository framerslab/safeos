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
  getMailLinkBase: () => 'https://api.example.com',
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

describe('mounted email sign-in', () => {
  it('registers and sends a verification link served by this API', async () => {
    const registered = await call('post', '/api/auth/email/register').send({ email: 'register@example.com', password: 'GoodPassword123', displayName: 'Mail user' });
    expect(registered.status).toBe(201);
    const link = new URL(verificationMail.mock.calls.at(-1)![1]);
    expect(link.pathname).toBe('/api/auth/email/verify');
    const page = await call('get', link.pathname + link.search);
    expect(page.status).toBe(200);
    expect(page.headers['cache-control']).toBe('no-store');
    expect((await db.get('SELECT email_verified FROM users WHERE email = ?', ['register@example.com'])).email_verified).toBe(0);
    const verified = await call('post', '/api/auth/email/verify').send({ token: link.searchParams.get('token') });
    expect(verified.status).toBe(200);
  });

  it('logs a verified account into owned routes and revokes all its sessions', async () => {
    // Seed an existing verified account to exercise login independently of registration routing.
    const { emailAuthService } = await import('../../src/auth/email-auth.js');
    const account = await emailAuthService.register({ email: 'login@example.com', password: 'GoodPassword123' });
    await db.run('UPDATE users SET email_verified = 1 WHERE id = ?', [account.user!.id]);
    const login = await call('post', '/api/auth/email/login').send({ email: 'login@example.com', password: 'GoodPassword123' });
    expect(login.status).toBe(200);
    const token = login.body.sessionToken;
    const session = await call('get', '/api/auth/session', token);
    expect(session.status).toBe(200);
    expect(session.body.data).toMatchObject({ isGuest: false, profile: { id: account.user!.id } });
    expect((await call('post', '/api/streams', token).send({ scenario: 'baby' })).status).toBe(201);
    expect((await call('get', '/api/auth/email/me').set('Authorization', `Bearer ${token}`)).body.user.id).toBe(account.user!.id);
    const second = await call('post', '/api/auth/email/login').send({ email: 'login@example.com', password: 'GoodPassword123' });
    expect(second.status).toBe(200);
    expect((await call('post', '/api/auth/email/logout-all').set('Authorization', `Bearer ${token}`)).status).toBe(200);
    expect((await call('get', '/api/streams', second.body.sessionToken)).status).toBe(401);
  });

  it('serves reset links, consumes their tokens once and revokes prior sessions', async () => {
    const { emailAuthService } = await import('../../src/auth/email-auth.js');
    const account = await emailAuthService.register({ email: 'reset@example.com', password: 'GoodPassword123' });
    await db.run('UPDATE users SET email_verified = 1 WHERE id = ?', [account.user!.id]);
    const login = await call('post', '/api/auth/email/login').send({ email: 'reset@example.com', password: 'GoodPassword123' });
    expect(login.status).toBe(200);
    expect((await call('post', '/api/auth/email/forgot-password').send({ email: 'reset@example.com' })).status).toBe(200);
    const link = new URL(resetMail.mock.calls.at(-1)![1]);
    expect(link.pathname).toBe('/api/auth/email/reset-password');
    expect((await call('get', link.pathname + link.search)).status).toBe(200);
    const body = { token: link.searchParams.get('token'), newPassword: 'NewPassword456' };
    expect((await call('post', '/api/auth/email/reset-password').send(body)).status).toBe(200);
    expect((await call('post', '/api/auth/email/reset-password').send(body)).status).toBe(400);
    expect((await call('get', '/api/streams', login.body.sessionToken)).status).toBe(401);
    expect((await call('post', '/api/auth/email/login').send({ email: 'reset@example.com', password: 'NewPassword456' })).status).toBe(200);
  });
});

describe('personal active monitoring choices', () => {
  it('lets each person select a default without changing anyone else', async () => {
    const alice = await guest();
    const bob = await guest();
    const selected = await call('post', '/api/profiles/profile-baby-default/activate', alice.token);
    expect(selected.status).toBe(200);
    expect(selected.body.profile.is_active).toBe(1);
    expect((await call('get', '/api/profiles/profile-baby-default', bob.token)).body.profile.is_active).toBe(0);
    const custom = await call('post', '/api/profiles', alice.token).send({ name: 'Nights', scenario: 'baby' });
    expect(custom.status).toBe(201);
    expect((await call('post', `/api/profiles/${custom.body.profile.id}/activate`, alice.token)).status).toBe(200);
    expect((await call('post', '/api/profiles/profile-baby-default/activate', bob.token)).status).toBe(200);
    const a = (await call('get', '/api/profiles?scenario=baby', alice.token)).body.profiles;
    expect(a.filter((p: any) => p.is_active).map((p: any) => p.id)).toEqual([custom.body.profile.id]);
    const b = (await call('get', '/api/profiles?scenario=baby', bob.token)).body.profiles;
    expect(b.filter((p: any) => p.is_active).map((p: any) => p.id)).toEqual(['profile-baby-default']);
    expect((await call('patch', `/api/profiles/${custom.body.profile.id}`, alice.token).send({ isActive: false })).body.profile.is_active).toBe(0);
    expect((await call('get', '/api/profiles/profile-baby-default', bob.token)).body.profile.is_active).toBe(1);
  });
});

describe('unassigned legacy monitoring profiles', () => {
  it('hides legacy rows until the operator assigns an owner', async () => {
    await db.run(`INSERT INTO monitoring_profiles (id, name, scenario, settings, is_active, created_at)
      VALUES ('legacy-watch', 'Private old settings', 'baby', '{"privateNote":"nursery"}', 1, ?)`, [now()]);
    await runMigrations(db);
    const caller = await guest();
    const list = await call('get', '/api/profiles', caller.token);
    expect(list.body.profiles.map((p: any) => p.id)).not.toContain('legacy-watch');
    expect(list.body.profiles.map((p: any) => p.id)).toContain('profile-baby-default');
    expect((await call('get', '/api/profiles/legacy-watch', caller.token)).status).toBe(404);
    expect((await call('post', '/api/profiles/legacy-watch/activate', caller.token)).status).toBe(404);
    await db.run('UPDATE monitoring_profiles SET owner_id = ? WHERE id = ?', [caller.profile.id, 'legacy-watch']);
    expect((await call('get', '/api/profiles/legacy-watch', caller.token)).status).toBe(200);
    const other = await guest();
    expect((await call('get', '/api/profiles/legacy-watch', other.token)).status).toBe(404);
  });
});

describe('optional registration name', () => {
  it.each(['', '   '])('accepts a blank name from the existing form (%j)', async (displayName) => {
    const email = `blank-${displayName.length}@example.com`;
    const res = await call('post', '/api/auth/email/register').send({ email, password: 'GoodPassword123', displayName });
    expect(res.status).toBe(201);
    expect((await db.get('SELECT display_name FROM users WHERE email = ?', [email])).display_name).toBe(email.split('@')[0]);
  });
});

describe('consistent password replacement rules', () => {
  it.each(['reset-password', 'change-password'])('keeps registration strength rules for %s', async (action) => {
    const { emailAuthService } = await import('../../src/auth/email-auth.js');
    const email = `${action}-policy@example.com`;
    const account = await emailAuthService.register({ email, password: 'GoodPassword123' });
    await db.run('UPDATE users SET email_verified = 1 WHERE id = ?', [account.user!.id]);
    const login = await call('post', '/api/auth/email/login').send({ email, password: 'GoodPassword123' });
    expect(login.status).toBe(200);
    const token = login.body.sessionToken;
    await call('post', '/api/auth/email/forgot-password').send({ email }).expect(200);
    const resetToken = (await db.get('SELECT reset_token FROM users WHERE email = ?', [email])).reset_token;
    const before = await db.get('SELECT password_hash, reset_token FROM users WHERE email = ?', [email]);
    for (const newPassword of ['aaaaaaaa', 'AAAAAAAA', 'OnlyLetters', '12345678']) {
      const body = action === 'reset-password'
        ? { token: resetToken, newPassword }
        : { currentPassword: 'GoodPassword123', newPassword };
      expect((await call('post', `/api/auth/email/${action}`, token).send(body)).status).toBe(400);
      expect(await db.get('SELECT password_hash, reset_token FROM users WHERE email = ?', [email])).toEqual(before);
    }
    const strong = action === 'reset-password'
      ? { token: resetToken, newPassword: 'ChangedPassword456' }
      : { currentPassword: 'GoodPassword123', newPassword: 'ChangedPassword456' };
    expect((await call('post', `/api/auth/email/${action}`, token).send(strong)).status).toBe(200);
    expect((await call('post', '/api/auth/email/login').send({ email, password: 'ChangedPassword456' })).status).toBe(200);
  });
});
