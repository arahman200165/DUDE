import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./binary-strings-extractor.pipeline-step.js";

function fileValue(bytes: Uint8Array) {
  return { name: 'sample.bin', mimeType: 'application/octet-stream', base64: btoa(String.fromCharCode(...bytes)) };
}

describe('binary-strings-extractor pipeline step', () => {
  it('extracts ASCII strings into a table', async () => {
    const bytes = new TextEncoder().encode('\u0000hello\u0000');
    const result = await pipelineStep.run({ type: 'file', value: fileValue(bytes) });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.output.type).toBe('table');
    const table = result.output.value as { columns: readonly string[]; rows: readonly (readonly unknown[])[] };
    expect(table.columns).toEqual(['offset', 'text', 'encoding']);
    expect(table.rows).toEqual([[1, 'hello', 'ascii']]);
  });

  it('returns an empty table when nothing qualifies', async () => {
    const result = await pipelineStep.run({ type: 'file', value: fileValue(new Uint8Array([0, 0, 0])) });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect((result.output.value as { rows: unknown[] }).rows).toEqual([]);
  });

  it('fails on file content that is not valid base64', async () => {
    const result = await pipelineStep.run({ type: 'file', value: { name: 'bad.bin', mimeType: '', base64: '!!!not-base64!!!' } });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not a file' });
    expect(result).toEqual({ ok: false, error: { message: 'Binary Strings Extractor expects file input.', kind: 'invalid-input' } });
  });
});
