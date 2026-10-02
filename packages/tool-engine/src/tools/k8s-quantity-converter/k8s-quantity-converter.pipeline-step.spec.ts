import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./k8s-quantity-converter.pipeline-step.js";

describe('k8s-quantity-converter pipeline step', () => {
  it('converts a quantity to a table of unit conversions', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '1Gi' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { type: 'table'; value: { columns: readonly string[]; rows: readonly unknown[][] } }).value;
      expect(value.columns).toEqual(['unit', 'formatted']);
      expect(value.rows.some((row) => row[0] === 'Gi' && row[1] === '1Gi')).toBe(true);
    }
  });

  it('fails on a malformed quantity', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not-a-quantity' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'K8s Quantity Converter expects text input.', kind: 'invalid-input' } });
  });
});
