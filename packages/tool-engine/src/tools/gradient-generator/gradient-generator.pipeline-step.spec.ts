import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./gradient-generator.pipeline-step.js";

describe('gradient-generator pipeline step', () => {
  it('ignores its input and builds the default linear gradient', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'ignored' });
    expect(result).toEqual({
      ok: true,
      output: { type: 'text', value: 'linear-gradient(90deg, #3b82f6 0%, #a855f7 100%)' },
    });
  });

  it('produces the same output regardless of input value', async () => {
    const a = await pipelineStep.run({ type: 'text', value: 'foo' });
    const b = await pipelineStep.run({ type: 'text', value: 'bar' });
    expect(a).toEqual(b);
  });

  it('produces a css linear-gradient() function', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { value: string }).value).toMatch(/^linear-gradient\(/);
    }
  });
});
