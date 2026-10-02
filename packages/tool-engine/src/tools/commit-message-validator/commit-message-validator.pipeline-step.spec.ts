import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./commit-message-validator.pipeline-step.js";

describe('commit-message-validator pipeline step', () => {
  it('reports no issues for a well-formed commit message', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'feat: add support for x' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'No issues found.' } });
  });

  it('reports an error for an empty commit message', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '[error] Commit message is empty.' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Commit Message Validator expects text input.', kind: 'invalid-input' } });
  });
});
