import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./find-replace-text.pipeline-step.js";

describe('find-replace-text pipeline step', () => {
  it('passes text through unchanged with the default empty find pattern', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'hello world' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'hello world' } });
  });

  it('handles empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Find & Replace expects text input.', kind: 'invalid-input' } });
  });
});
