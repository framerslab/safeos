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
  it('redacts write-only credentials from owned monitoring settings without changing their JSON format', async () => {
    const settings = { motionSensitivity: 35, telegramBotToken: 'private-bot-value',
      smsOverride: { accountSid: 'account-id', authToken: 'private-sms-value', fromNumber: '+15555550100' },
      emailOverride: { apiKey: 'private-email-value', replyTo: 'person@example.test' } };
    await db.run('UPDATE monitoring_profiles SET settings = ? WHERE id = ?',
      [JSON.stringify(settings), 'independent-profile-id']);
    const data = await exported();
    const exportedSettings = data.monitoringProfiles[0].settings;
    expect(typeof exportedSettings).toBe('string');
    const parsed = JSON.parse(exportedSettings);
    expect(parsed.motionSensitivity).toBe(35);
    expect(parsed.smsOverride.authToken).toBeUndefined();
    expect(parsed.emailOverride.apiKey).toBeUndefined();
    expect(parsed.telegramBotToken).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain('private-bot-value');
    expect(JSON.stringify(data)).not.toContain('private-sms-value');
    expect(JSON.stringify(data)).not.toContain('private-email-value');
    expect(JSON.parse((await db.get('SELECT settings FROM monitoring_profiles WHERE id = ?',
      ['independent-profile-id'])).settings)).toEqual(settings);
  });
  it('includes personal active choices, including built-in defaults', async () => {
    const data = await exported();
    expect(data.activeMonitoringProfiles).toEqual([
      { owner_id: alice.profile.id, scenario: 'baby', monitoring_profile_id: 'independent-profile-id' },
      { owner_id: alice.profile.id, scenario: 'pet', monitoring_profile_id: 'profile-pet-default' },
    ]);
  });
  it.each(['{"telegramBotToken":"unreadable-private-value",', ''])('omits unreadable settings while retaining the profile and other rows (%j)', async (settings) => {
    const before = await exported();
    expect(before.monitoringSettingsOmitted).toBe(0);
    const id = 'unreadable-settings-profile';
    await db.run(`INSERT INTO monitoring_profiles (id, name, scenario, settings, is_active, created_at, owner_id)
      VALUES (?, 'Unreadable settings', 'baby', ?, 0, ?, ?)`, [id, settings, now(), alice.profile.id]);
    try {
      const stored = await db.get('SELECT * FROM monitoring_profiles WHERE id = ?', [id]);
      const data = await exported();
      expect(data.monitoringSettingsOmitted).toBe(1);
      expect(data.monitoringProfiles).toHaveLength(before.monitoringProfiles.length + 1);
      expect(data.monitoringProfiles.find((profile: any) => profile.id === id)).toEqual({ ...stored, settings: null });
      expect(data.monitoringProfiles.filter((profile: any) => profile.id !== id)).toEqual(before.monitoringProfiles);
      for (const key of Object.keys(before).filter((key) => !['monitoringProfiles', 'monitoringSettingsOmitted', 'exportedAt'].includes(key))) {
        expect(data[key]).toEqual(before[key]);
      }
      expect(JSON.stringify(data)).not.toContain('unreadable-private-value');
      expect(await db.get('SELECT * FROM monitoring_profiles WHERE id = ?', [id])).toEqual(stored);
    } finally {
      await db.run('DELETE FROM monitoring_profiles WHERE id = ?', [id]);
    }
  });
  it('excludes another persons profiles and choices even when identifiers overlap', async () => {
    const data = await exported();
    expect(JSON.stringify(data)).not.toContain(foreignId);
    expect(JSON.stringify(data)).not.toContain(bob.profile.id);
  });
});


it('keeps the newest full-export rows and reports totals and included counts for every limited kind', async () => {
  await db.exec('BEGIN');
  try {
    for (let i = 0; i < 1001; i++) {
      const created = new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString();
      await db.run("INSERT INTO streams (id, user_id, scenario, started_at, created_at) VALUES (?, ?, 'baby', ?, ?)",
        [`export-stream-${i}`, alice.profile.id, created, created]);
    }
    for (let i = 0; i < 5001; i++) {
      const created = new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString();
      await db.run("INSERT INTO alerts (id, stream_id, alert_type, severity, message, created_at) VALUES (?, 'export-stream-0', 'motion', 'low', 'Saved alert', ?)", [`export-alert-${i}`, created]);
      await db.run("INSERT INTO analysis_results (id, stream_id, concern_level, description, created_at) VALUES (?, 'export-stream-0', 'low', 'Saved analysis', ?)", [`export-analysis-${i}`, created]);
    }
    await db.exec('COMMIT');
  } catch (error) { await db.exec('ROLLBACK'); throw error; }
  const response = await request(server.getApp()).get('/api/export/all')
    .set('X-Forwarded-For', `198.51.100.${++client}`).set('X-Session-Token', alice.token);
  expect(response.status).toBe(200);
  for (const [kind, prefix, limit] of [['streams', 'stream', 1000], ['alerts', 'alert', 5000], ['analysisResults', 'analysis', 5000]] as const) {
    expect(response.body[kind]).toHaveLength(limit);
    expect(response.body[kind][0].id).toBe(`export-${prefix}-${limit}`);
    expect(response.body[kind].at(-1).id).toBe(`export-${prefix}-1`);
    expect(response.body.counts[kind]).toEqual({ total: limit + 1, included: limit, truncated: true });
  }
}, 30000);
