import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./ipv6-explorer.pipeline-step.js";

describe('ipv6-explorer pipeline step', () => {
  it('explores a valid IPv6 address', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '2001:0db8:0000:0000:0000:0000:0000:0001' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { type: 'text'; value: string }).value;
      expect(value).toContain('Compressed: 2001:db8::1');
      expect(value).toContain('Expanded:');
    }
  });

  it('reports an embedded IPv4 address when present', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '::ffff:192.168.1.1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { type: 'text'; value: string }).value).toContain('Embedded IPv4: 192.168.1.1');
    }
  });

  it('fails on an invalid address', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not-an-ipv6' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'IPv6 Explorer expects text input.', kind: 'invalid-input' } });
  });
});
