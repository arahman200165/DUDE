import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./git-command-explainer.pipeline-step.js";

describe('git-command-explainer pipeline step', () => {
  it('explains a git command token by token', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'git commit -m "fix bug"' });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'text') {
      expect(result.output.value).toContain('git (command): The git CLI.');
      expect(result.output.value).toContain('commit (subcommand): Records staged changes as a new commit.');
      expect(result.output.value).toContain('-m (flag): Sets the commit message inline.');
    }
  });

  it('fails on an empty command', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: false, error: { message: 'Enter a git command.', kind: 'invalid-input' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Git Command Explainer expects text input.', kind: 'invalid-input' } });
  });
});
