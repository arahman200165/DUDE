import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./conventional-commit-builder.pipeline-step.js";

describe('conventional-commit-builder pipeline step', () => {
  it('builds a feat commit message from the text as the subject', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'add login button' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'feat: add login button' } });
  });

  it('builds a bare header for empty text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'feat: ' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Conventional Commit Builder expects text input.', kind: 'invalid-input' } });
  });
});
