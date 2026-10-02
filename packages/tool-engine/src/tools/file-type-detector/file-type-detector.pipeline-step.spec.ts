import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./file-type-detector.pipeline-step.js";

function fileValue(bytes: number[], name: string, mimeType: string | null) {
  return { name, mimeType: mimeType ?? '', base64: btoa(String.fromCharCode(...bytes)) };
}

describe('file-type-detector pipeline step', () => {
  it('detects a PNG signature with no extension mismatch', async () => {
    const result = await pipelineStep.run({
      type: 'file',
      value: fileValue([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0], 'photo.png', 'image/png'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const report = result.output.value as { detected: { mime: string } | null; extensionMismatch: boolean };
    expect(report.detected?.mime).toBe('image/png');
    expect(report.extensionMismatch).toBe(false);
  });

  it('flags an extension mismatch', async () => {
    const result = await pipelineStep.run({ type: 'file', value: fileValue([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'photo.txt', null) });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect((result.output.value as { extensionMismatch: boolean }).extensionMismatch).toBe(true);
  });

  it('fails on file content that is not valid base64', async () => {
    const result = await pipelineStep.run({ type: 'file', value: { name: 'bad.bin', mimeType: '', base64: '!!!not-base64!!!' } });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not a file' });
    expect(result).toEqual({ ok: false, error: { message: 'File Signature & Type Detector expects file input.', kind: 'invalid-input' } });
  });
});
