import { describe, expect, it } from 'vitest';
import { MAX_VERIFIER_LENGTH, MIN_VERIFIER_LENGTH } from "./pkce-generator-logic.js";
import { pipelineStep } from "./pkce-generator.pipeline-step.js";

describe('pkce-generator pipeline step', () => {
  it('ignores its input and generates a code_verifier', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.type).toBe('text');
      const value = (result.output as { value: string }).value;
      expect(value.length).toBeGreaterThanOrEqual(MIN_VERIFIER_LENGTH);
      expect(value.length).toBeLessThanOrEqual(MAX_VERIFIER_LENGTH);
    }
  });

  it('produces a verifier built only from RFC 7636 unreserved characters', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'ignored' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { value: string }).value).toMatch(/^[A-Za-z0-9\-._~]+$/);
    }
  });

  it('generates a different verifier on each run', async () => {
    const first = await pipelineStep.run({ type: 'json', value: {} });
    const second = await pipelineStep.run({ type: 'json', value: {} });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect((first.output as { value: string }).value).not.toBe((second.output as { value: string }).value);
    }
  });
});
