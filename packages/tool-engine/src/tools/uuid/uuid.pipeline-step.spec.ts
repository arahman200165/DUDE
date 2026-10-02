import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./uuid.pipeline-step.js";

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('uuid pipeline step', () => {
  it('generates a fresh v4 UUID, ignoring the input value', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'this text is ignored' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.output.type === 'text' && UUID_V4_RE.test(result.output.value)).toBe(true);
  });

  it('generates a fresh v4 UUID for empty input too', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.output.type === 'text' && UUID_V4_RE.test(result.output.value)).toBe(true);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'UUID Generator / Inspector expects text input.', kind: 'invalid-input' } });
  });
});
