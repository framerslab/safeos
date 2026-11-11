import { it, expect, vi } from 'vitest';
import { boundary, startPipeline } from '../helpers/pipeline.js';

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
