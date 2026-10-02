import { describe, expect, it } from 'vitest';
import { encodeBytes } from "./base-n-codec.js";
import { pipelineStep } from "./base-n-encoder.pipeline-step.js";

function textToBytesUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('base-n-encoder pipeline step', () => {
  it('decodes base58 text back to UTF-8 text', async () => {
    const encoded = encodeBytes(textToBytesUtf8('hello'), 'base58');
    const result = await pipelineStep.run({ type: 'text', value: encoded });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'hello' } });
  });

  it('fails on input containing invalid base58 characters', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '0OIl' });
    expect(result.ok).toBe(false);
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Base-N Encoder / Decoder expects text input.', kind: 'invalid-input' } });
  });
});
