import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./elf-header-viewer.pipeline-step.js";

function writeCString(bytes: Uint8Array, offset: number, text: string): number {
  for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  bytes[offset + text.length] = 0;
  return offset + text.length + 1;
}

/** Builds a minimal, valid little-endian ELF64 executable -- mirrors `elf-header-viewer-logic.spec.ts`'s builder. */
function buildMinimalElf(): Uint8Array {
  const phoff = 64;
  const phSize = 56;
  const dynstrOffset = phoff + phSize;
  const dynstr = new Uint8Array(16);
  dynstr[0] = 0;
  writeCString(dynstr, 1, 'foo');

  const dynsymOffset = dynstrOffset + dynstr.length;
  const symEntrySize = 24;
  const dynsymLength = symEntrySize * 2;

  const shstrtabOffset = dynsymOffset + dynsymLength;
  const shstrtab = new Uint8Array(32);
  let cursor = 1;
  const dynsymNameOffset = cursor;
  cursor = writeCString(shstrtab, cursor, '.dynsym');
  const dynstrNameOffset = cursor;
  cursor = writeCString(shstrtab, cursor, '.dynstr');
  const shstrtabNameOffset = cursor;
  cursor = writeCString(shstrtab, cursor, '.shstrtab');
  const shstrtabLength = cursor;

  const shoff = shstrtabOffset + shstrtabLength;
  const sectionCount = 4;
  const shEntrySize = 64;

  const totalLength = shoff + sectionCount * shEntrySize;
  const bytes = new Uint8Array(totalLength);
  bytes.set(dynstr, dynstrOffset);
  bytes.set(shstrtab.subarray(0, shstrtabLength), shstrtabOffset);

  const view = new DataView(bytes.buffer);

  bytes.set([0x7f, 0x45, 0x4c, 0x46], 0);
  bytes[4] = 2;
  bytes[5] = 1;
  bytes[6] = 1;

  view.setUint16(16, 2, true);
  view.setUint16(18, 62, true);
  view.setUint32(20, 1, true);
  view.setBigUint64(24, 0x401000n, true);
  view.setBigUint64(32, BigInt(phoff), true);
  view.setBigUint64(40, BigInt(shoff), true);
  view.setUint32(48, 0, true);
  view.setUint16(52, 64, true);
  view.setUint16(54, phSize, true);
  view.setUint16(56, 1, true);
  view.setUint16(58, shEntrySize, true);
  view.setUint16(60, sectionCount, true);
  view.setUint16(62, 3, true);

  view.setUint32(phoff + 0, 1, true);
  view.setUint32(phoff + 4, 5, true);
  view.setBigUint64(phoff + 8, 0n, true);
  view.setBigUint64(phoff + 16, 0x400000n, true);
  view.setBigUint64(phoff + 24, 0x400000n, true);
  view.setBigUint64(phoff + 32, 0x1000n, true);
  view.setBigUint64(phoff + 40, 0x1000n, true);

  const sym1 = dynsymOffset + symEntrySize;
  view.setUint32(sym1 + 0, 1, true);
  view.setUint16(sym1 + 6, 1, true);
  view.setBigUint64(sym1 + 8, 0x401000n, true);
  view.setBigUint64(sym1 + 16, 16n, true);

  function writeSectionHeader(index: number, nameOffset: number, type: number, offset: number, size: number, link: number, entsize: number): void {
    const base = shoff + index * shEntrySize;
    view.setUint32(base + 0, nameOffset, true);
    view.setUint32(base + 4, type, true);
    view.setBigUint64(base + 24, BigInt(offset), true);
    view.setBigUint64(base + 32, BigInt(size), true);
    view.setUint32(base + 40, link, true);
    view.setBigUint64(base + 56, BigInt(entsize), true);
  }

  writeSectionHeader(0, 0, 0, 0, 0, 0, 0);
  writeSectionHeader(1, dynsymNameOffset, 11, dynsymOffset, dynsymLength, 2, symEntrySize);
  writeSectionHeader(2, dynstrNameOffset, 3, dynstrOffset, dynstr.length, 0, 0);
  writeSectionHeader(3, shstrtabNameOffset, 3, shstrtabOffset, shstrtabLength, 0, 0);

  return bytes;
}

function fileValue(bytes: Uint8Array) {
  return { name: 'sample.elf', mimeType: 'application/x-elf', base64: btoa(String.fromCharCode(...bytes)) };
}

describe('elf-header-viewer pipeline step', () => {
  it('parses a minimal valid little-endian ELF64 executable into JSON', async () => {
    const result = await pipelineStep.run({ type: 'file', value: fileValue(buildMinimalElf()) });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const report = result.output.value as { bitness: string; endianness: string; machine: string };
    expect(report.bitness).toBe('64-bit');
    expect(report.endianness).toBe('little-endian');
    expect(report.machine).toBe('x86-64');
  });

  it('fails on a file with no ELF magic bytes', async () => {
    const result = await pipelineStep.run({ type: 'file', value: fileValue(new Uint8Array(64)) });
    expect(result.ok).toBe(false);
  });

  it('fails on file content that is not valid base64', async () => {
    const result = await pipelineStep.run({ type: 'file', value: { name: 'bad.bin', mimeType: '', base64: '!!!not-base64!!!' } });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not a file' });
    expect(result).toEqual({ ok: false, error: { message: 'ELF Header Viewer expects file input.', kind: 'invalid-input' } });
  });
});
