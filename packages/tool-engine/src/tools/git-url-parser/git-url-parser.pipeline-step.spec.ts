import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./git-url-parser.pipeline-step.js";

describe('git-url-parser pipeline step', () => {
  it('parses an https git remote URL', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'https://github.com/user/repo.git' });
    expect(result).toEqual({
      ok: true,
      output: { type: 'json', value: { protocol: 'https', user: undefined, host: 'github.com', port: undefined, owner: 'user', repo: 'repo' } },
    });
  });

  it('parses a url-typed value the same way', async () => {
    const result = await pipelineStep.run({ type: 'url', value: 'git@github.com:user/repo.git' });
    expect(result).toEqual({
      ok: true,
      output: { type: 'json', value: { protocol: 'scp', user: 'git', host: 'github.com', owner: 'user', repo: 'repo' } },
    });
  });

  it('fails on an unrecognized URL format', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not a git url' });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Git URL Parser expects text or url input.', kind: 'invalid-input' } });
  });
});
