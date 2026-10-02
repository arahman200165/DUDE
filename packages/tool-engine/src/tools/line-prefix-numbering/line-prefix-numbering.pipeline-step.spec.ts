import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./line-prefix-numbering.pipeline-step.js";

describe('line-prefix-numbering pipeline step', () => {
  it('adds line numbers', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'apple\nbanana' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '1. apple\n2. banana' } });
  });

  it('handles a single line', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'only' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '1. only' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Line Prefix/Numbering expects text input.', kind: 'invalid-input' } });
  });
});
