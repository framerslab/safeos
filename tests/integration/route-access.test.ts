/**
 * Route Access Integration Tests
 *
 * Drives the real Express app (SafeOSServer) over HTTP against a real SQLite
 * file. For each protected surface it sends the request that must be refused
 * and the owner's request that must still work: review and moderation,
 * the test text and test mail routes, alerts, analysis results, monitoring
 * profiles, the exports, where a session token may be carried, the rate
 * limiter's client address behind Caddy, and the Caddy preflight answer.
 *
 * @module tests/integration/route-access.test
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createDatabase } from '@framers/sql-storage-adapter';

const { dbRef, smsMock, emailMock } = vi.hoisted(() => ({
  dbRef: { current: null as any },
  smsMock: vi.fn(),
  emailMock: vi.fn(),
}));

// The app's routes read the database through getSafeOSDatabase(); point it at
// a temporary file so the test never touches a working copy's data.
vi.mock('../../src/db/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/db/index.js')>();
  return { ...actual, getSafeOSDatabase: async () => dbRef.current };
});

// The providers are stubbed where a request would leave the process.
vi.mock('../../src/lib/alerts/twilio.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/alerts/twilio.js')>();
  return { ...actual, isTwilioConfigured: () => true, sendTestSms: smsMock };
});
vi.mock('../../src/lib/alerts/email.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/alerts/email.js')>();
  return {
    ...actual,
    isResendConfigured: () => true,
    isMailLinkConfigured: () => true,
    sendTestEmail: emailMock,
  };
});

import { runMigrations, generateId, now } from '../../src/db/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let dir: string;
let db: any;
let server: Server;
let base: string;
let app: any;

interface Caller {
  token: string;
  profileId: string;
}

let alice: Caller;
let bob: Caller;
let reviewer: Caller;
let operator: Caller;

let aliceStream: string;
let bobStream: string;

// Every call names a client address; behind the documented Caddy deployment
// the app takes it from X-Forwarded-For.
let clientCounter = 10;
function nextClient(): string {
  clientCounter += 1;
  return `198.51.100.${clientCounter}`;
}

async function call(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; client?: string; headers?: Record<string, string> } = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    'x-forwarded-for': opts.client ?? '198.51.100.1',
    ...(opts.headers ?? {}),
  };
  if (opts.token) headers['x-session-token'] = opts.token;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`${base}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

/** Guest sign-in through the real route. */
async function signIn(displayName: string): Promise<Caller> {
  const res = await call('POST', '/api/auth/session', { body: { displayName }, client: nextClient() });
  expect(res.status).toBe(201);
  const json = (await res.json()) as any;
  return { token: json.data.token, profileId: json.data.profile.id };
}

async function grantRole(caller: Caller, role: string): Promise<void> {
  await db.run('UPDATE user_profiles SET role = ? WHERE id = ?', [role, caller.profileId]);
}

async function addStream(owner: Caller): Promise<string> {
  const id = generateId();
  await db.run(
    `INSERT INTO streams (id, user_id, scenario, status, started_at, created_at)
     VALUES (?, ?, 'baby', 'active', ?, ?)`,
    [id, owner.profileId, now(), now()]
  );
  return id;
}

async function addAlert(streamId: string): Promise<string> {
  const id = generateId();
  await db.run(
    `INSERT INTO alerts (id, stream_id, alert_type, severity, message, acknowledged, created_at)
     VALUES (?, ?, 'motion', 'high', 'movement in the nursery', 0, ?)`,
    [id, streamId, now()]
  );
  return id;
}

async function addAnalysis(streamId: string): Promise<string> {
  const id = generateId();
  await db.run(
    `INSERT INTO analysis_results (id, stream_id, concern_level, description, created_at)
     VALUES (?, ?, 'low', 'a sleeping child', ?)`,
    [id, streamId, now()]
  );
  return id;
}

async function addFlag(streamId: string): Promise<string> {
  const id = generateId();
  await db.run(
    `INSERT INTO content_flags (id, stream_id, category, tier, reason, status, created_at)
     VALUES (?, ?, 'privacy', 2, 'needs a look', 'pending', ?)`,
    [id, streamId, now()]
  );
  return id;
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'safeos-access-'));
  db = await createDatabase({
    file: join(dir, 'access.sqlite3'),
    priority: ['better-sqlite3', 'sqljs'],
  } as any);
  dbRef.current = db;
  await runMigrations(db);

  // The documented Caddy deployment: one proxy hop in front of the API.
  process.env['SAFEOS_TRUST_PROXY'] = '1';
  const { SafeOSServer } = await import('../../src/api/server.js');
  app = new SafeOSServer().getApp();
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  alice = await signIn('Alice');
  bob = await signIn('Bob');
  reviewer = await signIn('Rita');
  operator = await signIn('Oscar');
  await grantRole(reviewer, 'reviewer');
  await grantRole(operator, 'operator');

  aliceStream = await addStream(alice);
  bobStream = await addStream(bob);
});

afterAll(async () => {
  delete process.env['SAFEOS_TRUST_PROXY'];
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close?.();
  rmSync(dir, { recursive: true, force: true });
});

// =============================================================================
// Guest sign-in
// =============================================================================

describe('guest sign-in', () => {
  it('creates a session whose token opens a signed-in route', async () => {
    const res = await call('GET', '/api/streams', { token: alice.token });
    expect(res.status).toBe(200);
  });
});

// =============================================================================
// 1. Review and moderation
// =============================================================================

describe('review and moderation routes', () => {
  it('refuse a caller with no session', async () => {
    expect((await call('GET', '/api/review/flags')).status).toBe(401);
    expect((await call('GET', '/api/review/stats')).status).toBe(401);
    expect((await call('GET', '/api/review/queue')).status).toBe(401);
  });

  it('refuse a signed-in caller without the reviewer or operator role', async () => {
    const flag = await addFlag(aliceStream);
    expect((await call('GET', '/api/review/flags', { token: bob.token })).status).toBe(403);
    expect((await call('GET', `/api/review/flags/${flag}`, { token: bob.token })).status).toBe(403);
    const action = await call('POST', `/api/review/flags/${flag}/action`, {
      token: bob.token,
      body: { action: 'banned' },
    });
    expect(action.status).toBe(403);
    const stream = await db.get('SELECT status FROM streams WHERE id = ?', [aliceStream]);
    expect(stream.status).toBe('active');
    const row = await db.get('SELECT status FROM content_flags WHERE id = ?', [flag]);
    expect(row.status).toBe('pending');
  });

  it('let a reviewer read flags and an operator act on one', async () => {
    const flag = await addFlag(bobStream);
    const list = await call('GET', '/api/review/flags', { token: reviewer.token });
    expect(list.status).toBe(200);
    const ids = ((await list.json()) as any).flags.map((f: any) => f.id);
    expect(ids).toContain(flag);

    const action = await call('POST', `/api/review/flags/${flag}/action`, {
      token: operator.token,
      body: { action: 'approved', notes: 'fine' },
    });
    expect(action.status).toBe(200);
    const row = await db.get('SELECT status FROM content_flags WHERE id = ?', [flag]);
    expect(row.status).toBe('approved');
  });
});

// =============================================================================
// 2. Test text message and test mail
// =============================================================================

describe('test text message and test mail', () => {
  it('refuse a caller with no session and send nothing', async () => {
    smsMock.mockClear();
    emailMock.mockClear();
    const sms = await call('POST', '/api/notifications/test-sms', { body: { to: '+15551234567' } });
    const mail = await call('POST', '/api/notifications/test-email', { body: { to: 'someone@example.com' } });
    expect(sms.status).toBe(401);
    expect(mail.status).toBe(401);
    expect(smsMock).not.toHaveBeenCalled();
    expect(emailMock).not.toHaveBeenCalled();
  });

  it('refuse a number that is not the caller’s own verified number', async () => {
    smsMock.mockClear();
    const res = await call('POST', '/api/notifications/test-sms', {
      token: bob.token,
      body: { to: '+15551234567' },
    });
    expect(res.status).toBe(403);
    expect(smsMock).not.toHaveBeenCalled();
  });

  it('send to the caller’s own verified number', async () => {
    smsMock.mockClear();
    smsMock.mockResolvedValue({ sid: 'SM1', to: '+15557654321', from: '+15550000000' });
    await db.run(
      `INSERT INTO phone_numbers (id, profile_id, phone_number, verified, created_at)
       VALUES (?, ?, ?, 1, ?)`,
      [generateId(), alice.profileId, '+15557654321', now()]
    );
    const res = await call('POST', '/api/notifications/test-sms', {
      token: alice.token,
      body: { to: '+15557654321' },
    });
    expect(res.status).toBe(200);
    expect(smsMock).toHaveBeenCalledTimes(1);
    expect(smsMock.mock.calls[0][0]).toBe('+15557654321');
  });

  it('refuse a mail on the server’s account from a caller without the operator role', async () => {
    emailMock.mockClear();
    const res = await call('POST', '/api/notifications/test-email', {
      token: bob.token,
      body: { to: 'someone@example.com' },
    });
    expect(res.status).toBe(403);
    expect(emailMock).not.toHaveBeenCalled();
  });

  it('let the operator send a test mail', async () => {
    emailMock.mockClear();
    emailMock.mockResolvedValue({ id: 'm1', to: 'ops@example.com', from: 'SafeOS <alerts@example.com>' });
    const res = await call('POST', '/api/notifications/test-email', {
      token: operator.token,
      body: { to: 'ops@example.com' },
    });
    expect(res.status).toBe(200);
    expect(emailMock).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// 3. Alerts, analysis results and monitoring profiles
// =============================================================================

describe('alerts belong to the stream owner', () => {
  it('hide, refuse and leave alone another owner’s alerts', async () => {
    const alert = await addAlert(aliceStream);

    const list = await call('GET', '/api/alerts', { token: bob.token });
    expect(list.status).toBe(200);
    expect(((await list.json()) as any).alerts.map((a: any) => a.id)).not.toContain(alert);

    expect((await call('GET', `/api/alerts/${alert}`, { token: bob.token })).status).toBe(404);
    expect((await call('POST', `/api/alerts/${alert}/acknowledge`, { token: bob.token })).status).toBe(404);

    const all = await call('POST', '/api/alerts/acknowledge/all', { token: bob.token, body: {} });
    expect(all.status).toBe(200);
    expect(((await all.json()) as any).acknowledgedCount).toBe(0);

    const summary = await call('GET', '/api/alerts/summary/stats', { token: bob.token });
    expect(((await summary.json()) as any).summary.total).toBe(0);

    const row = await db.get('SELECT acknowledged FROM alerts WHERE id = ?', [alert]);
    expect(row.acknowledged).toBe(0);
  });

  it('let the owner read and acknowledge their alerts', async () => {
    const alert = await addAlert(aliceStream);
    const list = await call('GET', '/api/alerts', { token: alice.token });
    expect(((await list.json()) as any).alerts.map((a: any) => a.id)).toContain(alert);
    expect((await call('GET', `/api/alerts/${alert}`, { token: alice.token })).status).toBe(200);
    const all = await call('POST', '/api/alerts/acknowledge/all', { token: alice.token, body: {} });
    expect(((await all.json()) as any).acknowledgedCount).toBeGreaterThanOrEqual(1);
    const row = await db.get('SELECT acknowledged FROM alerts WHERE id = ?', [alert]);
    expect(row.acknowledged).toBe(1);
  });
});

describe('analysis results belong to the stream owner', () => {
  it('hide another owner’s results', async () => {
    const result = await addAnalysis(aliceStream);
    const list = await call('GET', '/api/analysis?limit=100', { token: bob.token });
    expect(list.status).toBe(200);
    expect(((await list.json()) as any).results.map((r: any) => r.id)).not.toContain(result);
    expect((await call('GET', `/api/analysis/${result}`, { token: bob.token })).status).toBe(404);
    const stats = await call('GET', '/api/analysis/stats/summary', { token: bob.token });
    expect(((await stats.json()) as any).stats.total).toBe(0);
  });

  it('show the owner their results', async () => {
    const result = await addAnalysis(aliceStream);
    const list = await call('GET', '/api/analysis?limit=100', { token: alice.token });
    expect(((await list.json()) as any).results.map((r: any) => r.id)).toContain(result);
    expect((await call('GET', `/api/analysis/${result}`, { token: alice.token })).status).toBe(200);
  });
});

describe('monitoring profiles belong to their creator', () => {
  it('hide and refuse changes to another caller’s profile; the creator keeps full use', async () => {
    const created = await call('POST', '/api/profiles', {
      token: alice.token,
      body: { name: 'Night watch', scenario: 'baby', settings: { motionSensitivity: 40 } },
    });
    expect(created.status).toBe(201);
    const id = ((await created.json()) as any).profile.id;

    const bobList = await call('GET', '/api/profiles', { token: bob.token });
    const bobIds = ((await bobList.json()) as any).profiles.map((p: any) => p.id);
    expect(bobIds).not.toContain(id);
    // The built-in defaults stay visible to everyone.
    expect(bobIds).toContain('profile-baby-default');

    expect((await call('GET', `/api/profiles/${id}`, { token: bob.token })).status).toBe(404);
    expect(
      (await call('PATCH', `/api/profiles/${id}`, { token: bob.token, body: { name: 'mine now' } })).status
    ).toBe(404);
    expect((await call('POST', `/api/profiles/${id}/activate`, { token: bob.token })).status).toBe(404);
    expect((await call('DELETE', `/api/profiles/${id}`, { token: bob.token })).status).toBe(404);
    const row = await db.get('SELECT name FROM monitoring_profiles WHERE id = ?', [id]);
    expect(row.name).toBe('Night watch');

    const aliceList = await call('GET', '/api/profiles', { token: alice.token });
    expect(((await aliceList.json()) as any).profiles.map((p: any) => p.id)).toContain(id);
    expect(
      (await call('PATCH', `/api/profiles/${id}`, { token: alice.token, body: { name: 'Nights' } })).status
    ).toBe(200);
    expect((await call('POST', `/api/profiles/${id}/activate`, { token: alice.token })).status).toBe(200);
    expect((await call('DELETE', `/api/profiles/${id}`, { token: alice.token })).status).toBe(200);
  });

  it('refuse changes to the built-in defaults from a caller without the operator role', async () => {
    const res = await call('PATCH', '/api/profiles/profile-pet-default', {
      token: bob.token,
      body: { name: 'renamed' },
    });
    expect(res.status).toBe(404);
    const row = await db.get('SELECT name FROM monitoring_profiles WHERE id = ?', ['profile-pet-default']);
    expect(row.name).not.toBe('renamed');
  });
});

// =============================================================================
// 4. Exports reject an expired session
// =============================================================================

describe('exports', () => {
  it('refuse an expired session and serve a live one', async () => {
    const expired = `expired-${generateId()}`;
    await db.run(
      `INSERT INTO sessions (id, token, device_id, is_guest, profile_id, created_at, expires_at, last_active_at)
       VALUES (?, ?, NULL, 1, ?, ?, ?, ?)`,
      [generateId(), expired, alice.profileId, now(), new Date(Date.now() - 60_000).toISOString(), now()]
    );
    const client = nextClient();
    expect((await call('GET', '/api/export/all', { token: expired, client })).status).toBe(401);
    expect((await call('GET', '/api/export/alerts', { token: expired, client })).status).toBe(401);
    expect((await call('GET', '/api/export/all', { token: alice.token, client })).status).toBe(200);
  });
});

describe('webhooks', () => {
  it('refuse an expired session and serve a live one', async () => {
    const client = nextClient();
    const created = await call('POST', '/api/webhooks', {
      token: alice.token,
      client,
      body: { name: 'Nursery', url: 'https://example.com/hook', events: ['alert.created'] },
    });
    expect(created.status).toBe(201);
    const hookId = ((await created.json()) as any).data.id as string;

    const expired = `expired-${generateId()}`;
    await db.run(
      `INSERT INTO sessions (id, token, device_id, is_guest, profile_id, created_at, expires_at, last_active_at)
       VALUES (?, ?, NULL, 1, ?, ?, ?, ?)`,
      [generateId(), expired, alice.profileId, now(), new Date(Date.now() - 60_000).toISOString(), now()]
    );
    expect((await call('GET', '/api/webhooks', { token: expired, client })).status).toBe(401);
    const createExpired = await call('POST', '/api/webhooks', {
      token: expired,
      client,
      body: { name: 'Late', url: 'https://example.com/late', events: ['alert.created'] },
    });
    expect(createExpired.status).toBe(401);
    expect((await call('POST', `/api/webhooks/${hookId}/test`, { token: expired, client })).status).toBe(401);
    expect((await call('DELETE', `/api/webhooks/${hookId}`, { token: expired, client })).status).toBe(401);

    const list = await call('GET', '/api/webhooks', { token: alice.token, client });
    expect(list.status).toBe(200);
    const ids = ((await list.json()) as any).data.map((w: { id: string }) => w.id);
    expect(ids).toEqual([hookId]);
    expect((await call('DELETE', `/api/webhooks/${hookId}`, { token: alice.token, client })).status).toBe(200);
  });
});

// =============================================================================
// 5. Where a session token may be carried
// =============================================================================

describe('session token transport', () => {
  it('refuse a token in the query string and accept it in the header', async () => {
    const query = await call('GET', `/api/streams?token=${encodeURIComponent(alice.token)}`);
    expect(query.status).toBe(401);
    expect((await call('GET', '/api/streams', { token: alice.token })).status).toBe(200);
    const bearer = await call('GET', '/api/streams', { headers: { authorization: `Bearer ${alice.token}` } });
    expect(bearer.status).toBe(200);
  });

  it('keep tokens out of the Caddy access log', () => {
    const caddy = readFileSync(join(ROOT, 'Caddyfile'), 'utf8');
    // The session header is dropped from every logged request.
    expect(caddy).toMatch(/request>headers>X-Session-Token\s+delete/);
    expect(caddy).toMatch(/request>headers>Authorization\s+delete/);

    // The URI filter is applied here as Caddy applies it (Go RE2 and JavaScript
    // agree on this pattern): no token value survives in a logged URI.
    const m = caddy.match(/request>uri\s+regexp\s+"([^"]+)"\s+"([^"]+)"/);
    expect(m).not.toBeNull();
    const pattern = new RegExp(m![1].replace(/^\(\?i\)/, ''), 'gi');
    const replacement = m![2].replace(/\$(\d)/g, (_s, n) => `$${n}`);
    const redact = (uri: string) => uri.replace(pattern, replacement);

    const secret = 'abcDEF123-secret_token';
    for (const uri of [
      `/api/streams?token=${secret}`,
      `/api/streams?limit=5&token=${secret}`,
      `/api/streams?TOKEN=${secret}&limit=5`,
      `/api/mail/unsubscribe/${secret}`,
      `/api/mail/unsubscribe/${secret}?x=1`,
    ]) {
      expect(redact(uri)).not.toContain(secret);
    }
    expect(redact('/api/streams?limit=5')).toBe('/api/streams?limit=5');
  });
});

// =============================================================================
// 6. Rate limiting by the client's address behind Caddy
// =============================================================================

describe('rate limiter behind the documented Caddy deployment', () => {
  it('counts each client separately', async () => {
    const a = '203.0.113.7';
    const b = '203.0.113.8';
    // Failed sign-in reads count toward the sign-in limit of five a minute.
    let last = 0;
    for (let i = 0; i < 6; i += 1) {
      last = (await call('GET', '/api/auth/session', { client: a })).status;
    }
    expect(last).toBe(429);

    const other = await call('POST', '/api/auth/session', { body: {}, client: b });
    expect(other.status).toBe(201);
  });

  it('counts failed sign-in requests and not successful ones', async () => {
    const c = '203.0.113.9';
    // More successful sign-ins than the limit of five: none of them counts.
    for (let i = 0; i < 7; i += 1) {
      expect((await call('POST', '/api/auth/session', { body: {}, client: c })).status).toBe(201);
    }
    // Five failed requests use up the allowance; the sixth is refused.
    for (let i = 0; i < 5; i += 1) {
      expect((await call('GET', '/api/auth/session', { client: c })).status).toBe(401);
    }
    expect((await call('GET', '/api/auth/session', { client: c })).status).toBe(429);
    expect((await call('POST', '/api/auth/session', { body: {}, client: c })).status).toBe(429);
  });

  it('trusts exactly one proxy hop, and none unless the deployment says so', async () => {
    expect(app.get('trust proxy')).toBe(1);
    delete process.env['SAFEOS_TRUST_PROXY'];
    const { SafeOSServer } = await import('../../src/api/server.js');
    expect(new SafeOSServer().getApp().get('trust proxy')).toBe(false);
    process.env['SAFEOS_TRUST_PROXY'] = '1';

    const compose = readFileSync(join(ROOT, 'docker-compose.prod.yml'), 'utf8');
    expect(compose).toMatch(/SAFEOS_TRUST_PROXY=1\b/);
  });
});

// =============================================================================
// 7. Caddy preflight
// =============================================================================

describe('Caddy preflight answer', () => {
  it('allows every method the app routes and every header the app reads', () => {
    const caddy = readFileSync(join(ROOT, 'Caddyfile'), 'utf8');
    const methods = (caddy.match(/Access-Control-Allow-Methods\s+"([^"]+)"/)?.[1] ?? '')
      .split(',')
      .map((s) => s.trim().toUpperCase());
    const headers = (caddy.match(/Access-Control-Allow-Headers\s+"([^"]+)"/)?.[1] ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase());

    // Collect the methods the real app's routers answer.
    const routed = new Set<string>();
    const walk = (stack: any[]) => {
      for (const layer of stack) {
        if (layer.route) {
          for (const m of Object.keys(layer.route.methods)) routed.add(m.toUpperCase());
        } else if (layer.handle?.stack) {
          walk(layer.handle.stack);
        }
      }
    };
    walk(app._router.stack);
    expect(routed.size).toBeGreaterThan(0);
    for (const m of routed) expect(methods).toContain(m);

    for (const h of ['content-type', 'authorization', 'x-session-token']) {
      expect(headers).toContain(h);
    }
  });
});
