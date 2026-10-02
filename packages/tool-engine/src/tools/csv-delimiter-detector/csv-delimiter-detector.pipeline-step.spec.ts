import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./csv-delimiter-detector.pipeline-step.js";

describe('csv-delimiter-detector pipeline step', () => {
  it('detects a semicolon-delimited sample as a table', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'a;b\n1;2\n3;4\n' });
    expect(result).toEqual({ ok: true, output: { type: 'table', value: { columns: ['a', 'b'], rows: [['1', '2'], ['3', '4']] } } });
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'CSV Delimiter Detector expects text input.', kind: 'invalid-input' } });
  });
});
