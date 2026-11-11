import { it, expect, vi, beforeEach } from 'vitest';

// Each case owns a fresh server and its module-scoped HTTP rate-limit stores.
beforeEach(() => vi.resetModules());
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

it.each([['medium', '23:30', 0], ['high', '23:30', 1], ['critical', '23:30', 1], ['medium', '07:00', 1]] as const)('applies saved-zone quiet hours to %s alerts at %s', async (severity, time, calls) => {
  const p = await startPipeline();
  try {
    vi.setSystemTime(new Date(`2026-11-11T${time}:00Z`));
    await p.db.run('UPDATE sessions SET expires_at = ?', ['2099-01-01T00:00:00Z']);
    await channels(p); concern(severity);
    await p.api.patch('/api/auth/profile').set('x-session-token', p.owner.token)
      .send({ notificationSettings: { quietHoursStart: '22:00', quietHoursEnd: '07:00', quietHoursTimeZone: 'UTC', quietHoursDays: [3] } }).expect(200);
    await delivered(p, `quiet-${severity}`);
    expect(await p.db.all('SELECT id FROM alerts')).toHaveLength(1);
    for (const sender of [boundary.push, boundary.email, boundary.telegram]) expect(sender).toHaveBeenCalledTimes(calls);
  } finally { await p.close(); }
});


it('delivers critical alerts beyond capacity and releases stalled channels after fifteen seconds', async () => {
  const p = await startPipeline({ fakeTimeouts: true });
  const queue = (p.service as any).analysisQueue;
  try {
    await channels(p); concern('critical');
    boundary.email.mockImplementation(() => new Promise(() => {}));
    const ws = await p.connect();
    const streams: string[] = [];
    for (let i = 0; i < 33; i++) {
      if (i === 30) vi.setSystemTime(new Date(Date.now() + 60000));
      const stream = i === 0 ? p.streamId : (await p.api.post('/api/streams')
        .set('x-session-token', p.owner.token).send({ scenario: 'elderly' }).expect(201)).body.stream.id;
      streams.push(stream);
      ws.send(JSON.stringify({ type: 'frame', streamId: stream,
        payload: { imageData: await image(`deadline-${i}`), motionScore: 100 } }));
      await until(async () => (await p.db.get('SELECT COUNT(*) AS n FROM analysis_queue')).n === i + 1);
      // Process in arrival order without advancing provider deadline timers.
      await queue.processJobs();
    }
    expect(boundary.push).toHaveBeenCalledTimes(33);
    expect(boundary.sms).toHaveBeenCalledTimes(33);
    expect(boundary.push.mock.calls[32][1].data.streamId).toBe(streams[32]);
    expect((await queue.getStats()).deliveriesInFlight).toBe(33);
    await p.tick(14999);
    expect((await queue.getStats()).deliveriesInFlight).toBe(33);
    await p.tick(1);
    expect((await queue.getStats()).deliveriesInFlight).toBe(0);
  } finally { await p.tick(15000); await p.close(); }
});


it.each([
  ['medium', '23:00', [3], 'America/Los_Angeles', 1],
  ['medium', '07:00', [2], 'America/Los_Angeles', 0],
  ['high', '07:00', [2], 'America/Los_Angeles', 1],
  ['critical', '07:00', [2], 'America/Los_Angeles', 1],
  ['medium', '07:00', [3], 'America/Los_Angeles', 1],
  ['medium', '07:00', [], 'America/Los_Angeles', 1],
  ['medium', '23:00', [3], undefined, 1],
] as const)('uses local time and selected days for %s at %s with days %j and zone %s', async (severity, time, days, zone, calls) => {
  const p = await startPipeline();
  const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    vi.setSystemTime(new Date(`2026-11-11T${time}:00Z`));
    await p.db.run('UPDATE sessions SET expires_at = ?', ['2099-01-01T00:00:00Z']);
    await channels(p); concern(severity);
    await p.api.patch('/api/auth/profile').set('x-session-token', p.owner.token)
      .send({ notificationSettings: { quietHoursStart: '22:00', quietHoursEnd: '07:00',
        quietHoursTimeZone: zone, quietHoursDays: days } }).expect(200);
    await delivered(p, `local-quiet-${severity}`);
    const alerts = await p.db.all('SELECT metadata FROM alerts');
    expect(alerts).toHaveLength(1);
    expect(JSON.parse(alerts[0].metadata).deliverySkipped).toBe(calls ? undefined : 'quiet-hours');
    for (const sender of [boundary.push, boundary.email, boundary.telegram]) expect(sender).toHaveBeenCalledTimes(calls);
    if (!zone) expect(log.mock.calls.filter(([message]) => message ===
      '[NotificationManager] Quiet hours were not applied: no saved time zone')).toHaveLength(1);
  } finally { log.mockRestore(); await p.close(); }
});


it.each(['patch', 'delete'] as const)('preserves a reviewed ban on an owner %s and refuses subsequent socket frames', async method => {
  const p = await startPipeline();
  try {
    const ws = await p.connect();
    await p.db.run("UPDATE user_profiles SET role = 'reviewer' WHERE id = ?", [p.other.id]);
    await p.db.run(`INSERT INTO content_flags (id, stream_id, category, tier, reason, status, created_at)
      VALUES ('ban-flag', ?, 'privacy', 2, 'Needs review', 'pending', ?)`, [p.streamId, new Date().toISOString()]);
    await p.api.post('/api/review/flags/ban-flag/action').set('x-session-token', p.other.token)
      .send({ action: 'banned' }).expect(200);
    await p.api[method](`/api/streams/${p.streamId}`).set('x-session-token', p.owner.token)
      .send(method === 'patch' ? { status: 'active' } : {}).expect(403);
    expect((await p.db.get('SELECT status FROM streams WHERE id = ?', [p.streamId])).status).toBe('banned');
    const messages: any[] = [];
    ws.on('message', raw => messages.push(JSON.parse(raw.toString())));
    ws.send(JSON.stringify({ type: 'frame', streamId: p.streamId,
      payload: { imageData: await image('reviewed-ban'), motionScore: 100 } }));
    await until(async () => messages.some(message => message.payload?.code === 'STREAM_FORBIDDEN'));
    expect(await p.db.get('SELECT id FROM frame_buffer')).toBeFalsy();
    expect(await p.db.get('SELECT id FROM analysis_queue')).toBeFalsy();
  } finally { await p.close(); }
});

it('reserves the banned status for reviewers and operators', async () => {
  const p = await startPipeline();
  try {
    await p.api.patch(`/api/streams/${p.streamId}`).set('x-session-token', p.owner.token)
      .send({ status: 'banned' }).expect(403);
    expect((await p.db.get('SELECT status FROM streams WHERE id = ?', [p.streamId])).status).toBe('active');
    for (const role of ['reviewer', 'operator']) {
      await p.db.run('UPDATE user_profiles SET role = ? WHERE id = ?', [role, p.owner.id]);
      await p.api.patch(`/api/streams/${p.streamId}`).set('x-session-token', p.owner.token)
        .send({ status: 'banned' }).expect(200);
      await p.api.patch(`/api/streams/${p.streamId}`).set('x-session-token', p.owner.token)
        .send({ status: 'active' }).expect(200);
    }
  } finally { await p.close(); }
});


it.each(['disabled', 'failed', 'no-destinations'])('retries after nobody received an alert with %s push and bot channels', async mode => {
  const p = await startPipeline();
  try {
    await channels(p); concern('critical');
    if (mode === 'disabled') await p.api.patch('/api/auth/profile').set('x-session-token', p.owner.token)
      .send({ notificationSettings: { browserPush: false, telegram: false } }).expect(200);
    if (mode === 'no-destinations') {
      await p.api.delete('/api/notifications/subscribe').set('x-session-token', p.owner.token).send({}).expect(200);
      await p.api.delete('/api/notifications/telegram/register').set('x-session-token', p.owner.token)
        .send({ chatId: '12345' }).expect(200);
    }
    for (const sender of [boundary.sms, boundary.email, boundary.push, boundary.telegram]) {
      sender.mockRejectedValue(new Error('Provider unavailable'));
    }
    await delivered(p, `first-failure-${mode}`);
    await until(async () => JSON.parse((await p.db.get('SELECT metadata FROM alerts')).metadata).deliveryFailed === true);
    const first = JSON.parse((await p.db.get('SELECT metadata FROM alerts')).metadata);
    expect(first).toMatchObject({ deliveryAttempted: true, deliverySucceeded: false, deliveryFailed: true });
    await p.tick(3 * 60 * 1000);
    await delivered(p, `second-failure-${mode}`);
    expect(boundary.sms).toHaveBeenCalledTimes(2);
    expect(boundary.email).toHaveBeenCalledTimes(2);
    if (mode === 'failed') {
      expect(boundary.push).toHaveBeenCalledTimes(2);
      expect(boundary.telegram).toHaveBeenCalledTimes(2);
    }
    expect(await p.db.all('SELECT id FROM alerts')).toHaveLength(2);
  } finally { await p.close(); }
});

it.each(['push', 'telegram'] as const)('starts cooldown when at least one %s destination succeeds', async successful => {
  const p = await startPipeline();
  try {
    await channels(p); concern('critical');
    for (const sender of [boundary.sms, boundary.email, boundary.push, boundary.telegram]) {
      sender.mockRejectedValue(new Error('Provider unavailable'));
    }
    if (successful === 'push') await p.api.post('/api/notifications/subscribe').set('x-session-token', p.owner.token)
      .send({ subscription: { endpoint: 'https://fcm.googleapis.com/push/second', keys: { p256dh: 'key', auth: 'auth' } } }).expect(200);
    else await p.api.post('/api/notifications/telegram/register').set('x-session-token', p.owner.token)
      .send({ chatId: '67890' }).expect(200);
    boundary[successful].mockResolvedValueOnce(undefined);
    await delivered(p, `partial-success-${successful}`);
    await until(async () => JSON.parse((await p.db.get('SELECT metadata FROM alerts')).metadata).deliverySucceeded === true);
    await p.tick(3 * 60 * 1000);
    await delivered(p, `after-success-${successful}`);
    expect(boundary.sms).toHaveBeenCalledTimes(1);
    expect(boundary.email).toHaveBeenCalledTimes(1);
    const rows = await p.db.all('SELECT metadata FROM alerts');
    expect(rows.filter((row: any) => JSON.parse(row.metadata).deliverySkipped === 'cooldown')).toHaveLength(1);
  } finally { await p.close(); }
});

it('retains a successful destination when another destination reaches its deadline', async () => {
  const p = await startPipeline({ fakeTimeouts: true });
  try {
    await channels(p); concern('critical');
    await p.api.post('/api/notifications/subscribe').set('x-session-token', p.owner.token)
      .send({ subscription: { endpoint: 'https://fcm.googleapis.com/push/stalled', keys: { p256dh: 'key', auth: 'auth' } } }).expect(200);
    for (const sender of [boundary.sms, boundary.email, boundary.telegram]) sender.mockRejectedValue(new Error('Unavailable'));
    boundary.push.mockImplementation(() => new Promise(() => {})).mockResolvedValueOnce(undefined);
    await delivered(p, 'one-destination-accepted');
    await p.tick(15000);
    const metadata = JSON.parse((await p.db.get('SELECT metadata FROM alerts')).metadata);
    expect(metadata.deliverySucceeded).toBe(true);
    expect(metadata.deliveryResults).toContainEqual({ channel: 'browser', success: false,
      delivered: true, skipped: false, timedOut: true });
    expect((await (p.service as any).analysisQueue.getStats()).deliveriesInFlight).toBe(0);
    await p.tick(3 * 60 * 1000);
    await delivered(p, 'after-partial-timeout');
    expect(boundary.sms).toHaveBeenCalledTimes(1);
  } finally { await p.tick(15000); await p.close(); }
});
