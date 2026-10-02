import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./archive-tool.pipeline-step.js";

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

describe('archive-tool pipeline step', () => {
  it('wraps a single file into a ZIP archive', async () => {
    const content = new TextEncoder().encode('hello world');
    const result = await pipelineStep.run({ type: 'file', value: { name: 'hello.txt', mimeType: 'text/plain', base64: bytesToBase64(content) } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const file = result.output.value as { name: string; mimeType: string; base64: string };
    expect(file.name).toBe('archive.zip');
    expect(file.mimeType).toBe('application/zip');

    const zipBytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
    const entries = unzipSync(zipBytes);
    expect(Object.keys(entries)).toEqual(['hello.txt']);
    expect(new TextDecoder().decode(entries['hello.txt'])).toBe('hello world');
  });

  it('fails on file input that is not valid base64', async () => {
    const result = await pipelineStep.run({ type: 'file', value: { name: 'bad.bin', mimeType: 'application/octet-stream', base64: '!!!not-base64!!!' } });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not a file' });
    expect(result).toEqual({ ok: false, error: { message: 'Archive Creator / Extractor expects file input.', kind: 'invalid-input' } });
  });
});
