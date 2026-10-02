import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./cidr-calculator.pipeline-step.js";

describe('cidr-calculator pipeline step', () => {
  it('computes network details for a CIDR block', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '192.168.1.10/24' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { type: 'text'; value: string }).value;
      expect(value).toContain('Network: 192.168.1.0/24');
      expect(value).toContain('Broadcast: 192.168.1.255');
      expect(value).toContain('Usable hosts: 254');
    }
  });

  it('fails on an invalid CIDR block', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not-a-cidr' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'CIDR Calculator expects text input.', kind: 'invalid-input' } });
  });
});
