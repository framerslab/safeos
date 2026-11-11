import { it, expect, vi } from 'vitest';
import { once } from 'node:events';
import WebSocket from 'ws';
import { boundary, image, startPipeline, until } from '../helpers/pipeline.js';

type Pipeline = Awaited<ReturnType<typeof startPipeline>>;
async function channels(p: Pipeline) {
  await p.api.patch('/api/auth/profile').set('x-session-token', p.owner.token).send({ notificationSettings: {
    emailOverride: { apiKey: 're_personal' }, emailFromOverride: 'Me <me@example.com>',
    smsOverride: { accountSid: 'AC_personal', authToken: 'personal-token', fromNumber: '+15559999999' },
    telegramBotToken: 'personal-bot',
  } }).expect(200);
  await p.api.post('/api/notifications/subscribe').set('x-session-token', p.owner.token).send({
    subscription: { endpoint: 'https://fcm.googleapis.com/push/owner', keys: { p256dh: 'key', auth: 'auth' } },
  }).expect(200);
  await p.api.post('/api/notifications/telegram/register').set('x-session-token', p.owner.token).send({ chatId: '12345' }).expect(200);
}
function concern(level = 'high') {
  boundary.triage.mockResolvedValue(`CONCERN_LEVEL: ${level}`);
  boundary.analyze.mockResolvedValue(`CONCERN_LEVEL: ${level}`);
}
async function delivered(p: Pipeline, label: string) {
  const ws = await p.connect();
  await p.frame(ws, await image(label), 100);
  await p.tick();
}

it.each(['missing', 'other'])('does not store, queue or deliver frames from a %s owner session', async kind => {
  const p = await startPipeline();
  let ws: WebSocket | undefined;
  try {
    await channels(p); concern();
    const port = (p.service as any).server.address().port;
    ws = new WebSocket(`ws://127.0.0.1:${port}`, kind === 'other' ? { headers: { 'x-session-token': p.other.token } } : {});
    const messages: any[] = [];
    ws.on('message', raw => messages.push(JSON.parse(raw.toString())));
    await once(ws, 'open');
    const closed = kind === 'missing' ? once(ws, 'close') : undefined;
    ws.send(JSON.stringify({ type: 'frame', streamId: p.streamId, payload: { imageData: await image('refused'), motionScore: 100 } }));
    if (closed) expect((await closed)[0]).toBe(1008);
    else await until(async () => messages.some(m => m.payload?.code === 'STREAM_FORBIDDEN'));
    await p.tick(3000);
    expect(await p.db.get('SELECT id FROM frame_buffer')).toBeFalsy();
    expect(await p.db.get('SELECT id FROM analysis_queue')).toBeFalsy();
    for (const sender of [boundary.push, boundary.sms, boundary.email, boundary.telegram]) expect(sender).not.toHaveBeenCalled();
  } finally { ws?.terminate(); await p.close(); }
});

it.each(['ended', 'banned', 'paused'])('refuses frames for an owned %s stream', async status => {
  const p = await startPipeline();
  try {
    const ws = await p.connect();
    await p.db.run('UPDATE streams SET status = ? WHERE id = ?', [status, p.streamId]);
    const messages: any[] = [];
    ws.on('message', raw => messages.push(JSON.parse(raw.toString())));
    ws.send(JSON.stringify({ type: 'frame', streamId: p.streamId, payload: { imageData: await image(status), motionScore: 100 } }));
    ws.send(JSON.stringify({ type: 'ping' }));
    await until(async () => messages.some(m => m.type === 'pong'));
    expect(await p.db.get('SELECT id FROM frame_buffer')).toBeFalsy();
    expect(await p.db.get('SELECT id FROM analysis_queue')).toBeFalsy();
  } finally { await p.close(); }
});

it.each(['ended', 'banned'])('does not dispatch a queued alert after its stream becomes %s', async status => {
  const p = await startPipeline();
  try {
    await channels(p); concern();
    await p.frame(await p.connect(), await image('queued-before-end'), 100);
    await p.db.run('UPDATE streams SET status = ? WHERE id = ?', [status, p.streamId]);
    await p.tick();
    for (const sender of [boundary.push, boundary.sms, boundary.email, boundary.telegram]) expect(sender).not.toHaveBeenCalled();
  } finally { await p.close(); }
});

it('saves repeated alerts but applies a five-minute delivery cooldown and permits escalation', async () => {
  const p = await startPipeline();
  try {
    await channels(p); concern();
    for (const label of ['first', 'second', 'third']) await delivered(p, label);
    const alerts = await p.db.all('SELECT metadata FROM alerts');
    expect(alerts).toHaveLength(3);
    for (const sender of [boundary.push, boundary.sms, boundary.email, boundary.telegram]) expect(sender).toHaveBeenCalledTimes(1);
    expect(alerts.filter((a: any) => JSON.parse(a.metadata).deliverySkipped === 'cooldown')).toHaveLength(2);
    concern('critical'); await delivered(p, 'escalation');
    expect(boundary.email).toHaveBeenCalledTimes(2);
    await p.tick(5 * 60 * 1000);
    await delivered(p, 'after-window');
    expect(boundary.email).toHaveBeenCalledTimes(3);
  } finally { await p.close(); }
});

it('keeps analysis and shutdown moving when mail never settles', async () => {
  const p = await startPipeline();
  let release!: () => void;
  let ticks: Promise<void> | undefined;
  const stuck = new Promise<void>(resolve => { release = resolve; });
  try {
    await channels(p); concern('critical');
    boundary.email.mockImplementation(() => stuck);
    // Three distinct streams avoid the same-stream cooldown.
    const ws = await p.connect();
    for (let i = 0; i < 3; i++) {
      const stream = i === 0 ? p.streamId : (await p.api.post('/api/streams').set('x-session-token', p.owner.token).send({ scenario: 'elderly' })).body.stream.id;
      ws.send(JSON.stringify({ type: 'frame', streamId: stream, payload: { imageData: await image(`slow-${i}`), motionScore: 100 } }));
      await until(async () => (await p.db.get('SELECT COUNT(*) AS n FROM analysis_queue')).n === i + 1);
    }
    ticks = p.tick(4000);
    await Promise.race([ticks, new Promise(resolve => setTimeout(resolve, 500))]);
    expect((await p.db.get('SELECT COUNT(*) AS n FROM analysis_results')).n).toBe(3);
    ws.close(); await once(ws, 'close');
    const stopped = p.service.stop();
    expect(await Promise.race([stopped.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 500))])).toBe(true);
    await p.service.start();
  } finally { release(); await ticks; await p.close(); }
});

it('never returns saved provider secrets in profile and session responses', async () => {
  const p = await startPipeline();
  try {
    const settings = { smsOverride: { accountSid: 'AC_test', authToken: 'secret-token', fromNumber: '+15559999999' },
      emailOverride: { apiKey: 're_secret' }, telegramBotToken: '123:secret-bot' };
    const patched = await p.api.patch('/api/auth/profile').set('x-session-token', p.owner.token).send({ notificationSettings: settings }).expect(200);
    const profile = await p.api.get('/api/auth/profile').set('x-session-token', p.owner.token).expect(200);
    const session = await p.api.get('/api/auth/session').set('x-session-token', p.owner.token).expect(200);
    const empty = await p.api.patch('/api/auth/profile').set('x-session-token', p.owner.token).send({}).expect(200);
    const exported = await p.api.get('/api/export/profile').set('x-session-token', p.owner.token).expect(200);
    const all = await p.api.get('/api/export/all').set('x-session-token', p.owner.token).expect(200);
    for (const body of [patched.body, profile.body, session.body, empty.body, exported.body, all.body]) {
      for (const secret of ['secret-token', 're_secret', '123:secret-bot']) expect(JSON.stringify(body)).not.toContain(secret);
    }
    expect(profile.body.data.notificationSettings).toMatchObject({ smsOverride: { hasAuthToken: true }, emailOverride: { hasApiKey: true }, hasBotToken: true });
    await p.api.patch('/api/auth/profile').set('x-session-token', p.owner.token)
      .send({ notificationSettings: { ...profile.body.data.notificationSettings, email: false } }).expect(200);
    expect(JSON.parse((await p.db.get('SELECT notification_settings FROM user_profiles WHERE id = ?', [p.owner.id])).notification_settings)).toMatchObject(settings);
    await p.api.patch('/api/auth/profile').set('x-session-token', p.owner.token)
      .send({ notificationSettings: { emailOverride: {}, smsOverride: {}, telegramBotToken: '' } }).expect(200);
    const cleared = await p.api.get('/api/auth/profile').set('x-session-token', p.owner.token).expect(200);
    expect(cleared.body.data.notificationSettings).toMatchObject({ emailOverride: { hasApiKey: false }, smsOverride: { hasAuthToken: false }, hasBotToken: false });
  } finally { await p.close(); }
});

it.each([false, true])('unsubscribe preserves the other device (explicit endpoint: %s)', async explicit => {
  const p = await startPipeline();
  try {
    await p.db.run('UPDATE sessions SET profile_id = ? WHERE id = ?', [p.owner.id, p.other.id]);
    for (const device of [p.owner, p.other]) await p.api.post('/api/notifications/subscribe').set('x-session-token', device.token)
      .send({ subscription: { endpoint: `https://fcm.googleapis.com/push/${device.id}`, keys: { p256dh: 'key', auth: 'auth' } } }).expect(200);
    await p.api.delete('/api/notifications/subscribe').set('x-session-token', p.owner.token)
      .send(explicit ? { endpoint: `https://fcm.googleapis.com/push/${p.owner.id}` } : {}).expect(200);
    expect(await p.db.all('SELECT session_id FROM push_subscriptions')).toEqual([{ session_id: p.other.id }]);
  } finally { await p.close(); }
});

it('recovers a claimed job on startup without duplicating its result or alert', async () => {
  const p = await startPipeline();
  try {
    await channels(p); concern();
    const ws = await p.connect();
    const frameId = await p.frame(ws, await image('interrupted'), 100);
    ws.close(); await once(ws, 'close');
    await p.service.stop();
    await p.db.run("UPDATE analysis_queue SET status = 'processing'");
    await p.service.start(); await p.tick();
    expect(await p.db.get('SELECT frame_id FROM analysis_results')).toEqual({ frame_id: frameId });
    expect(boundary.email).toHaveBeenCalledTimes(1);
    await p.service.stop(); await p.db.run("UPDATE analysis_queue SET status = 'processing'");
    await p.service.start(); await p.tick();
    expect(await p.db.all('SELECT id FROM analysis_results')).toHaveLength(1);
    expect(await p.db.all('SELECT id FROM alerts')).toHaveLength(1);
    expect(boundary.email).toHaveBeenCalledTimes(1);
  } finally { await p.close(); }
});

it('rejects repeated startup without replacing live timers or the queue', async () => {
  const p = await startPipeline();
  const live = p.service as any;
  const timers = [live.heartbeatInterval, live.frameCleanupInterval, live.analysisQueue];
  try {
    await expect(p.service.start()).rejects.toThrow();
    expect([live.heartbeatInterval, live.frameCleanupInterval, live.analysisQueue]).toEqual(timers);
    await p.service.stop();
    expect(vi.getTimerCount()).toBe(0);
    await p.service.start();
  } finally {
    // Preserve cleanup on the unfixed implementation too.
    clearInterval(timers[0]); clearInterval(timers[1]); await timers[2].stop();
    await p.close();
  }
});

it('preserves the socket payload limit after restart', async () => {
  const p = await startPipeline();
  let ws: WebSocket | undefined;
  try {
    await p.service.stop(); await p.service.start();
    const port = (p.service as any).server.address().port;
    ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { 'x-session-token': p.owner.token } });
    ws.on('error', () => {});
    await once(ws, 'open');
    const closed = once(ws, 'close');
    ws.send(JSON.stringify({ type: 'frame', streamId: p.streamId, payload: { imageData: 'A'.repeat(4 * 1024 * 1024) } }));
    const code = await Promise.race([closed.then(([value]) => value), new Promise(resolve => setTimeout(() => resolve(0), 500))]);
    expect(code).toBe(1009);
    expect(await p.db.get('SELECT id FROM frame_buffer')).toBeFalsy();
  } finally { ws?.terminate(); await p.close(); }
});

it.each([['medium', '23:30', 0], ['high', '23:30', 0], ['critical', '23:30', 1], ['medium', '07:00', 1]] as const)('applies UTC quiet hours to %s alerts at %s', async (severity, time, calls) => {
  const p = await startPipeline();
  try {
    vi.setSystemTime(new Date(`2026-11-11T${time}:00Z`));
    await p.db.run('UPDATE sessions SET expires_at = ?', ['2099-01-01T00:00:00Z']);
    await channels(p); concern(severity);
    await p.api.patch('/api/auth/profile').set('x-session-token', p.owner.token)
      .send({ notificationSettings: { quietHoursStart: '22:00', quietHoursEnd: '07:00' } }).expect(200);
    await delivered(p, `quiet-${severity}`);
    expect(await p.db.all('SELECT id FROM alerts')).toHaveLength(1);
    for (const sender of [boundary.push, boundary.email, boundary.telegram]) expect(sender).toHaveBeenCalledTimes(calls);
  } finally { await p.close(); }
});
