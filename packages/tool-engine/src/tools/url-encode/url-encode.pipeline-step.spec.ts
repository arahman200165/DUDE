import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./url-encode.pipeline-step.js";

describe('url-encode pipeline step', () => {
  it('decodes a percent-encoded url component', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'hello%20world' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'hello world' } });
  });

  it('fails on invalid percent-encoding', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '%E0%A4%A' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'URL Encoder / Decoder expects text input.', kind: 'invalid-input' } });
  });
});
