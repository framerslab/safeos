import { vi, expect } from 'vitest';
import request from 'supertest';
import WebSocket from 'ws';
import { once } from 'events';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createDatabase } from '@framers/sql-storage-adapter';

const providers = vi.hoisted(() => ({
  db: null as any,
  healthy: vi.fn(),
  models: vi.fn(),
  lookup: vi.fn(),
  webPush: vi.fn(),
  realPush: false,
  triage: vi.fn(),
  analyze: vi.fn(),
  push: vi.fn(),
  sms: vi.fn(),
  email: vi.fn(),
  emailConfigured: true,
  telegram: vi.fn(),
  openai: vi.fn(),
  openrouter: vi.fn(),
  anthropic: vi.fn(),
}));

export const boundary = providers;

vi.mock('../../src/db/index.js', async (original) => ({
  ...await original<typeof import('../../src/db/index.js')>(),
  getSafeOSDatabase: async () => providers.db,
}));
vi.mock('../../src/lib/ollama/client.js', async (original) => {
  const actual = await original<typeof import('../../src/lib/ollama/client.js')>();
  return { ...actual, OllamaClient: class extends actual.OllamaClient {
    isHealthy = providers.healthy;
    ensureModels = providers.models;
    triage = providers.triage;
    analyze = providers.analyze;
  } };
});
vi.mock('../../src/lib/alerts/browser-push.js', async (original) => {
  const actual = await original<typeof import('../../src/lib/alerts/browser-push.js')>();
  return { ...actual, sendBrowserPushNotification: (...args: Parameters<typeof actual.sendBrowserPushNotification>) =>
    providers.realPush ? actual.sendBrowserPushNotification(...args) : providers.push(...args) };
});
vi.mock('node:dns/promises', () => ({ lookup: providers.lookup }));
vi.mock('web-push', async (original) => {
  const actual = await original<typeof import('web-push')>();
  return { default: { ...actual.default, sendNotification: providers.webPush } };
});
vi.mock('../../src/lib/alerts/twilio.js', async (original) => ({
  ...await original<typeof import('../../src/lib/alerts/twilio.js')>(),
  isTwilioConfigured: () => true, sendAlertSms: providers.sms,
}));
vi.mock('../../src/lib/alerts/email.js', async (original) => ({
  ...await original<typeof import('../../src/lib/alerts/email.js')>(),
  isResendConfigured: () => providers.emailConfigured, sendAlertEmail: providers.email,
}));
vi.mock('../../src/lib/alerts/telegram.js', () => ({
  TelegramBotService: class { sendAlert = providers.telegram; },
}));
vi.mock('openai', () => ({ default: class {
  chat: any;
  constructor(options?: { baseURL?: string }) {
    this.chat = { completions: { create: options?.baseURL ? providers.openrouter : providers.openai } };
  }
} }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class {
  messages = { create: providers.anthropic };
} }));

export async function until(check: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Pipeline did not reach the expected state');
}

export async function startPipeline() {
  vi.stubEnv('SAFEOS_PORT', '0');
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  vi.stubEnv('OPENROUTER_API_KEY', '');
  vi.stubEnv('OPENAI_API_KEY', '');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  const webpush = await import('web-push');
  const vapid = webpush.default.generateVAPIDKeys();
  vi.stubEnv('VAPID_PUBLIC_KEY', vapid.publicKey);
  vi.stubEnv('VAPID_PRIVATE_KEY', vapid.privateKey);
  providers.realPush = false;
  providers.emailConfigured = true;
  providers.lookup.mockReset().mockResolvedValue([{ address: '142.250.1.1', family: 4 }]);
  providers.webPush.mockReset().mockResolvedValue({ statusCode: 201 });
  providers.models.mockReset().mockResolvedValue(undefined);
  providers.healthy.mockReset().mockResolvedValue(true);
  providers.triage.mockReset().mockResolvedValue('CONCERN_LEVEL: none');
  providers.analyze.mockReset().mockResolvedValue('TIER: 0');
  for (const fn of [providers.push, providers.sms, providers.email, providers.telegram]) fn.mockReset().mockResolvedValue(undefined);
  const dir = mkdtempSync(join(tmpdir(), 'safeos-pipeline-'));
  mkdirSync(join(dir, 'db_data'));
  providers.db = await createDatabase({ file: join(dir, 'db_data/app.sqlite3'), priority: ['better-sqlite3'] } as any);
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  const { SafeOSServer } = await import('../../src/api/server.js');
  const service = new SafeOSServer();
  await service.start();
  const api = request(service.getApp());
  const address = (service as any).server.address();
  const clients: WebSocket[] = [];
  const owner = { token: 'pipeline-owner-token', id: 'pipeline-owner' };
  const other = { token: 'pipeline-other-token', id: 'pipeline-other' };
  for (const caller of [owner, other]) {
    const stamp = new Date().toISOString();
    await providers.db.run(`INSERT INTO user_profiles (id, display_name, notification_settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      [caller.id, caller.id, JSON.stringify({ browserPush: true, telegram: true, sms: true, smsNumber: '+15551234567', email: true, emailRecipient: `${caller.id}@example.com` }), stamp, stamp]);
    await providers.db.run(`INSERT INTO sessions (id, token, profile_id, created_at, expires_at, last_active_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [caller.id, caller.token, caller.id, stamp, new Date(Date.now() + 86400000).toISOString(), stamp]);
  }
  const created = await api.post('/api/streams').set('x-session-token', owner.token).send({ scenario: 'baby' });
  expect(created.status).toBe(201);
  const streamId = created.body.stream.id as string;
  async function connect(caller = owner) {
    const ws = new WebSocket(`ws://127.0.0.1:${address.port}`, { headers: { 'x-session-token': caller.token } });
    clients.push(ws);
    await once(ws, 'open');
    ws.on('message', (raw) => { if (JSON.parse(raw.toString()).type === 'ping') ws.send(JSON.stringify({ type: 'pong' })); });
    return ws;
  }
  async function frame(ws: WebSocket, imageData: string, motionScore = 0) {
    ws.send(JSON.stringify({ type: 'frame', streamId, payload: { imageData, motionScore, audioLevel: 0 } }));
    await until(async () => !!await providers.db.get('SELECT id FROM frame_buffer WHERE frame_data = ?', [imageData]));
    if (motionScore >= 10) await until(async () => !!await providers.db.get("SELECT id FROM analysis_queue WHERE status = 'pending'"));
    return (await providers.db.get('SELECT id FROM frame_buffer WHERE frame_data = ?', [imageData])).id as string;
  }
  async function tick(ms = 1000) { await vi.advanceTimersByTimeAsync(ms); }
  async function close() {
    for (const ws of clients) { if (ws.readyState !== WebSocket.CLOSED) { ws.close(); await once(ws, 'close'); } }
    await service.stop();
    await providers.db.close();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  }
  return { api, service, owner, other, streamId, connect, frame, tick, close, dir, get db() { return providers.db; } };
}
