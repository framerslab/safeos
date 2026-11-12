import { it, expect, vi } from 'vitest';
import { boundary, image, startPipeline } from '../helpers/pipeline.js';

it.each([
  ['anthropic', 'ANTHROPIC_API_KEY', 'claude-haiku-5-5'],
  ['openai', 'OPENAI_API_KEY', 'gpt-5.6-terra'],
  ['openrouter', 'OPENROUTER_API_KEY', 'google/gemini-2.5-flash'],
] as const)('uses a current vision model for %s through the worker', async (provider, key, model) => {
  const p = await startPipeline();
  try {
    vi.stubEnv(key, 'test-key');
    boundary.healthy.mockResolvedValue(false);
    const reply = 'CONCERN_LEVEL: none';
    boundary[provider].mockReset().mockResolvedValue(provider === 'anthropic'
      ? { content: [{ type: 'text', text: reply }], usage: { input_tokens: 1, output_tokens: 1 } }
      : { choices: [{ message: { content: reply } }], usage: { total_tokens: 2 } });
    const ws = await p.connect();
    await p.frame(ws, await image(`${provider}-frame`), 100);
    await p.tick(1000);
    const res = await p.api.get(`/api/analysis?streamId=${p.streamId}`).set('x-session-token', p.owner.token);
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(boundary[provider].mock.calls[0][0].model).toBe(model);
    expect(res.body.results[0].model_used).toBe(model);
    if (provider === 'openai') {
      expect(boundary.openai.mock.calls[0][0]).toMatchObject({ max_completion_tokens: 4096 });
      expect(boundary.openai.mock.calls[0][0]).not.toHaveProperty('max_tokens');
    }
  } finally { await p.close(); }
});
