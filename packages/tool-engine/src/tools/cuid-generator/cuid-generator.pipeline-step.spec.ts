import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./cuid-generator.pipeline-step.js";
import { isValidCuid } from "./cuid-logic.js";

describe('cuid-generator pipeline step', () => {
  it('generates a valid CUID2, ignoring the input value', async () => {
    const result = await pipelineStep.run({ type: 'json', value: { count: 999 } });
    expect(result.ok).toBe(true);
    expect(result.ok && result.output.type === 'text' && isValidCuid(result.output.value)).toBe(true);
  });

  it('generates a CUID2 for an empty JSON object', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result.ok).toBe(true);
    expect(result.ok && result.output.type === 'text' && result.output.value).toHaveLength(24);
  });

  it('rejects non-json input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: false, error: { message: 'CUID Generator expects JSON input.', kind: 'invalid-input' } });
  });
});
