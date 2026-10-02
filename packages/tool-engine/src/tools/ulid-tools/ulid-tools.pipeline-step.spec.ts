import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./ulid-tools.pipeline-step.js";

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

describe('ulid-tools pipeline step', () => {
  it('generates a fresh ULID, ignoring the input value', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'this text is ignored' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.output.type === 'text' && ULID_RE.test(result.output.value)).toBe(true);
  });

  it('generates a fresh ULID for empty input too', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.output.type === 'text' && ULID_RE.test(result.output.value)).toBe(true);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'ULID Generator / Inspector expects text input.', kind: 'invalid-input' } });
  });
});
