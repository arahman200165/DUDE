import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./git-remote-inspector.pipeline-step.js";

describe('git-remote-inspector pipeline step', () => {
  it('parses "git remote -v" output into a table', async () => {
    const result = await pipelineStep.run({
      type: 'text',
      value: 'origin\thttps://github.com/user/repo.git (fetch)\norigin\thttps://github.com/user/repo.git (push)',
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'table') {
      expect(result.output.value.columns).toEqual(['name', 'direction', 'url', 'host', 'owner', 'repo']);
      expect(result.output.value.rows).toEqual([
        ['origin', 'fetch', 'https://github.com/user/repo.git', 'github.com', 'user', 'repo'],
        ['origin', 'push', 'https://github.com/user/repo.git', 'github.com', 'user', 'repo'],
      ]);
    }
  });

  it('returns an empty table for text with no matching lines', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: true, output: { type: 'table', value: { columns: ['name', 'direction', 'url', 'host', 'owner', 'repo'], rows: [] } } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Git Remote Inspector expects text input.', kind: 'invalid-input' } });
  });
});
