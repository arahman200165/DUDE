import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./ascii-table.pipeline-step.js";

describe('ascii-table pipeline step', () => {
  it('returns the full table for empty filter text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'table') {
      expect(result.output.value.rows).toHaveLength(128);
      expect(result.output.value.columns).toEqual(['Dec', 'Hex', 'Oct', 'Char', 'Name', 'Category']);
    }
  });

  it('filters the table by search text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'NUL' });
    expect(result).toEqual({
      ok: true,
      output: { type: 'table', value: { columns: ['Dec', 'Hex', 'Oct', 'Char', 'Name', 'Category'], rows: [[0, '0x00', '000', 'NUL', 'NUL', 'Control']] } },
    });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'ASCII Table expects text input.', kind: 'invalid-input' } });
  });
});
