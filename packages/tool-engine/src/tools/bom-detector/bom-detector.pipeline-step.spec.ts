import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./bom-detector.pipeline-step.js";

function fileValue(bytes: Uint8Array, name = 'sample.txt') {
  return { name, mimeType: 'text/plain', base64: btoa(String.fromCharCode(...bytes)) };
}

describe('bom-detector pipeline step', () => {
  it('detects a UTF-8 BOM', async () => {
    const result = await pipelineStep.run({ type: 'file', value: fileValue(new Uint8Array([0xef, 0xbb, 0xbf, 0x68])) });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.output).toEqual({ type: 'json', value: { fileName: 'sample.txt', byteLength: 4, bom: { encoding: 'utf-8', length: 3 } } });
  });

  it('reports no BOM for plain content', async () => {
    const result = await pipelineStep.run({ type: 'file', value: fileValue(new TextEncoder().encode('hello')) });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect((result.output.value as { bom: unknown }).bom).toBeNull();
  });

  it('fails on file content that is not valid base64', async () => {
    const result = await pipelineStep.run({ type: 'file', value: { name: 'bad.bin', mimeType: '', base64: '!!!not-base64!!!' } });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not a file' });
    expect(result).toEqual({ ok: false, error: { message: 'BOM Detector / Remover expects file input.', kind: 'invalid-input' } });
  });
});
