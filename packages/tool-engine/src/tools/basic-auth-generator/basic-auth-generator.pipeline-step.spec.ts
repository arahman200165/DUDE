import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./basic-auth-generator.pipeline-step.js";

describe('basic-auth-generator pipeline step', () => {
  it('decodes a full Authorization header into username:password', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'Basic dXNlcjpwYXNz' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'user:pass' } });
  });

  it('decodes a bare Base64 payload without the "Basic " prefix', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'dXNlcjpwYXNz' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'user:pass' } });
  });

  it('fails on invalid Base64', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'Basic not-base64!!' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Basic Auth Header Generator expects text input.', kind: 'invalid-input' } });
  });
});
