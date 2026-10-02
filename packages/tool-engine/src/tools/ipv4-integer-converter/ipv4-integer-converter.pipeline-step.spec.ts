import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./ipv4-integer-converter.pipeline-step.js";

describe('ipv4-integer-converter pipeline step', () => {
  it('converts an IPv4 address to its integer form', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '192.168.1.1' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: '3232235777' } });
  });

  it('fails on an invalid address', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not-an-ip' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'IPv4 ↔ Integer Converter expects text input.', kind: 'invalid-input' } });
  });
});
