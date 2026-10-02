import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./bearer-token-builder.pipeline-step.js";

describe('bearer-token-builder pipeline step', () => {
  it('wraps a raw token into a Bearer header', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'abc123' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'Bearer abc123' } });
  });

  it('strips an already-present Bearer prefix before rewrapping', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'Bearer abc123' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'Bearer abc123' } });
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '   ' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Bearer Token Builder expects text input.', kind: 'invalid-input' } });
  });
});
