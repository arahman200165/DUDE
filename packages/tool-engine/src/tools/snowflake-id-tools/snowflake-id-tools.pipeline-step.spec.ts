import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./snowflake-id-tools.pipeline-step.js";

describe('snowflake-id-tools pipeline step', () => {
  it('generates a fresh decimal Snowflake id, ignoring the input value', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'this text is ignored' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.output.type === 'text' && /^\d+$/.test(result.output.value)).toBe(true);
  });

  it('generates a fresh Snowflake id for empty input too', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.output.type === 'text' && /^\d+$/.test(result.output.value)).toBe(true);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Snowflake ID Generator / Inspector expects text input.', kind: 'invalid-input' } });
  });
});
