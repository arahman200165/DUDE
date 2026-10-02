import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./hex-dump.pipeline-step.js";

describe('hex-dump pipeline step', () => {
  it('renders a bytes value as a hex dump', async () => {
    const base64 = btoa('hi');
    const result = await pipelineStep.run({ type: 'bytes', value: base64 });
    expect(result).toEqual({
      ok: true,
      output: { type: 'text', value: '00000000  68 69                                             |hi|\n00000002' },
    });
  });

  it('renders a file value as a hex dump', async () => {
    const base64 = btoa('hi');
    const result = await pipelineStep.run({ type: 'file', value: { name: 'a.bin', mimeType: 'application/octet-stream', base64 } });
    expect(result.ok).toBe(true);
  });

  it('fails on invalid Base64', async () => {
    const result = await pipelineStep.run({ type: 'bytes', value: 'not-base64!!' });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'nope' });
    expect(result).toEqual({ ok: false, error: { message: 'Hex Dump Viewer / Builder expects file or bytes input.', kind: 'invalid-input' } });
  });
});
