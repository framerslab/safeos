import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { Socket } from 'node:net';
import { TelegramBotService } from '../../src/lib/alerts/telegram.js';

it.each([false, true])('closes unanswered Telegram transport requests (photo: %s)', async photo => {
  const sockets = new Set<Socket>();
  const server = createServer(() => { /* Provider accepts the request without replying. */ });
  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const service = new TelegramBotService('123:test-token');
    const bot = (service as any).bot;
    bot.options.baseApiUrl = `http://127.0.0.1:${(server.address() as any).port}`;
    const received = once(server, 'request');
    const pending = service.sendAlert('12345', {
      severity: 'high', title: 'Alert', message: 'Check the stream', streamId: 'stream',
      ...(photo ? { thumbnailUrl: 'https://example.com/image.png' } : {}),
    }).then(() => 'accepted', error => error);
    await received;
    expect(sockets.size).toBe(1);
    const outcome = await Promise.race([pending, new Promise<string>(resolve => {
      deadline = setTimeout(() => resolve('still pending'), 17000);
    })]);
    expect(outcome).toBeInstanceOf(Error);
    expect(String(outcome)).toMatch(/TIMEDOUT/);
    // The SDK must close its transport, not merely stop awaiting delivery.
    for (const socket of sockets) await once(socket, 'close');
    expect(sockets.size).toBe(0);
  } finally {
    clearTimeout(deadline);
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}, 22000);
