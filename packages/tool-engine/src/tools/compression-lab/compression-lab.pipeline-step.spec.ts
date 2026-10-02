import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./compression-lab.pipeline-step.js";

describe('compression-lab pipeline step', () => {
  it('gzip-compresses text input into a .gz file', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'hello world '.repeat(50) });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.output.type).toBe('file');
    const file = result.output.value as { name: string; mimeType: string; base64: string };
    expect(file.name).toBe('output.gz');
    expect(file.mimeType).toBe('application/gzip');
    expect(file.base64.length).toBeGreaterThan(0);
  });

  it('gzip-compresses file input, naming the output after the input file', async () => {
    const base64 = btoa('some file content '.repeat(20));
    const result = await pipelineStep.run({ type: 'file', value: { name: 'notes.txt', mimeType: 'text/plain', base64 } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect((result.output.value as { name: string }).name).toBe('notes.gz');
  });

  it('fails on file input that is not valid base64', async () => {
    const result = await pipelineStep.run({ type: 'file', value: { name: 'bad.bin', mimeType: 'application/octet-stream', base64: '!!!not-base64!!!' } });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Compression Lab expects text or file input.', kind: 'invalid-input' } });
  });
});
