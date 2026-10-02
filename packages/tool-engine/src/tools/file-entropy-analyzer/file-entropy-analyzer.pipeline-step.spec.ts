import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./file-entropy-analyzer.pipeline-step.js";

function fileValue(bytes: Uint8Array) {
  return { name: 'sample.bin', mimeType: 'application/octet-stream', base64: btoa(String.fromCharCode(...bytes)) };
}

describe('file-entropy-analyzer pipeline step', () => {
  it('classifies a repetitive buffer as low entropy', async () => {
    const result = await pipelineStep.run({ type: 'file', value: fileValue(new Uint8Array(1024).fill(0)) });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect((result.output.value as { verdict: string }).verdict).toBe('low');
  });

  it('classifies a maximally varied buffer as high entropy', async () => {
    const bytes = new Uint8Array(4096);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    const result = await pipelineStep.run({ type: 'file', value: fileValue(bytes) });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect((result.output.value as { verdict: string }).verdict).toBe('high');
  });

  it('fails on file content that is not valid base64', async () => {
    const result = await pipelineStep.run({ type: 'file', value: { name: 'bad.bin', mimeType: '', base64: '!!!not-base64!!!' } });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not a file' });
    expect(result).toEqual({ ok: false, error: { message: 'File Entropy Analyzer expects file input.', kind: 'invalid-input' } });
  });
});
