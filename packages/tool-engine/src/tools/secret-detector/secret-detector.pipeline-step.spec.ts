import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./secret-detector.pipeline-step.js";

describe('secret-detector pipeline step', () => {
  it('flags a known credential pattern', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'key = AKIAABCDEFGHIJKLMNOP' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { type: 'json'; value: { findings: readonly { kind: string; match: string }[] } }).value;
      expect(value.findings).toEqual([{ kind: 'AWS Access Key ID', match: 'AKIAABCDEFGHIJKLMNOP', index: 6 }]);
    }
  });

  it('reports no findings for plain text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'just some plain text' });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: { findings: [] } } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Secret Detector expects text input.', kind: 'invalid-input' } });
  });
});
