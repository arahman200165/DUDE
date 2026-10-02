import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./file-hash.pipeline-step.js";

describe('file-hash pipeline step', () => {
  it('computes the SHA-256 hex digest of a file value', async () => {
    // "hello" base64-encoded.
    const result = await pipelineStep.run({ type: 'file', value: { name: 'hello.txt', mimeType: 'text/plain', base64: 'aGVsbG8=' } });
    expect(result).toEqual({
      ok: true,
      output: { type: 'text', value: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824' },
    });
  });

  it('fails on invalid base64 file content', async () => {
    const result = await pipelineStep.run({ type: 'file', value: { name: 'x', mimeType: 'application/octet-stream', base64: 'not-base64!!' } });
    expect(result.ok).toBe(false);
  });

  it('rejects non-file input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'hello' });
    expect(result).toEqual({ ok: false, error: { message: 'File Hash Generator expects file input.', kind: 'invalid-input' } });
  });
});
