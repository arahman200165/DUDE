import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./binary-structure-inspector.pipeline-step.js";

function fileValue(bytes: Uint8Array) {
  return { name: 'sample.bin', mimeType: 'application/octet-stream', base64: btoa(String.fromCharCode(...bytes)) };
}

describe('binary-structure-inspector pipeline step', () => {
  it('parses a little-endian uint32 magic followed by a uint16 version', async () => {
    const bytes = new Uint8Array([0x78, 0x56, 0x34, 0x12, 0x02, 0x00]);
    const result = await pipelineStep.run({ type: 'file', value: fileValue(bytes) });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const table = result.output.value as { columns: readonly string[]; rows: readonly (readonly unknown[])[] };
    expect(table.columns).toEqual(['name', 'type', 'offset', 'size', 'value']);
    expect(table.rows).toEqual([
      ['magic', 'uint32', 0, 4, '305419896'],
      ['version', 'uint16', 4, 2, '2'],
    ]);
  });

  it('fails when the file is too short for the default field layout', async () => {
    const result = await pipelineStep.run({ type: 'file', value: fileValue(new Uint8Array([0x01, 0x02])) });
    expect(result.ok).toBe(false);
  });

  it('fails on file content that is not valid base64', async () => {
    const result = await pipelineStep.run({ type: 'file', value: { name: 'bad.bin', mimeType: '', base64: '!!!not-base64!!!' } });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not a file' });
    expect(result).toEqual({ ok: false, error: { message: 'Binary Structure Inspector expects file input.', kind: 'invalid-input' } });
  });
});
