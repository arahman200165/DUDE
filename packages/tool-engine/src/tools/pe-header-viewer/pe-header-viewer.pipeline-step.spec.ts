import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./pe-header-viewer.pipeline-step.js";

/** Builds a minimal, valid PE32+ (x64) executable with one ".text" section and no data directories -- mirrors `packages/tool-engine/src/shared/pe/pe-parser.spec.ts`'s builder. */
function buildMinimalPe(): Uint8Array {
  const bytes = new Uint8Array(240);
  const view = new DataView(bytes.buffer);

  view.setUint16(0, 0x5a4d, true);
  view.setUint32(0x3c, 64, true);
  view.setUint32(64, 0x00004550, true);

  const coff = 68;
  view.setUint16(coff + 0, 0x8664, true);
  view.setUint16(coff + 2, 1, true);
  view.setUint32(coff + 4, 1700000000, true);
  view.setUint16(coff + 16, 112, true);
  view.setUint16(coff + 18, 0x0102, true);

  const opt = coff + 20;
  view.setUint16(opt + 0, 0x20b, true);
  view.setUint32(opt + 16, 0x1000, true);
  view.setBigUint64(opt + 24, 0x140000000n, true);
  view.setUint32(opt + 56, 0x2000, true);
  view.setUint32(opt + 60, 0x400, true);
  view.setUint16(opt + 68, 3, true);
  view.setUint32(opt + 108, 0, true);

  const section = opt + 112;
  const name = '.text';
  for (let i = 0; i < name.length; i++) bytes[section + i] = name.charCodeAt(i);
  view.setUint32(section + 8, 0x500, true);
  view.setUint32(section + 12, 0x1000, true);
  view.setUint32(section + 16, 0x400, true);
  view.setUint32(section + 20, 0x400, true);
  view.setUint32(section + 36, 0x60000020, true);

  return bytes;
}

function fileValue(bytes: Uint8Array) {
  return { name: 'sample.exe', mimeType: 'application/x-msdownload', base64: btoa(String.fromCharCode(...bytes)) };
}

describe('pe-header-viewer pipeline step', () => {
  it('parses a minimal valid PE32+ executable into JSON', async () => {
    const result = await pipelineStep.run({ type: 'file', value: fileValue(buildMinimalPe()) });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const report = result.output.value as { machine: string; optionalHeaderMagic: string; numberOfSections: number };
    expect(report.machine).toBe('x64 (AMD64)');
    expect(report.optionalHeaderMagic).toBe('PE32+');
    expect(report.numberOfSections).toBe(1);
  });

  it('fails on a file with no DOS header signature', async () => {
    const result = await pipelineStep.run({ type: 'file', value: fileValue(new Uint8Array(64)) });
    expect(result.ok).toBe(false);
  });

  it('fails on file content that is not valid base64', async () => {
    const result = await pipelineStep.run({ type: 'file', value: { name: 'bad.bin', mimeType: '', base64: '!!!not-base64!!!' } });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not a file' });
    expect(result).toEqual({ ok: false, error: { message: 'PE Header Viewer expects file input.', kind: 'invalid-input' } });
  });
});
