import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./ksuid-tools.pipeline-step.js";

const KSUID_RE = /^[0-9A-Za-z]{27}$/;

describe('ksuid-tools pipeline step', () => {
  it('generates a fresh KSUID, ignoring the input value', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'this text is ignored' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.output.type === 'text' && KSUID_RE.test(result.output.value)).toBe(true);
  });

  it('generates a fresh KSUID for empty input too', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.output.type === 'text' && KSUID_RE.test(result.output.value)).toBe(true);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'KSUID Generator / Inspector expects text input.', kind: 'invalid-input' } });
  });
});
