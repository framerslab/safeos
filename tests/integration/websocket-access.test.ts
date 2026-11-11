/** Real HTTP sessions, streams, SQLite storage and WebSocket messages. */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { WebSocket } from 'ws';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createDatabase } from '@framers/sql-storage-adapter';
import sharp from 'sharp';

const { dbRef } = vi.hoisted(() => ({ dbRef: { current: null as any } }));
vi.mock('../../src/db/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/db/index.js')>();
  return { ...actual, getSafeOSDatabase: async () => dbRef.current };
});
import { runMigrations } from '../../src/db/index.js';
import { SafeOSServer } from '../../src/api/server.js';
import { AnalysisQueue } from '../../src/queues/analysis-queue.js';

let dir: string;
let db: any;
let api: SafeOSServer;
let base: string;
let jpeg: string;
let clientNumber = 0;
const sockets: WebSocket[] = [];
interface Caller { token: string; profileId: string }
interface Peer { ws: WebSocket; messages: any[]; id: string }

async function signIn(): Promise<Caller> {
  const res = await request(api.getApp()).post('/api/auth/session')
    .set('X-Forwarded-For', `198.51.100.${++clientNumber}`)
    .send({ displayName: 'Socket test' }).expect(201);
  return { token: res.body.data.token, profileId: res.body.data.profile.id };
}
async function stream(caller: Caller, scenario = 'baby'): Promise<string> {
  const res = await request(api.getApp()).post('/api/streams')
    .set('X-Session-Token', caller.token).send({ scenario }).expect(201);
  return res.body.stream.id;
}
function socket(token?: string): Peer {
  const ws = new WebSocket(base, token ? { headers: { 'X-Session-Token': token } } : {});
  const peer: Peer = { ws, messages: [], id: '' };
  sockets.push(ws);
  ws.on('message', (data) => peer.messages.push(JSON.parse(data.toString())));
  // Oversized messages can close while the client is still sending.
  ws.on('error', () => {});
  return peer;
}
async function connected(caller: Caller): Promise<Peer> {
  const peer = socket(caller.token);
  await vi.waitFor(() => expect(peer.messages.some(m => m.type === 'connected')).toBe(true));
  peer.id = peer.messages.find(m => m.type === 'connected').payload.clientId;
  return peer;
}
function send(peer: Peer, message: unknown): void { peer.ws.send(JSON.stringify(message)); }
async function settle(peer: Peer): Promise<void> {
  const count = peer.messages.filter(m => m.type === 'pong').length;
  send(peer, { type: 'ping' });
  await vi.waitFor(() => expect(peer.messages.filter(m => m.type === 'pong')).toHaveLength(count + 1));
}
async function joinStream(peer: Peer, streamId: string): Promise<void> {
  send(peer, { type: 'join_stream', streamId });
  await settle(peer);
}
function frame(peer: Peer, streamId: string, imageData = jpeg, motionScore = 0): void {
  send(peer, { type: 'frame', streamId, payload: { imageData, motionScore } });
}
async function frameCount(streamId: string): Promise<number> {
  return (await db.get('SELECT COUNT(*) AS n FROM frame_buffer WHERE stream_id = ?', [streamId])).n;
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'safeos-sockets-'));
  db = await createDatabase({ file: join(dir, 'sockets.sqlite3'), priority: ['better-sqlite3', 'sqljs'] } as any);
  dbRef.current = db;
  await runMigrations(db);
  vi.stubEnv('SAFEOS_TRUST_PROXY', '1');
  api = new SafeOSServer();
  // Use the server's actual socket listener and real queue, without starting
  // external model discovery or the worker that consumes queued test jobs.
  const internals = api as unknown as { server: Server; analysisQueue: AnalysisQueue };
  internals.analysisQueue = new AnalysisQueue();
  await new Promise<void>(resolve => internals.server.listen(0, '127.0.0.1', resolve));
  base = `ws://127.0.0.1:${(internals.server.address() as AddressInfo).port}/ws`;
  jpeg = (await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } }).jpeg().toBuffer()).toString('base64');
});
afterEach(() => { for (const ws of sockets.splice(0)) ws.terminate(); });
afterAll(async () => {
  await api?.stop();
  await db?.close?.();
  vi.unstubAllEnvs();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('WebSocket sessions', () => {
  it.each(['missing', 'unknown', 'expired'])('closes a %s session before accepting a stream message', async kind => {
    const owner = await signIn();
    const streamId = await stream(owner);
    if (kind === 'expired') await db.run('UPDATE sessions SET expires_at = ? WHERE token = ?', ['2000-01-01T00:00:00.000Z', owner.token]);
    const peer = socket(kind === 'missing' ? undefined : kind === 'unknown' ? 'unknown-session' : owner.token);
    let closeCode: number | undefined;
    peer.ws.on('close', code => { closeCode = code; });
    peer.ws.on('open', () => send(peer, { type: 'join_stream', streamId }));
    await vi.waitFor(() => expect(closeCode).toBe(1008));
    expect(peer.messages.some(m => m.type === 'connected')).toBe(false);
    expect(await frameCount(streamId)).toBe(0);
  });

  it('authenticates a browser through its first message', async () => {
    const owner = await signIn();
    const peer = socket();
    peer.ws.on('open', () => send(peer, { type: 'authenticate', payload: { token: owner.token } }));
    await vi.waitFor(() => expect(peer.messages.some(m => m.type === 'connected')).toBe(true));
    await settle(peer);
  });

  it('closes a revoked session before storing another frame', async () => {
    const owner = await signIn();
    const streamId = await stream(owner);
    const peer = await connected(owner);
    await db.run('DELETE FROM sessions WHERE token = ?', [owner.token]);
    frame(peer, streamId);
    await vi.waitFor(() => expect(peer.ws.readyState).toBe(WebSocket.CLOSED));
    expect(await frameCount(streamId)).toBe(0);
  });
});

describe('WebSocket stream ownership', () => {
  it('refuses another owner joining a stream and receiving its metrics', async () => {
    const owner = await signIn();
    const outsider = await signIn();
    const streamId = await stream(owner);
    const viewer = await connected(outsider);
    await joinStream(viewer, streamId);
    expect(viewer.messages).toContainEqual(expect.objectContaining({ type: 'error', payload: expect.objectContaining({ code: 'STREAM_FORBIDDEN' }) }));
    api.broadcastToStream(streamId, { type: 'metrics', payload: { motionScore: 7 } });
    await settle(viewer);
    expect(viewer.messages.some(m => m.type === 'metrics')).toBe(false);
  });

  it.each(['frame', 'audio_level'])('refuses another owner sending %s without joining', async type => {
    const owner = await signIn();
    const outsider = await signIn();
    const streamId = await stream(owner);
    const viewer = await connected(owner);
    await joinStream(viewer, streamId);
    const sender = await connected(outsider);
    send(sender, { type, streamId, payload: { imageData: jpeg, motionScore: 100, level: 90 } });
    await vi.waitFor(() => expect(sender.messages).toContainEqual(expect.objectContaining({ type: 'error', payload: expect.objectContaining({ code: 'STREAM_FORBIDDEN' }) })));
    await settle(viewer);
    expect(await frameCount(streamId)).toBe(0);
    expect(await db.get('SELECT id FROM analysis_queue WHERE stream_id = ?', [streamId])).toBeFalsy();
    expect(viewer.messages.some(m => m.type === 'metrics' || m.type === 'audio_level')).toBe(false);
  });

  it.each(['offer', 'answer', 'ice-candidate'])('restricts %s to peers joined to the same owned stream', async type => {
    const owner = await signIn();
    const outsider = await signIn();
    const streamId = await stream(owner);
    const otherStream = await stream(outsider);
    const target = await connected(owner);
    await joinStream(target, streamId);
    const sender = await connected(outsider);
    await joinStream(sender, otherStream);
    send(sender, { type, streamId: otherStream, payload: { targetPeerId: target.id, sdp: 'test' } });
    await vi.waitFor(() => expect(sender.messages).toContainEqual(expect.objectContaining({ type: 'error', payload: expect.objectContaining({ code: 'STREAM_FORBIDDEN' }) })));
    await settle(target);
    expect(target.messages.some(m => m.type === type)).toBe(false);
  });

  it('keeps owner frames, audio and same-stream signalling working', async () => {
    const owner = await signIn();
    const streamId = await stream(owner);
    const sender = await connected(owner);
    const viewer = await connected(owner);
    await joinStream(sender, streamId);
    await joinStream(viewer, streamId);
    frame(sender, streamId);
    await vi.waitFor(async () => expect(await frameCount(streamId)).toBe(1));
    send(sender, { type: 'audio_level', streamId, payload: { level: 12 } });
    for (const type of ['offer', 'answer', 'ice-candidate']) {
      send(sender, { type, streamId, payload: { targetPeerId: viewer.id, sdp: 'test' } });
      await vi.waitFor(() => expect(viewer.messages.some(m => m.type === type && m.payload.peerId === sender.id)).toBe(true));
    }
    expect(viewer.messages.some(m => m.type === 'audio_level' && m.payload.level === 12)).toBe(true);
  });
});

describe('WebSocket frame limits', () => {
  it.each(['not an image', 'truncated JPEG', 'over 2 MiB'])('refuses %s before storage or analysis', async kind => {
    const owner = await signIn();
    const streamId = await stream(owner);
    const peer = await connected(owner);
    const image = kind === 'not an image' ? Buffer.from('not an image').toString('base64')
      : kind === 'truncated JPEG' ? Buffer.from(jpeg, 'base64').subarray(0, 100).toString('base64')
      : Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64');
    frame(peer, streamId, image, 100);
    await vi.waitFor(() => expect(peer.messages).toContainEqual(expect.objectContaining({ type: 'error', payload: expect.objectContaining({ code: kind === 'over 2 MiB' ? 'FRAME_TOO_LARGE' : 'INVALID_FRAME' }) })));
    expect(await frameCount(streamId)).toBe(0);
    expect(await db.get('SELECT id FROM analysis_queue WHERE stream_id = ?', [streamId])).toBeFalsy();
  });

  it('closes a 50 MiB message before storing it', async () => {
    const owner = await signIn();
    const streamId = await stream(owner);
    const peer = await connected(owner);
    let code: number | undefined;
    peer.ws.on('close', value => { code = value; });
    frame(peer, streamId, 'A'.repeat(50 * 1024 * 1024));
    await vi.waitFor(() => expect(code).toBe(1009), { timeout: 5000 });
    expect(await frameCount(streamId)).toBe(0);
  });

  it('shares the frame allowance across reconnects and concurrent sockets for the same profile', async () => {
    const owner = await signIn();
    const streamId = await stream(owner);
    const first = await connected(owner);
    const second = await connected(owner);
    for (let i = 0; i < 30; i++) frame(i % 2 ? first : second, streamId);
    await vi.waitFor(async () => expect(await frameCount(streamId)).toBe(30), { timeout: 5000 });
    first.ws.terminate();
    second.ws.terminate();
    // A different session for the same profile must share the allowance too.
    const token = `second-${owner.token}`;
    await db.run(`INSERT INTO sessions (id, token, is_guest, profile_id, created_at, expires_at, last_active_at)
      SELECT ?, ?, is_guest, profile_id, created_at, expires_at, last_active_at FROM sessions WHERE token = ?`, [token, token, owner.token]);
    const reconnected = await connected({ ...owner, token });
    frame(reconnected, streamId);
    await vi.waitFor(() => expect(reconnected.messages).toContainEqual(expect.objectContaining({ type: 'error', payload: expect.objectContaining({ code: 'RATE_LIMITED' }) })));
    expect(await frameCount(streamId)).toBe(30);
    const independent = await signIn();
    const ownStream = await stream(independent);
    frame(await connected(independent), ownStream);
    await vi.waitFor(async () => expect(await frameCount(ownStream)).toBe(1));
  });
});

describe('WebSocket analysis scenario', () => {
  it.each(['elderly', 'pet'])('queues the %s stream scenario', async scenario => {
    const owner = await signIn();
    const streamId = await stream(owner, scenario);
    frame(await connected(owner), streamId, jpeg, 100);
    await vi.waitFor(async () => expect(await db.get('SELECT scenario FROM analysis_queue WHERE stream_id = ?', [streamId])).toEqual({ scenario }));
  });
});

describe('WebSocket decode capacity', () => {
  it('bounds simultaneous decodes across sockets and profiles', async () => {
    const owner = await signIn();
    const other = await signIn();
    const streamId = await stream(owner);
    const otherStream = await stream(other);
    const peers = await Promise.all([connected(owner), connected(owner), connected(other), connected(other)]);
    const png = (await sharp({ create: { width: 4000, height: 4000, channels: 4, background: 'white' } }).png().toBuffer()).toString('base64');
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const original = sharp.prototype.metadata;
    let active = 0;
    let peak = 0;
    // Keep real image reads in flight so the admission assertion does not
    // depend on machine speed. Every admitted image still uses the decoder.
    const metadata = vi.spyOn(sharp.prototype, 'metadata').mockImplementation(async function (this: sharp.Sharp) {
      active++;
      peak = Math.max(peak, active);
      try {
        const result = await original.call(this);
        await gate;
        return result;
      } finally { active--; }
    });
    try {
      peers.forEach((peer, i) => frame(peer, i < 2 ? streamId : otherStream, png));
      await vi.waitFor(() => expect(peers.flatMap(p => p.messages).filter(m => m.payload?.code === 'RATE_LIMITED')).toHaveLength(2));
      expect(peak).toBe(2);
    } finally {
      release();
      await Promise.all(peers.map(settle));
      metadata.mockRestore();
    }
    expect(await frameCount(streamId) + await frameCount(otherStream)).toBe(2);
  });
});

describe('WebSocket pixel limit', () => {
  it('refuses an image over 16 megapixels before storage or analysis', async () => {
    const owner = await signIn();
    const streamId = await stream(owner);
    const peer = await connected(owner);
    // About 50 KB compressed, so only the pixel limit can refuse it.
    const image = (await sharp({ create: { width: 4001, height: 4000, channels: 3, background: 'white' } }).png().toBuffer()).toString('base64');
    frame(peer, streamId, image, 100);
    await vi.waitFor(() => expect(peer.messages).toContainEqual(expect.objectContaining({ type: 'error', payload: expect.objectContaining({ code: 'INVALID_FRAME' }) })));
    expect(await frameCount(streamId)).toBe(0);
    expect(await db.get('SELECT id FROM analysis_queue WHERE stream_id = ?', [streamId])).toBeFalsy();
  });
});

describe('WebSocket subscriptions', () => {
  it.each(['x'.repeat(129), 'bad channel', 'bad\nchannel', '', 42])('refuses invalid channel %j', async channel => {
    const peer = await connected(await signIn());
    send(peer, { type: 'subscribe', channel });
    await vi.waitFor(() => expect(peer.messages).toContainEqual(expect.objectContaining({
      type: 'error', payload: expect.objectContaining({ code: 'INVALID_CHANNEL' }),
    })));
    expect(peer.ws.readyState).toBe(WebSocket.OPEN);
  });

  it('holds at most 32 subscriptions and releases capacity on unsubscribe', async () => {
    const peer = await connected(await signIn());
    for (let i = 0; i < 20; i++) send(peer, { type: 'subscribe', channel: `channel-${i}` });
    await settle(peer);
    for (let i = 20; i < 33; i++) send(peer, { type: 'subscribe', channel: `channel-${i}` });
    send(peer, { type: 'subscribe', channel: 'channel-0' });
    await settle(peer);
    expect(peer.messages.filter(m => m.type === 'error').map(m => m.payload.code))
      .toEqual(['SUBSCRIPTION_LIMIT']);
    api.broadcast('channel-32', { type: 'refused-channel' });
    api.broadcast('channel-31', { type: 'accepted-channel' });
    await settle(peer);
    expect(peer.messages.some(m => m.type === 'refused-channel')).toBe(false);
    expect(peer.messages.some(m => m.type === 'accepted-channel')).toBe(true);
    send(peer, { type: 'unsubscribe', channel: 'channel-0' });
    send(peer, { type: 'subscribe', channel: 'channel-32' });
    await settle(peer);
    api.broadcast('channel-32', { type: 'replacement-channel' });
    await settle(peer);
    expect(peer.messages.some(m => m.type === 'replacement-channel')).toBe(true);
    expect(peer.messages.filter(m => m.type === 'error')).toHaveLength(1);
  });

  it('accepts a 128-character channel without writing its value to the log', async () => {
    const peer = await connected(await signIn());
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const channel = `AZaz09:_-${'x'.repeat(119)}`;
      send(peer, { type: 'subscribe', channel });
      await settle(peer);
      api.broadcast(channel, { type: 'boundary-channel' });
      await settle(peer);
      expect(peer.messages.some(m => m.type === 'boundary-channel')).toBe(true);
      expect(log.mock.calls.flat().some(arg => String(arg).includes(channel))).toBe(false);
    } finally {
      log.mockRestore();
    }
  });
});

describe('WebSocket server log', () => {
  it('does not write a message type it does not handle into the log', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const peer = await connected(await signIn());
      const type = `unknown-${'x'.repeat(4096)}`;
      send(peer, { type });
      await settle(peer);
      expect(log.mock.calls).toContainEqual(['[WebSocket] Unknown message type']);
      expect(log.mock.calls.flat().some(arg => String(arg).includes(type))).toBe(false);
    } finally {
      log.mockRestore();
    }
  });

  it.each([
    ['session check', 'FROM sessions', { type: 'ping' }],
    ['message handling', 'FROM streams', { type: 'join_stream', streamId: 'any-stream' }],
  ])('writes one line when the %s fails on the database', async (_name, failingQuery, message) => {
    const peer = await connected(await signIn());
    const real = dbRef.current;
    const failure = new TypeError('database unavailable');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    let code: number | undefined;
    peer.ws.on('close', value => { code = value; });
    dbRef.current = new Proxy(real, {
      get(target, prop) {
        if (prop === 'get') {
          return (sql: string, params?: unknown[]) => sql.includes(failingQuery)
            ? Promise.reject(failure) : target.get(sql, params);
        }
        const value = target[prop];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    try {
      send(peer, message);
      await vi.waitFor(() => expect(code).toBe(1011));
      const lines = error.mock.calls.filter(([line]) => String(line).startsWith('[WebSocket]'));
      expect(lines).toEqual([['[WebSocket] Internal error', 'TypeError']]);
      expect(lines[0].map(String).join(' ')).not.toContain('database unavailable');
    } finally {
      dbRef.current = real;
      error.mockRestore();
    }
  });
});
