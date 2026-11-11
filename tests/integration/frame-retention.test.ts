import { it, expect } from 'vitest';
import { image, startPipeline } from '../helpers/pipeline.js';

it('deletes an ended stream frame after ten minutes without another frame write', async () => {
  const p = await startPipeline();
  try {
    const ws = await p.connect();
    const id = await p.frame(ws, await image('idle-frame'));
    expect((await p.api.delete(`/api/streams/${p.streamId}`).set('x-session-token', p.owner.token)).status).toBe(200);
    await p.tick(10 * 60 * 1000 + 1000);
    expect(await p.db.get('SELECT id FROM frame_buffer WHERE id = ?', [id])).toBeFalsy();
    expect((await p.api.get('/health')).status).toBe(200);
  } finally { await p.close(); }
});
