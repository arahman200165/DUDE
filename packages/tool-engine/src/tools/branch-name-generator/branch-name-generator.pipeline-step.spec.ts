import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./branch-name-generator.pipeline-step.js";

describe('branch-name-generator pipeline step', () => {
  it('slugifies the text into a feature branch name', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'Fix login bug' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'feature/fix-login-bug' } });
  });

  it('produces just the type prefix for empty text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'feature' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Branch Name Generator expects text input.', kind: 'invalid-input' } });
  });
});
