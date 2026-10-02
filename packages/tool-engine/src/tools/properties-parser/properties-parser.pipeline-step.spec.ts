import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./properties-parser.pipeline-step.js";

describe('properties-parser pipeline step', () => {
  it('converts .properties text to json', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'name=test\ncount=1\n' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: { name: 'test', count: '1' } } });
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Properties File Parser expects text input.', kind: 'invalid-input' } });
  });
});
