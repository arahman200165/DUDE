import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./html-entities.pipeline-step.js";

describe('html-entities pipeline step', () => {
  it('encodes unsafe html characters', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '<b>a & b</b>' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '&lt;b&gt;a &amp; b&lt;/b&gt;' } });
  });

  it('leaves plain text unchanged', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'hello world' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'hello world' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'HTML Entity Encoder / Decoder expects text input.', kind: 'invalid-input' } });
  });
});
