import { it, expect, vi } from 'vitest';
import { boundary, startPipeline } from '../helpers/pipeline.js';

type Pipeline = Awaited<ReturnType<typeof startPipeline>>;
async function alert(p: Pipeline) {
  boundary.triage.mockResolvedValue('CONCERN_LEVEL: critical');
  boundary.analyze.mockResolvedValue('CONCERN_LEVEL: critical\nDETECTED_ISSUES: needs attention');
  const ws = await p.connect();
  await p.frame(ws, 'destination-test-frame', 100);
  await p.tick();
  const res = await p.api.get(`/api/alerts?streamId=${p.streamId}`).set('x-session-token', p.owner.token);
  expect(res.status).toBe(200);
  expect(res.body.alerts).toHaveLength(1);
}
const keys = { p256dh: 'key', auth: 'auth' };

it.each([
  'http://fcm.googleapis.com/send/test', 'https://127.0.0.1/push',
  'https://[::1]/push', 'https://localhost/push', 'https://10.0.0.1/push',
  'https://169.254.169.254/push', 'https://fcm.googleapis.com:8443/push',
  'https://fcm.googleapis.com.example.com/push', 'https://push.example.com/push',
  'https://user:pass@fcm.googleapis.com/push', 'https://fcm.googleapis.com/push#secret',
])('rejects an untrusted push registration: %s', async (endpoint) => {
  const p = await startPipeline();
  try {
    const res = await p.api.post('/api/notifications/subscribe').set('x-session-token', p.owner.token)
      .send({ subscription: { endpoint, keys } });
    expect(res.status).toBe(400);
    expect(await p.db.get('SELECT id FROM push_subscriptions')).toBeFalsy();
  } finally { await p.close(); }
});

it.each(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com', 'wns2.notify.windows.com'])(
  'accepts a documented push service: %s', async (host) => {
    const p = await startPipeline();
    try {
      expect((await p.api.post('/api/notifications/subscribe').set('x-session-token', p.owner.token)
        .send({ subscription: { endpoint: `https://${host}/push/test`, keys } })).status).toBe(200);
    } finally { await p.close(); }
  });

it.each(['127.0.0.1', '10.1.2.3', '169.254.1.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1'])(
  'rejects a push service resolving to a non-public address: %s', async (address) => {
    const p = await startPipeline();
    try {
      boundary.lookup.mockResolvedValue([{ address, family: address.includes(':') ? 6 : 4 }]);
      expect((await p.api.post('/api/notifications/subscribe').set('x-session-token', p.owner.token)
        .send({ subscription: { endpoint: 'https://fcm.googleapis.com/push/test', keys } })).status).toBe(400);
    } finally { await p.close(); }
  });

it.each(['https://127.0.0.1/push', 'https://push.example.com/push'])(
  'rechecks legacy push destinations at delivery: %s', async (endpoint) => {
    const p = await startPipeline();
    try {
      boundary.realPush = true;
      await p.db.run('INSERT INTO push_subscriptions (id, profile_id, endpoint, keys_json, created_at) VALUES (?, ?, ?, ?, ?)',
        ['legacy', p.owner.id, endpoint, JSON.stringify(keys), new Date().toISOString()]);
      await alert(p);
      expect(boundary.webPush).not.toHaveBeenCalled();
    } finally { await p.close(); }
  });

it('rechecks push DNS at delivery after registration', async () => {
  const p = await startPipeline();
  try {
    boundary.realPush = true;
    expect((await p.api.post('/api/notifications/subscribe').set('x-session-token', p.owner.token)
      .send({ subscription: { endpoint: 'https://fcm.googleapis.com/push/test', keys } })).status).toBe(200);
    boundary.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await alert(p);
    expect(boundary.webPush).not.toHaveBeenCalled();
  } finally { await p.close(); }
});

it.each(['unverified', 'other-owner', 'operator-unverified'])(
  'skips server SMS without the alert owner verified number: %s', async (kind) => {
    const p = await startPipeline();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      if (kind === 'operator-unverified') await p.db.run("UPDATE user_profiles SET role = 'operator' WHERE id = ?", [p.owner.id]);
      await p.db.run('INSERT INTO phone_numbers (id, profile_id, phone_number, verified, created_at) VALUES (?, ?, ?, ?, ?)',
        ['phone', kind === 'other-owner' ? p.other.id : p.owner.id, '+15551234567', kind === 'other-owner' ? 1 : 0, new Date().toISOString()]);
      await alert(p);
      expect(boundary.sms).not.toHaveBeenCalled();
      expect(warn.mock.calls.filter(([line]) => String(line).includes('sms channel skipped'))).toEqual([
        ['[NotificationManager] sms channel skipped: recipient is not verified for the alert owner'],
      ]);
    } finally { warn.mockRestore(); await p.close(); }
  });

it('sends server SMS only to the owner verified number', async () => {
  const p = await startPipeline();
  try {
    await p.db.run('INSERT INTO phone_numbers (id, profile_id, phone_number, verified, created_at) VALUES (?, ?, ?, 1, ?)',
      ['phone', p.owner.id, '+15551234567', new Date().toISOString()]);
    await alert(p);
    expect(boundary.sms).toHaveBeenCalledTimes(1);
    expect(boundary.sms.mock.calls[0][0]).toBe('+15551234567');
  } finally { await p.close(); }
});

it('skips server mail and Telegram when the owner has no verified recipient', async () => {
  const p = await startPipeline();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    expect((await p.api.post('/api/notifications/telegram/register').set('x-session-token', p.owner.token)
      .send({ chatId: '12345' })).status).toBe(200);
    await alert(p);
    expect(boundary.email).not.toHaveBeenCalled();
    expect(boundary.telegram).not.toHaveBeenCalled();
    expect(warn.mock.calls.filter(([line]) => /(?:email|telegram) channel skipped/.test(String(line)))).toEqual(expect.arrayContaining([
      ['[NotificationManager] email channel skipped: server mail requires an operator owner'],
      ['[NotificationManager] telegram channel skipped: recipient verification is unavailable for the server bot'],
    ]));
    expect(JSON.stringify(warn.mock.calls)).not.toContain('pipeline-owner@example.com');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('12345');
  } finally { warn.mockRestore(); await p.close(); }
});

it('honors owner supplied provider credentials saved through the profile route', async () => {
  const p = await startPipeline();
  try {
    const settings = {
      smsOverride: { accountSid: 'AC_personal', authToken: 'personal-token', fromNumber: '+15559999999' },
      emailOverride: { apiKey: 're_personal' }, telegramBotToken: 'personal-bot-token',
    };
    const saved = await p.api.patch('/api/auth/profile').set('x-session-token', p.owner.token).send({ notificationSettings: settings });
    expect(saved.status).toBe(200);
    expect(saved.body.data.notificationSettings).toMatchObject(settings);
    expect((await p.api.post('/api/notifications/telegram/register').set('x-session-token', p.owner.token)
      .send({ chatId: '12345' })).status).toBe(200);
    await alert(p);
    expect(boundary.sms.mock.calls[0][4].override).toEqual(settings.smsOverride);
    expect(boundary.email.mock.calls[0][4].override).toEqual(settings.emailOverride);
    expect(boundary.telegram).toHaveBeenCalledTimes(1);
  } finally { await p.close(); }
});

it('allows server mail for a stored operator owner', async () => {
  const p = await startPipeline();
  try {
    await p.db.run("UPDATE user_profiles SET role = 'operator' WHERE id = ?", [p.owner.id]);
    await alert(p);
    expect(boundary.email).toHaveBeenCalledTimes(1);
  } finally { await p.close(); }
});

it('does not follow a redirect returned by the push provider', async () => {
  const p = await startPipeline();
  const https = (await import('node:https')).default;
  const { EventEmitter } = await import('node:events');
  const { createECDH, randomBytes } = await import('node:crypto');
  const actual = await vi.importActual<typeof import('web-push')>('web-push');
  const request = vi.spyOn(https, 'request').mockImplementation(((_options: unknown, respond: (response: any) => void) => {
    const req = new EventEmitter() as any;
    req.write = () => true;
    req.end = () => {
      const response = Object.assign(new EventEmitter(), {
        statusCode: 302, headers: { location: 'https://127.0.0.1/redirect-target' },
      });
      respond(response);
      queueMicrotask(() => response.emit('end'));
    };
    return req;
  }) as any);
  try {
    boundary.realPush = true;
    boundary.webPush.mockImplementation(actual.default.sendNotification);
    const clientKey = createECDH('prime256v1');
    clientKey.generateKeys();
    const subscription = {
      endpoint: 'https://fcm.googleapis.com/push/redirect',
      keys: { p256dh: clientKey.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') },
    };
    expect((await p.api.post('/api/notifications/subscribe').set('x-session-token', p.owner.token)
      .send({ subscription })).status).toBe(200);
    await alert(p);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toMatchObject({ hostname: 'fcm.googleapis.com', path: '/push/redirect' });
  } finally { request.mockRestore(); await p.close(); }
});
