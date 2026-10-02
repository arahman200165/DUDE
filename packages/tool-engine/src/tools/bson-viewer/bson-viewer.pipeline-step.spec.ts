import { describe, expect, it } from 'vitest';
import { serialize } from 'bson';
import { pipelineStep } from "./bson-viewer.pipeline-step.js";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe('bson-viewer pipeline step', () => {
  it('decodes a bytes value (base64) into json', async () => {
    const bytes = serialize({ a: 1, b: 'hello' });
    const result = await pipelineStep.run({ type: 'bytes', value: bytesToBase64(bytes) });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: { a: 1, b: 'hello' } } });
  });

  it('decodes a file value into json, extended-JSON-serializing BSON-specific types', async () => {
    const bytes = serialize({ list: [{ x: 1 }, { x: 2 }] });
    const result = await pipelineStep.run({
      type: 'file',
      value: { name: 'data.bson', mimeType: 'application/octet-stream', base64: bytesToBase64(bytes) },
    });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: { list: [{ x: 1 }, { x: 2 }] } } });
  });

  it('fails on an empty file', async () => {
    const result = await pipelineStep.run({ type: 'bytes', value: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'nope' });
    expect(result).toEqual({ ok: false, error: { message: 'BSON Viewer expects file or bytes input.', kind: 'invalid-input' } });
  });
});
