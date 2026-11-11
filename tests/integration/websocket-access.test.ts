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
