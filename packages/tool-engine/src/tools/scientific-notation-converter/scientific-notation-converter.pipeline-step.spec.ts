import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./scientific-notation-converter.pipeline-step.js";

describe('scientific-notation-converter pipeline step', () => {
  it('converts a standard number into scientific notation', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '12345' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '1.2345e+4' } });
  });

  it('fails on non-numeric input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not a number' });
    expect(result.ok).toBe(false);
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '  ' });
    expect(result).toEqual({ ok: false, error: { message: 'Enter a number.', kind: 'invalid-input' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Scientific Notation Converter expects text input.', kind: 'invalid-input' } });
  });
});
