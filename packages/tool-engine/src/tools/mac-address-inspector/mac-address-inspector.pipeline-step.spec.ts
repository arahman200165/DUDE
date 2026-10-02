import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./mac-address-inspector.pipeline-step.js";

describe('mac-address-inspector pipeline step', () => {
  it('inspects a valid MAC address and looks up its vendor', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '00:1B:63:AA:BB:CC' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { type: 'text'; value: string }).value;
      expect(value).toContain('Colon: 00:1B:63:AA:BB:CC');
      expect(value).toContain('Vendor: Apple');
    }
  });

  it('normalizes a hyphen-separated address with no known vendor', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '01-02-03-04-05-06' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { type: 'text'; value: string }).value;
      expect(value).toContain('Colon: 01:02:03:04:05:06');
      expect(value).not.toContain('Vendor:');
    }
  });

  it('fails on an invalid MAC address', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not-a-mac' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'MAC Address Inspector expects text input.', kind: 'invalid-input' } });
  });
});
