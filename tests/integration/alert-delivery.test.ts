import { it, expect } from 'vitest';
import { boundary, startPipeline } from '../helpers/pipeline.js';

it('delivers each new alert once to its owner and continues after a channel fails', async () => {
  const p = await startPipeline();
  try {
    for (const caller of [p.owner, p.other]) {
      expect((await p.api.post('/api/notifications/subscribe').set('x-session-token', caller.token).send({
        userId: caller.id, subscription: { endpoint: `https://push.example.com/${caller.id}`, keys: { p256dh: 'key', auth: 'auth' } },
      })).status).toBe(200);
      expect((await p.api.post('/api/notifications/telegram/register').set('x-session-token', caller.token).send({ chatId: caller.id })).status).toBe(200);
    }
    boundary.triage.mockResolvedValue('CONCERN_LEVEL: critical');
    boundary.analyze.mockResolvedValue('CONCERN_LEVEL: critical\nDETECTED_ISSUES: needs attention');
    boundary.sms.mockRejectedValue(new Error('Channel unavailable'));
    const ws = await p.connect();
    await p.frame(ws, 'critical-frame', 100);
    await p.tick(1000);
    const res = await p.api.get(`/api/alerts?streamId=${p.streamId}`).set('x-session-token', p.owner.token);
    expect(res.status).toBe(200);
    expect(res.body.alerts).toHaveLength(1);
    const alertId = res.body.alerts[0].id;
    expect(boundary.push).toHaveBeenCalledTimes(1);
    expect(boundary.push.mock.calls[0][0].endpoint).toBe(`https://push.example.com/${p.owner.id}`);
    expect(boundary.push.mock.calls[0][1].data.alertId).toBe(alertId);
    expect(boundary.telegram).toHaveBeenCalledTimes(1);
    expect(boundary.telegram.mock.calls[0][0]).toBe(p.owner.id);
    expect(boundary.sms).toHaveBeenCalledTimes(1);
    expect(boundary.email).toHaveBeenCalledTimes(1);
    expect(boundary.email.mock.calls[0][0]).toBe(`${p.owner.id}@example.com`);
    expect(boundary.email.mock.calls[0][4].alertId).toBe(alertId);
    await p.tick(5000);
    expect(boundary.push).toHaveBeenCalledTimes(1);
    expect(boundary.sms).toHaveBeenCalledTimes(1);
    expect(boundary.email).toHaveBeenCalledTimes(1);
    expect((await p.api.get('/api/alerts').set('x-session-token', p.other.token)).body.alerts).toEqual([]);
  } finally { await p.close(); }
});


it("saves the owner's channel preferences through the profile route", async () => {
  const p = await startPipeline();
  try {
    const settings = { browserPush: false, sms: true, smsNumber: '+15557654321', email: true, emailRecipient: 'new@example.com' };
    const res = await p.api.patch('/api/auth/profile').set('x-session-token', p.owner.token).send({ notificationSettings: settings });
    expect(res.status).toBe(200);
    const saved = await p.db.get('SELECT notification_settings FROM user_profiles WHERE id = ?', [p.owner.id]);
    expect(JSON.parse(saved.notification_settings)).toMatchObject(settings);
  } finally { await p.close(); }
});
