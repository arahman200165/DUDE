import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./hash.pipeline-step.js";

describe('hash pipeline step', () => {
  it('computes the SHA-256 digest of text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'hello' });
    expect(result).toEqual({
      ok: true,
      output: { type: 'text', value: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824' },
    });
  });

  it('computes the SHA-256 digest of an empty string', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({
      ok: true,
      output: { type: 'text', value: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
    });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Hash Generator expects text input.', kind: 'invalid-input' } });
  });
});
