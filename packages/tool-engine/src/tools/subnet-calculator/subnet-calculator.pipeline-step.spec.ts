import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./subnet-calculator.pipeline-step.js";

describe('subnet-calculator pipeline step', () => {
  it('splits a base network into 4 equal subnets', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '192.168.1.0/24' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { type: 'table'; value: { columns: readonly string[]; rows: readonly unknown[][] } }).value;
      expect(value.columns).toEqual(['network', 'broadcast', 'usableRange', 'usableHosts']);
      expect(value.rows).toHaveLength(4);
      expect(value.rows[0][0]).toBe('192.168.1.0/26');
    }
  });

  it('fails on an invalid base network', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not-a-network' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Subnet Calculator expects text input.', kind: 'invalid-input' } });
  });
});
