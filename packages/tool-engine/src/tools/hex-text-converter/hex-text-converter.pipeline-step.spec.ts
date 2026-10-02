import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./hex-text-converter.pipeline-step.js";

describe('hex-text-converter pipeline step', () => {
  it('converts hex text to UTF-8 text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '68656c6c6f' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'hello' } });
  });

  it('fails on odd-length hex', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'abc' });
    expect(result.ok).toBe(false);
  });

  it('fails on non-hex characters', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'zz' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Hex <-> Text Converter expects text input.', kind: 'invalid-input' } });
  });
});
