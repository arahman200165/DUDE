import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./base64.pipeline-step.js";

describe('base64 pipeline step', () => {
  it('decodes valid base64 text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'aGVsbG8=' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'hello' } });
  });

  it('fails on invalid base64', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not-base64!!' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Base64 Decoder expects text input.', kind: 'invalid-input' } });
  });
});
