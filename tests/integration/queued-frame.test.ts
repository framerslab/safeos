import { it, expect } from 'vitest';
import { boundary, image, startPipeline } from '../helpers/pipeline.js';

it('analyses the triggering frame even when a newer quiet frame arrives before the worker tick', async () => {
  const p = await startPipeline();
  try {
    const ws = await p.connect();
    const firstId = await p.frame(ws, await image('trigger-frame'), 100);
    await p.tick(1);
    await p.frame(ws, await image('newer-quiet-frame'));
    await p.tick(1000);
    const res = await p.api.get(`/api/analysis?streamId=${p.streamId}`).set('x-session-token', p.owner.token);
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].frame_id).toBe(firstId);
    expect(boundary.triage).toHaveBeenCalledWith(await image('trigger-frame'), expect.any(String));
  } finally { await p.close(); }
});

it('does not substitute a newer frame after the triggering frame expires', async () => {
  const p = await startPipeline();
  try {
    const ws = await p.connect();
    const firstId = await p.frame(ws, await image('expired-trigger'), 100);
    await p.db.run('DELETE FROM frame_buffer WHERE id = ?', [firstId]);
    await p.frame(ws, await image('unrelated-frame'));
    await p.tick(4000);
    const res = await p.api.get(`/api/analysis?streamId=${p.streamId}`).set('x-session-token', p.owner.token);
    expect(res.body.results).toEqual([]);
    expect(boundary.triage).not.toHaveBeenCalled();
  } finally { await p.close(); }
});
