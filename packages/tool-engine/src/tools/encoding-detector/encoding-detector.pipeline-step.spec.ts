import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./encoding-detector.pipeline-step.js";

function fileValue(bytes: Uint8Array, name = 'sample.txt') {
  return { name, mimeType: 'text/plain', base64: btoa(String.fromCharCode(...bytes)) };
}

describe('encoding-detector pipeline step', () => {
  it('detects a UTF-8 BOM with high confidence', async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]);
    const result = await pipelineStep.run({ type: 'file', value: fileValue(bytes) });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const report = result.output.value as { guess: string; confidence: string };
    expect(report.guess).toBe('utf-8 (with BOM)');
    expect(report.confidence).toBe('high');
  });

  it('detects plain ASCII with high confidence', async () => {
    const result = await pipelineStep.run({ type: 'file', value: fileValue(new TextEncoder().encode('hello')) });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect((result.output.value as { guess: string }).guess).toBe('ascii');
  });

  it('fails on file content that is not valid base64', async () => {
    const result = await pipelineStep.run({ type: 'file', value: { name: 'bad.bin', mimeType: '', base64: '!!!not-base64!!!' } });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not a file' });
    expect(result).toEqual({ ok: false, error: { message: 'Encoding Detector expects file input.', kind: 'invalid-input' } });
  });
});
