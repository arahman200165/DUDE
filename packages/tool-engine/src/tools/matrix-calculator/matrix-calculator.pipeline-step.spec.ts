import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./matrix-calculator.pipeline-step.js";

describe('matrix-calculator pipeline step', () => {
  it('transposes a matrix parsed from text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '1 2\n3 4' });
    expect(result).toEqual({ ok: true, output: { type: 'table', value: { columns: ['0', '1'], rows: [[1, 3], [2, 4]] } } });
  });

  it('transposes a matrix given as a table', async () => {
    const result = await pipelineStep.run({ type: 'table', value: { columns: ['a', 'b'], rows: [[1, 2], [3, 4]] } });
    expect(result).toEqual({ ok: true, output: { type: 'table', value: { columns: ['0', '1'], rows: [[1, 3], [2, 4]] } } });
  });

  it('fails on a jagged/non-numeric input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '1 2\n3' });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Matrix Calculator expects text or table input.', kind: 'invalid-input' } });
  });
});
