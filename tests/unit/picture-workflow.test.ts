import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('captures pictures when pull requests open and retains update triggers', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/pictures.yml', import.meta.url), 'utf8');
  const types = workflow.match(/pull_request:\s*\n\s+types:\s*\[([^\]]+)\]/)?.[1]
    .split(',').map(value => value.trim());
  expect(types).toEqual(expect.arrayContaining(['opened', 'labeled', 'synchronize', 'reopened']));
});
