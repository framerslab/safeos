import { beforeEach, expect, it, vi } from 'vitest';
import { boundary, image, startPipeline } from '../helpers/pipeline.js';

beforeEach(() => vi.resetModules());

const keys = { p256dh: 'key', auth: 'auth' };
const endpoint = (name: string) => `https://fcm.googleapis.com/push/${name}`;
type Pipeline = Awaited<ReturnType<typeof startPipeline>>;

async function subscribe(p: Pipeline, token: string, name: string) {
  return p.api.post('/api/notifications/subscribe').set('x-session-token', token)
    .send({ subscription: { endpoint: endpoint(name), keys } });
}

it.each(['sign-out', 'missing-session'])('allows a shared browser after %s and delivers to its new owner', async kind => {
  const p = await startPipeline();
  try {
    expect((await subscribe(p, p.other.token, 'shared')).status).toBe(200);
    if (kind === 'sign-out') {
      await p.api.post('/api/auth/email/logout').set('x-session-token', p.other.token).expect(200);
    } else {
      await p.db.run('DELETE FROM sessions WHERE id = ?', [p.other.id]);
    }
    expect((await subscribe(p, p.owner.token, 'shared')).status).toBe(200);
    expect(await p.db.all('SELECT profile_id, session_id FROM push_subscriptions')).toEqual([
      { profile_id: p.owner.id, session_id: p.owner.id },
    ]);
    boundary.triage.mockResolvedValue('CONCERN_LEVEL: critical');
    boundary.analyze.mockResolvedValue('CONCERN_LEVEL: critical');
    const ws = await p.connect();
    await p.frame(ws, await image(`new-browser-owner-${kind}`), 100);
    await p.tick();
    expect(boundary.push).toHaveBeenCalledWith({ endpoint: endpoint('shared'), keys }, expect.anything());
  } finally { await p.close(); }
});

it.each(['missing', 'expired'])('does not count 32 registrations with %s sessions against the live limit', async kind => {
  const p = await startPipeline();
  try {
    await p.db.run('UPDATE sessions SET profile_id = ?, expires_at = ? WHERE id = ?',
      [p.owner.id, '2000-01-01T00:00:00.000Z', p.other.id]);
    if (kind === 'missing') await p.db.run('DELETE FROM sessions WHERE id = ?', [p.other.id]);
    for (let i = 0; i < 32; i++) {
      await p.db.run(`INSERT INTO push_subscriptions (id, profile_id, session_id, endpoint, keys_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      [`old-${i}`, p.owner.id, p.other.id, endpoint(`old-${i}`), JSON.stringify(keys), new Date().toISOString()]);
    }
    expect((await subscribe(p, p.owner.token, 'new')).status).toBe(200);
    expect((await p.api.get('/api/notifications/status').set('x-session-token', p.owner.token))
      .body.status.pushSubscriptions).toBe(1);
  } finally { await p.close(); }
});

it.each(['logout', 'logout-all', 'reset-password', 'expired'])('%s removes the revoked sessions registrations and preserves other sessions', async action => {
  const p = await startPipeline();
  try {
    const { emailAuthService } = await import('../../src/auth/email-auth.js');
    await emailAuthService.initialize();
    const stamp = new Date().toISOString();
    await p.db.run(`INSERT INTO users (id, email, password_hash, display_name, email_verified,
      reset_token, reset_token_expires, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    [p.owner.id, 'owner@example.com', 'unused', 'Owner', 'a'.repeat(64),
      new Date(Date.now() + 60000).toISOString(), stamp, stamp]);
    await p.db.run('UPDATE sessions SET is_guest = 0 WHERE id = ?', [p.owner.id]);
    await p.db.run(`INSERT INTO sessions (id, token, profile_id, is_guest, created_at, expires_at, last_active_at)
      VALUES (?, ?, ?, 0, ?, ?, ?)`,
    ['second-device', 'second-device-token', p.owner.id, stamp, new Date(Date.now() + 86400000).toISOString(), stamp]);
    for (const [token, name] of [[p.owner.token, 'owner'], ['second-device-token', 'second'], [p.other.token, 'other']]) {
      expect((await subscribe(p, token, name)).status).toBe(200);
    }
    if (action === 'expired') {
      await p.db.run('UPDATE sessions SET expires_at = ? WHERE id = ?', ['2000-01-01T00:00:00.000Z', p.owner.id]);
      await p.api.get('/api/notifications/status').set('x-session-token', p.owner.token).expect(401);
    } else if (action === 'reset-password') {
      await p.api.post('/api/auth/email/reset-password')
        .send({ token: 'a'.repeat(64), newPassword: 'NewPassword456' }).expect(200);
    } else {
      await p.api.post(`/api/auth/email/${action}`).set('x-session-token', p.owner.token).expect(200);
    }
    const remaining = action === 'logout-all' || action === 'reset-password'
      ? [p.other.id] : [p.other.id, 'second-device'];
    expect((await p.db.all('SELECT id FROM sessions ORDER BY id')).map((row: any) => row.id)).toEqual(remaining);
    expect((await p.db.all('SELECT session_id FROM push_subscriptions ORDER BY session_id'))
      .map((row: any) => row.session_id)).toEqual(remaining);
  } finally { await p.close(); }
});

it('reports Telegram availability from the callers saved bot token only', async () => {
  const p = await startPipeline();
  try {
    const status = async (token: string) => (await p.api.get('/api/notifications/status')
      .set('x-session-token', token).expect(200)).body.status.telegramEnabled;
    expect(await status(p.owner.token)).toBe(false);
    await p.api.patch('/api/auth/profile').set('x-session-token', p.owner.token)
      .send({ notificationSettings: { telegramBotToken: '123:personal-bot' } }).expect(200);
    expect(await status(p.owner.token)).toBe(true);
    expect(await status(p.other.token)).toBe(false);
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    expect(await status(p.owner.token)).toBe(true);
    await p.api.patch('/api/auth/profile').set('x-session-token', p.owner.token)
      .send({ notificationSettings: { telegramBotToken: '' } }).expect(200);
    expect(await status(p.owner.token)).toBe(false);
  } finally { await p.close(); }
});

it('does not revive an inactive owned endpoint beyond the 32 live-registration limit', async () => {
  const p = await startPipeline();
  try {
    for (let i = 0; i < 33; i++) {
      await p.db.run(`INSERT INTO push_subscriptions (id, profile_id, session_id, endpoint, keys_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      [`limit-${i}`, p.owner.id, i === 32 ? 'missing-session' : p.owner.id,
        endpoint(`limit-${i}`), JSON.stringify(keys), new Date().toISOString()]);
    }
    expect((await subscribe(p, p.owner.token, 'limit-32')).status).toBe(409);
    expect((await p.db.get('SELECT session_id FROM push_subscriptions WHERE id = ?', ['limit-32'])).session_id)
      .toBe('missing-session');
  } finally { await p.close(); }
});
