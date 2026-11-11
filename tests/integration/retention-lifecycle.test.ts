import { it, expect, vi } from 'vitest';
import { boundary, startPipeline } from '../helpers/pipeline.js';
import WebSocket from 'ws';
import { once } from 'node:events';

it('releases scheduled work when model initialization rejects an imported server start', async () => {
  const p = await startPipeline();
  try {
    await p.service.stop();
    boundary.models.mockRejectedValueOnce(new Error('Model unavailable'));
    await expect(p.service.start()).rejects.toThrow('Model unavailable');
    const run = vi.spyOn(p.db, 'run');
    await p.tick(5000);
    expect(run.mock.calls.filter(([sql]) => String(sql).startsWith('DELETE FROM frame_buffer'))).toEqual([]);
    run.mockRestore();
    // The same imported instance can start successfully after the dependency recovers.
    await p.service.start();
    expect((await p.api.get('/health')).status).toBe(200);
  } finally {
    if (!(p.service as any).server.listening) await p.service.start();
    await p.close();
  }
});

it('logs only the retention error name and a fixed message and retries the next sweep', async () => {
  const p = await startPipeline();
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const ws = await p.connect();
    const id = await p.frame(ws, 'private-frame-content');
    const original = p.db.run.bind(p.db);
    let fail = true;
    const run = vi.spyOn(p.db, 'run').mockImplementation(async (...args: any[]) => {
      if (fail && String(args[0]).startsWith('DELETE FROM frame_buffer')) {
        fail = false;
        throw new TypeError('private-frame-content in SQL');
      }
      return original(...args);
    });
    await p.tick(1000);
    expect(log.mock.calls).toEqual([['Frame retention cleanup failed (TypeError)']]);
    await p.tick(10 * 60 * 1000);
    expect(await p.db.get('SELECT id FROM frame_buffer WHERE id = ?', [id])).toBeFalsy();
    run.mockRestore();
  } finally { log.mockRestore(); await p.close(); }
});

it('reports an initial retention failure once without exposing stored values to the caller', async () => {
  const p = await startPipeline();
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  let run: ReturnType<typeof vi.spyOn> | undefined;
  try {
    await p.service.stop();
    const original = p.db.run.bind(p.db);
    run = vi.spyOn(p.db, 'run').mockImplementation(async (...args: any[]) => {
      if (String(args[0]).startsWith('DELETE FROM frame_buffer')) {
        throw new TypeError('private-frame-content in SQL');
      }
      return original(...args);
    });
    const failure = await p.service.start().then(() => undefined, (error: Error) => error);
    expect.soft(failure?.message).toBe('Frame retention cleanup failed');
    expect.soft(log.mock.calls).toEqual([['Frame retention cleanup failed (TypeError)']]);
    expect.soft(vi.getTimerCount()).toBe(0);
  } finally {
    run?.mockRestore();
    log.mockRestore();
    if (!(p.service as any).server.listening) await p.service.start();
    await p.close();
  }
});

it('releases scheduled work when the listen port is already in use', async () => {
  const p = await startPipeline();
  const originalTimerCount = vi.getTimerCount();
  const { SafeOSServer } = await import('../../src/api/server.js');
  const service = new SafeOSServer();
  const http = (service as any).server;
  const occupiedPort = (p.service as any).server.address().port;
  const listen = http.listen.bind(http);
  // Keep a real HTTP bind while directing this instance to the occupied port.
  vi.spyOn(http, 'listen').mockImplementation((_port, ready) => listen(occupiedPort, ready));
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const failure = await Promise.race([
      service.start().then(() => undefined, (error: NodeJS.ErrnoException) => error),
      new Promise<undefined>((resolve) => { deadline = setTimeout(() => resolve(undefined), 1000); }),
    ]);
    expect.soft(failure?.code).toBe('EADDRINUSE');
    expect.soft(vi.getTimerCount()).toBe(originalTimerCount);
    expect((await p.api.get('/health')).status).toBe(200);
  } finally {
    clearTimeout(deadline);
    await service.stop().catch(() => {}); // This instance never acquired a listening socket.
    await p.close();
  }
});

it('accepts camera frames after the same server instance stops and starts', async () => {
  const p = await startPipeline();
  let ws: WebSocket | undefined;
  try {
    await p.service.stop();
    await p.service.start();
    const port = (p.service as any).server.address().port;
    ws = new WebSocket(`ws://127.0.0.1:${port}`, { handshakeTimeout: 1000 });
    await once(ws, 'open');
    const frameId = await p.frame(ws, 'after-restart');
    expect(await p.db.get('SELECT id FROM frame_buffer WHERE id = ?', [frameId])).toBeTruthy();
  } finally {
    if (ws && ws.readyState !== WebSocket.CLOSED) { ws.close(); await once(ws, 'close'); }
    await p.close();
  }
});
