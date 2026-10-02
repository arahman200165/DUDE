import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./password-generator.pipeline-step.js";

describe('password-generator pipeline step', () => {
  it('generates a 20-character password, ignoring the input value', async () => {
    const result = await pipelineStep.run({ type: 'json', value: { anything: true } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.output.type).toBe('text');
    expect((result.output.value as string).length).toBe(20);
  });

  it('generates a different password on each call (CSPRNG, not deterministic)', async () => {
    const first = await pipelineStep.run({ type: 'json', value: null });
    const second = await pipelineStep.run({ type: 'json', value: null });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error('expected ok');
    expect(first.output.value).not.toBe(second.output.value);
  });
});
