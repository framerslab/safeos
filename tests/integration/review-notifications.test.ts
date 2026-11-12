import { it, expect, vi } from 'vitest';
import { boundary, image, startPipeline } from '../helpers/pipeline.js';

const keys = { p256dh: 'key', auth: 'auth' };
const endpoint = (name: string) => `https://fcm.googleapis.com/push/${name}`;

it('preserves a browser subscription owned by another live profile', async () => {
  const p = await startPipeline();
  try {
    const subscription = { endpoint: endpoint('shared-browser'), keys };
    await p.api.post('/api/notifications/subscribe').set('x-session-token', p.owner.token)
      .send({ subscription }).expect(200);
    const original = await p.db.get('SELECT * FROM push_subscriptions');
    await p.api.post('/api/notifications/subscribe').set('x-session-token', p.other.token)
      .send({ subscription: { ...subscription, keys: { ...keys, auth: 'other-key' } } }).expect(409);
    expect(await p.db.get('SELECT * FROM push_subscriptions')).toEqual(original);
    expect((await p.api.get('/api/notifications/status').set('x-session-token', p.owner.token)).body.status.pushSubscriptions).toBe(1);
    expect((await p.api.get('/api/notifications/status').set('x-session-token', p.other.token)).body.status.pushSubscriptions).toBe(0);
    boundary.triage.mockResolvedValue('CONCERN_LEVEL: critical');
    boundary.analyze.mockResolvedValue('CONCERN_LEVEL: critical');
    const ws = await p.connect();
    await p.frame(ws, await image('retained-browser-owner'), 100);
    await p.tick();
    expect(boundary.push).toHaveBeenCalledWith(subscription, expect.anything());
  } finally { await p.close(); }
});

it('revokes only the signing-out session browser registration', async () => {
  const p = await startPipeline();
  try {
    await p.db.run('UPDATE sessions SET profile_id = ? WHERE id = ?', [p.owner.id, p.other.id]);
    for (const device of [p.owner, p.other]) {
      expect((await p.api.post('/api/notifications/subscribe').set('x-session-token', device.token)
        .send({ subscription: { endpoint: endpoint(device.id), keys } })).status).toBe(200);
    }
    expect((await p.api.delete('/api/auth/session').set('x-session-token', p.owner.token)).status).toBe(200);
    expect((await p.db.all('SELECT endpoint FROM push_subscriptions WHERE profile_id = ?', [p.owner.id]))
      .map((row: any) => row.endpoint)).toEqual([endpoint(p.other.id)]);
  } finally { await p.close(); }
});

it('bounds subscription keys before storing them', async () => {
  const p = await startPipeline();
  try {
    expect((await p.api.post('/api/notifications/subscribe').set('x-session-token', p.owner.token)
      .send({ subscription: { endpoint: endpoint('large-key'), keys: { ...keys, p256dh: 'x'.repeat(4096) } } })).status).toBe(400);
    expect(await p.db.get('SELECT id FROM push_subscriptions')).toBeFalsy();
  } finally { await p.close(); }
});

it('limits each profile to 32 subscriptions while allowing a refresh at the limit', async () => {
  const p = await startPipeline();
  try {
    for (let i = 0; i < 32; i++) {
      expect((await p.api.post('/api/notifications/subscribe').set('x-session-token', p.owner.token)
        .send({ subscription: { endpoint: endpoint(String(i)), keys } })).status).toBe(200);
    }
    expect((await p.api.post('/api/notifications/subscribe').set('x-session-token', p.owner.token)
      .send({ subscription: { endpoint: endpoint('overflow'), keys } })).status).toBe(409);
    expect((await p.api.post('/api/notifications/subscribe').set('x-session-token', p.owner.token)
      .send({ subscription: { endpoint: endpoint('0'), keys: { ...keys, auth: 'refreshed' } } })).status).toBe(200);
    expect((await p.api.get('/api/notifications/status').set('x-session-token', p.owner.token)).body.status.pushSubscriptions).toBe(32);
  } finally { await p.close(); }
});

it('refuses a push registration when its resolver does not finish', async () => {
  const p = await startPipeline();
  try {
    boundary.lookup.mockImplementation(() => new Promise(() => {}));
    const res = await p.api.post('/api/notifications/subscribe').set('x-session-token', p.owner.token)
      .send({ subscription: { endpoint: endpoint('stalled'), keys } }).timeout({ deadline: 3500 });
    expect(res.status).toBe(400);
  } finally { await p.close(); }
});

it('skips personal-key mail without a sender when server mail is unavailable', async () => {
  const p = await startPipeline();
  const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    boundary.emailConfigured = false;
    await p.api.patch('/api/auth/profile').set('x-session-token', p.owner.token)
      .send({ notificationSettings: { emailOverride: { apiKey: 'personal-key' } } });
    boundary.triage.mockResolvedValue('CONCERN_LEVEL: critical');
    boundary.analyze.mockResolvedValue('CONCERN_LEVEL: critical');
    const ws = await p.connect();
    await p.frame(ws, await image('missing-sender'), 100);
    await p.tick();
    expect(boundary.email).not.toHaveBeenCalled();
    expect(log.mock.calls).toContainEqual(['[NotificationManager] email channel skipped: personal mail requires a sender or complete server mail configuration']);
  } finally { log.mockRestore(); await p.close(); }
});
