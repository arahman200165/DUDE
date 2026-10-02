import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./csv-stats.pipeline-step.js";

describe('csv-stats pipeline step', () => {
  it('computes per-column statistics as a table', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'a\n1\n2\n3\n' });
    expect(result).toEqual({
      ok: true,
      output: { type: 'table', value: { columns: ['Column', 'Count', 'Empty', 'Distinct', 'Min', 'Max', 'Mean'], rows: [['a', '3', '0', '3', '1', '3', '2.00']] } },
    });
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'CSV Column Statistics expects text input.', kind: 'invalid-input' } });
  });
});
