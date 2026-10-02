import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./byte-frequency-analyzer.pipeline-step.js";

function fileValue(bytes: Uint8Array) {
  return { name: 'sample.bin', mimeType: 'application/octet-stream', base64: btoa(String.fromCharCode(...bytes)) };
}

describe('byte-frequency-analyzer pipeline step', () => {
  it('identifies the most frequent byte and its count', async () => {
    const result = await pipelineStep.run({ type: 'file', value: fileValue(new Uint8Array([0x41, 0x41, 0x41, 0x42])) });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const report = result.output.value as { mostFrequentByte: number; maxCount: number };
    expect(report.mostFrequentByte).toBe(0x41);
    expect(report.maxCount).toBe(3);
  });

  it('reports a 256-entry histogram', async () => {
    const result = await pipelineStep.run({ type: 'file', value: fileValue(new Uint8Array([0x00, 0x01])) });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect((result.output.value as { histogram: unknown[] }).histogram).toHaveLength(256);
  });

  it('fails on file content that is not valid base64', async () => {
    const result = await pipelineStep.run({ type: 'file', value: { name: 'bad.bin', mimeType: '', base64: '!!!not-base64!!!' } });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not a file' });
    expect(result).toEqual({ ok: false, error: { message: 'Byte Frequency Analyzer expects file input.', kind: 'invalid-input' } });
  });
});
