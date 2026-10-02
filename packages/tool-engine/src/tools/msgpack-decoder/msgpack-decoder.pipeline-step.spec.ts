import { describe, expect, it } from 'vitest';
import { encode } from '@msgpack/msgpack';
import { pipelineStep } from "./msgpack-decoder.pipeline-step.js";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe('msgpack-decoder pipeline step', () => {
  it('decodes a bytes value (base64) into json', async () => {
    const bytes = encode({ a: 1, b: 'hello' });
    const result = await pipelineStep.run({ type: 'bytes', value: bytesToBase64(bytes) });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: { a: 1, b: 'hello' } } });
  });

  it('decodes a file value into json', async () => {
    const bytes = encode([1, 2, 3]);
    const result = await pipelineStep.run({
      type: 'file',
      value: { name: 'data.msgpack', mimeType: 'application/octet-stream', base64: bytesToBase64(bytes) },
    });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: [1, 2, 3] } });
  });

  it('fails on an empty file', async () => {
    const result = await pipelineStep.run({ type: 'bytes', value: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'nope' });
    expect(result).toEqual({ ok: false, error: { message: 'MessagePack Decoder expects file or bytes input.', kind: 'invalid-input' } });
  });
});
