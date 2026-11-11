import { it, expect, vi } from 'vitest';
import { boundary, startPipeline } from '../helpers/pipeline.js';

it('marks legacy jobs without frame identity as failed rather than completed', async () => {
  const p = await startPipeline();
  try {
    const ws = await p.connect();
    await p.frame(ws, 'unrelated-to-legacy');
    await p.db.run(`INSERT INTO analysis_queue (id, stream_id, scenario, status, created_at)
      VALUES (?, ?, 'baby', 'pending', ?)`, ['legacy-job', p.streamId, new Date().toISOString()]);
    await p.tick();
    expect((await p.db.get('SELECT status FROM analysis_queue WHERE id = ?', ['legacy-job'])).status).toBe('failed');
    expect(boundary.triage).not.toHaveBeenCalled();
    expect((await p.api.get(`/api/analysis?streamId=${p.streamId}`).set('x-session-token', p.owner.token)).body.results).toEqual([]);
  } finally { await p.close(); }
});

it('creates the alert from the stored analysis result after an insertion retry', async () => {
  const p = await startPipeline();
  let run: ReturnType<typeof vi.spyOn> | undefined;
  try {
    boundary.triage.mockResolvedValueOnce('CONCERN_LEVEL: critical').mockResolvedValue('CONCERN_LEVEL: none');
    boundary.analyze.mockResolvedValue('CONCERN_LEVEL: critical\nDETECTED_ISSUES: needs attention');
    const original = p.db.run.bind(p.db);
    let fail = true;
    run = vi.spyOn(p.db, 'run').mockImplementation(async (...args: any[]) => {
      if (fail && String(args[0]).includes('INSERT INTO alerts')) {
        fail = false; throw new Error('Temporary alert write failure');
      }
      return original(...args);
    });
    const ws = await p.connect();
    await p.frame(ws, 'retry-result', 100);
    await p.tick(2000);
    const results = (await p.api.get(`/api/analysis?streamId=${p.streamId}`).set('x-session-token', p.owner.token)).body.results;
    const alerts = (await p.api.get(`/api/alerts?streamId=${p.streamId}`).set('x-session-token', p.owner.token)).body.alerts;
    expect(results).toHaveLength(1);
    expect(results[0].concern_level).toBe('critical');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('critical');
  } finally { run?.mockRestore(); await p.close(); }
});
