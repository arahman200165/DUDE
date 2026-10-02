import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./nanoid-generator.pipeline-step.js";

describe('nanoid-generator pipeline step', () => {
  it('generates a 21-character NanoID, ignoring the input value', async () => {
    const result = await pipelineStep.run({ type: 'json', value: { count: 999, size: 3 } });
    expect(result.ok).toBe(true);
    expect(result.ok && result.output.type === 'text' && result.output.value).toHaveLength(21);
  });

  it('generates a NanoID for an empty JSON object', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result.ok).toBe(true);
    expect(result.ok && result.output.type === 'text' && result.output.value).toHaveLength(21);
  });

  it('rejects non-json input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: false, error: { message: 'NanoID Generator expects JSON input.', kind: 'invalid-input' } });
  });
});
