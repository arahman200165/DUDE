import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./git-command-builder.pipeline-step.js";

describe('git-command-builder pipeline step', () => {
  it('builds a commit command with the text as the message', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'fix bug' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'git commit -m "fix bug"' } });
  });

  it('builds a bare commit command for empty text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'git commit' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Git Command Builder expects text input.', kind: 'invalid-input' } });
  });
});
