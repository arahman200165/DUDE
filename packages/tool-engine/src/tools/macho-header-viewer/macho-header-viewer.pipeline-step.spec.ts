import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./macho-header-viewer.pipeline-step.js";

function writeCString(bytes: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  bytes[offset + text.length] = 0;
}

/** Builds a minimal little-endian 64-bit thin Mach-O with one LC_LOAD_DYLIB command -- mirrors `macho-header-viewer-logic.spec.ts`'s builder. */
function buildMinimalThinMachO(): Uint8Array {
  const dylibName = 'libSystem.B.dylib';
  const cmdStart = 32;
  const nameOffsetInCmd = 24;
  const cmdsize = nameOffsetInCmd + dylibName.length + 1;
  const bytes = new Uint8Array(cmdStart + cmdsize);
  const view = new DataView(bytes.buffer);

  bytes.set([0xcf, 0xfa, 0xed, 0xfe], 0);
  view.setInt32(4, 0x01000007, true);
  view.setInt32(8, 3, true);
  view.setUint32(12, 2, true);
  view.setUint32(16, 1, true);
  view.setUint32(20, cmdsize, true);
  view.setUint32(24, 0, true);
  view.setUint32(28, 0, true);

  view.setUint32(cmdStart + 0, 0xc, true);
  view.setUint32(cmdStart + 4, cmdsize, true);
  view.setUint32(cmdStart + 8, nameOffsetInCmd, true);
  view.setUint32(cmdStart + 12, 0, true);
  view.setUint32(cmdStart + 16, (1 << 16) | (2 << 8) | 3, true);
  view.setUint32(cmdStart + 20, (1 << 16) | (0 << 8) | 0, true);
  writeCString(bytes, cmdStart + nameOffsetInCmd, dylibName);

  return bytes;
}

function fileValue(bytes: Uint8Array) {
  return { name: 'sample', mimeType: 'application/x-mach-binary', base64: btoa(String.fromCharCode(...bytes)) };
}

describe('macho-header-viewer pipeline step', () => {
  it('parses a minimal thin 64-bit little-endian Mach-O into JSON', async () => {
    const result = await pipelineStep.run({ type: 'file', value: fileValue(buildMinimalThinMachO()) });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const report = result.output.value as { bitness: string; cpuType: string; fileType: string };
    expect(report.bitness).toBe('64-bit');
    expect(report.cpuType).toBe('x86-64');
    expect(report.fileType).toBe('MH_EXECUTE (executable)');
  });

  it('extracts the LC_LOAD_DYLIB command and its dylib name', async () => {
    const result = await pipelineStep.run({ type: 'file', value: fileValue(buildMinimalThinMachO()) });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const report = result.output.value as { dylibs: readonly { name: string }[] };
    expect(report.dylibs).toEqual([{ name: 'libSystem.B.dylib', currentVersion: '1.2.3', compatibilityVersion: '1.0.0' }]);
  });

  it('fails on a file with no recognizable magic number', async () => {
    const result = await pipelineStep.run({ type: 'file', value: fileValue(new Uint8Array(8)) });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not a file' });
    expect(result).toEqual({ ok: false, error: { message: 'Mach-O Header Viewer expects file input.', kind: 'invalid-input' } });
  });
});
