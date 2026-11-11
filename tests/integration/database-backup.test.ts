import { it, expect } from 'vitest';
import { readFileSync, unlinkSync } from 'fs';
import { execFileSync } from 'child_process';
import { join } from 'path';
import { createDatabase } from '@framers/sql-storage-adapter';
import { boundary, startPipeline } from '../helpers/pipeline.js';

it('backs up the real database and restores an HTTP-created stream with the documented commands', async () => {
  const p = await startPipeline();
  try {
    const guide = readFileSync(new URL('../../docs/DEPLOYMENT.md', import.meta.url), 'utf8');
    const backup = guide.split('### Database Backup')[1].match(/```bash\n([\s\S]*?)```/)![1];
    execFileSync('bash', ['-e', '-c', backup], { cwd: p.dir, stdio: 'pipe' });
    const restore = guide.split('### Database Restore')[1]?.match(/```bash\n([\s\S]*?)```/)?.[1];
    expect(restore, 'The guide must include executable database restore commands').toBeTruthy();
    await p.service.stop();
    await p.db.close();
    unlinkSync(join(p.dir, 'db_data/app.sqlite3'));
    execFileSync('bash', ['-e', '-c', restore!], { cwd: p.dir, stdio: 'pipe' });
    boundary.db = await createDatabase({ file: join(p.dir, 'db_data/app.sqlite3'), priority: ['better-sqlite3'] } as any);
    await p.service.start();
    const res = await p.api.get(`/api/streams/${p.streamId}`).set('x-session-token', p.owner.token);
    expect(res.status).toBe(200);
    expect(res.body.stream.id).toBe(p.streamId);
    expect(res.body.stream.user_id).toBe(p.owner.id);
  } finally { await p.close(); }
});
