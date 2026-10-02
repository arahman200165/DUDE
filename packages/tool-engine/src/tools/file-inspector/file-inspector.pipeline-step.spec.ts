import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./file-inspector.pipeline-step.js";

function fileValue(bytes: Uint8Array, name = 'sample.bin', mimeType: string | null = null) {
  return { name, mimeType: mimeType ?? '', base64: btoa(String.fromCharCode(...bytes)) };
}

describe('file-inspector pipeline step', () => {
  it('detects a PNG signature and reports entropy/strings', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new TextEncoder().encode('hello world')]);
    const result = await pipelineStep.run({ type: 'file', value: fileValue(bytes, 'photo.png', 'image/png') });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const report = result.output.value as { detectedSignature: { mime: string } | null; sampleStrings: string[] };
    expect(report.detectedSignature?.mime).toBe('image/png');
    expect(report.sampleStrings).toContain('hello world');
  });

  it('reports the file name and size', async () => {
    const result = await pipelineStep.run({ type: 'file', value: fileValue(new Uint8Array(10), 'notes.bin') });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const report = result.output.value as { fileName: string; fileSize: number };
    expect(report.fileName).toBe('notes.bin');
    expect(report.fileSize).toBe(10);
  });

  it('fails on file content that is not valid base64', async () => {
    const result = await pipelineStep.run({ type: 'file', value: { name: 'bad.bin', mimeType: '', base64: '!!!not-base64!!!' } });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not a file' });
    expect(result).toEqual({ ok: false, error: { message: 'File Inspector expects file input.', kind: 'invalid-input' } });
  });
});
