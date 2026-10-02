import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./ip-address-inspector.pipeline-step.js";

describe('ip-address-inspector pipeline step', () => {
  it('inspects a valid IPv4 address', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '192.168.1.1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { type: 'text'; value: string }).value;
      expect(value).toContain('Version: IPv4');
      expect(value).toContain('Classification: Private');
    }
  });

  it('inspects a valid IPv6 address', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '::1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { type: 'text'; value: string }).value).toContain('Version: IPv6');
    }
  });

  it('fails on an invalid address', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not-an-ip' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'IP Address Inspector expects text input.', kind: 'invalid-input' } });
  });
});
