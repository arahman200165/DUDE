import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./csr-generator-inspector.pipeline-step.js";

describe('csr-generator-inspector pipeline step', () => {
  it('generates a signed CSR PEM for a fixed placeholder subject, ignoring the input value', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'ignored' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.output.type).toBe('text');
    expect(result.output.value as string).toMatch(/-----BEGIN CERTIFICATE REQUEST-----/);
  }, 15000);

  it('generates a different CSR on each call (fresh key pair each time)', async () => {
    const first = await pipelineStep.run({ type: 'text', value: '' });
    const second = await pipelineStep.run({ type: 'text', value: '' });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error('expected ok');
    expect(first.output.value).not.toBe(second.output.value);
  }, 15000);
});
