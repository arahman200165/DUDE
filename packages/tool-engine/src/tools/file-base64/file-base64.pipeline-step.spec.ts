import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./file-base64.pipeline-step.js";

describe('file-base64 pipeline step', () => {
  it('re-exposes a file value\'s embedded base64 as text', async () => {
    const result = await pipelineStep.run({
      type: 'file',
      value: { name: 'hello.txt', mimeType: 'text/plain', base64: 'aGVsbG8=' },
    });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'aGVsbG8=' } });
  });

  it('decodes base64 text into a file value, sniffing the MIME type', async () => {
    // A minimal PNG signature (8 bytes) base64-encoded.
    const pngBytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const pngBase64 = btoa(String.fromCharCode(...pngBytes));
    const result = await pipelineStep.run({ type: 'text', value: pngBase64 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.output).toEqual({ type: 'file', value: { name: 'decoded.png', mimeType: 'image/png', base64: pngBase64 } });
  });

  it('fails on invalid base64 text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not-base64!!' });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({
      ok: false,
      error: { message: 'File Base64 Converter expects file or text input.', kind: 'invalid-input' },
    });
  });
});
