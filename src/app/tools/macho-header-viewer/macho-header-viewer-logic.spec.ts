import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MachOReport, parseMachOHeaders } from './macho-header-viewer-logic';

function writeCString(bytes: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  bytes[offset + text.length] = 0;
}

/** Builds a minimal little-endian 64-bit thin Mach-O with one LC_LOAD_DYLIB command. */
function buildMinimalThinMachO(): Uint8Array {
  const dylibName = 'libSystem.B.dylib';
  const cmdStart = 32;
  const nameOffsetInCmd = 24;
  const cmdsize = nameOffsetInCmd + dylibName.length + 1;
  const bytes = new Uint8Array(cmdStart + cmdsize);
  const view = new DataView(bytes.buffer);

  bytes.set([0xcf, 0xfa, 0xed, 0xfe], 0); // 64-bit LE magic
  view.setInt32(4, 0x01000007, true); // cputype: x86-64
  view.setInt32(8, 3, true); // cpusubtype
  view.setUint32(12, 2, true); // filetype: MH_EXECUTE
  view.setUint32(16, 1, true); // ncmds
  view.setUint32(20, cmdsize, true); // sizeofcmds
  view.setUint32(24, 0, true); // flags
  view.setUint32(28, 0, true); // reserved

  view.setUint32(cmdStart + 0, 0xc, true); // cmd: LC_LOAD_DYLIB
  view.setUint32(cmdStart + 4, cmdsize, true); // cmdsize
  view.setUint32(cmdStart + 8, nameOffsetInCmd, true); // dylib.name offset (relative to command start)
  view.setUint32(cmdStart + 12, 0, true); // timestamp
  view.setUint32(cmdStart + 16, (1 << 16) | (2 << 8) | 3, true); // current_version: 1.2.3
  view.setUint32(cmdStart + 20, (1 << 16) | (0 << 8) | 0, true); // compatibility_version: 1.0.0
  writeCString(bytes, cmdStart + nameOffsetInCmd, dylibName);

  return bytes;
}

function wrapInFatBinary(thin: Uint8Array): Uint8Array {
  const sliceOffset = 28; // fat_header (8) + one fat_arch entry (20)
  const bytes = new Uint8Array(sliceOffset + thin.length);
  const view = new DataView(bytes.buffer);

  bytes.set([0xca, 0xfe, 0xba, 0xbe], 0); // FAT_MAGIC
  view.setUint32(4, 1, false); // nfat_arch (big-endian)

  view.setInt32(8, 0x01000007, false); // cputype
  view.setInt32(12, 3, false); // cpusubtype
  view.setUint32(16, sliceOffset, false); // offset
  view.setUint32(20, thin.length, false); // size
  view.setUint32(24, 0, false); // align

  bytes.set(thin, sliceOffset);
  return bytes;
}

describe('parseMachOHeaders', () => {
  it('parses a minimal thin 64-bit little-endian Mach-O', () => {
    const report = parseMachOHeaders(buildMinimalThinMachO()) as MachOReport;
    expect(report.isMachO).toBe(true);
    expect(report.isFat).toBe(false);
    expect(report.bitness).toBe('64-bit');
    expect(report.endianness).toBe('little-endian');
    expect(report.cpuType).toBe('x86-64');
    expect(report.fileType).toBe('MH_EXECUTE (executable)');
  });

  it('extracts the LC_LOAD_DYLIB command and its dylib name/versions', () => {
    const report = parseMachOHeaders(buildMinimalThinMachO()) as MachOReport;
    expect(report.loadCommands).toEqual([{ cmd: 'LC_LOAD_DYLIB', cmdsize: expect.any(Number) }]);
    expect(report.dylibs).toEqual([{ name: 'libSystem.B.dylib', currentVersion: '1.2.3', compatibilityVersion: '1.0.0' }]);
  });

  it('parses a fat binary, listing architecture slices and the first slice\'s header', () => {
    const report = parseMachOHeaders(wrapInFatBinary(buildMinimalThinMachO())) as MachOReport;
    expect(report.isMachO).toBe(true);
    expect(report.isFat).toBe(true);
    expect(report.architectures).toEqual([expect.objectContaining({ cpuType: 'x86-64' })]);
    expect(report.dylibs).toEqual([expect.objectContaining({ name: 'libSystem.B.dylib' })]);
  });

  it('rejects a file with no recognizable magic number', () => {
    expect(parseMachOHeaders(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0])).isMachO).toBe(false);
  });

  it('rejects a file too small to hold any magic number', () => {
    expect(parseMachOHeaders(new Uint8Array(2)).isMachO).toBe(false);
  });
});

describe('golden corpus (DUDE_PRD.md §21 Phase 23 Item 6)', () => {
  // Real ARM64 Mach-O (.NET's apphost launcher stub, cross-compiled from Windows), cross-checked
  // against Python's `lief` rather than DUDE's own parser -- see __fixtures__/README.md for
  // provenance and exact values.
  it('parses a real .NET apphost executable', () => {
    const bytes = readFileSync(
      resolve(process.cwd(), 'src/app/tools/macho-header-viewer/__fixtures__/dotnet-apphost.macho'),
    );
    const report = parseMachOHeaders(new Uint8Array(bytes)) as MachOReport;

    expect(report.isMachO).toBe(true);
    expect(report.isFat).toBe(false);
    expect(report.bitness).toBe('64-bit');
    expect(report.endianness).toBe('little-endian');
    expect(report.cpuType).toBe('ARM64');
    expect(report.fileType).toBe('MH_EXECUTE (executable)');
    expect(report.loadCommands).toHaveLength(19);
    expect(report.dylibs).toEqual([
      { name: '/usr/lib/libSystem.B.dylib', currentVersion: '1351.0.0', compatibilityVersion: '1.0.0' },
      { name: '/usr/lib/libc++.1.dylib', currentVersion: '1900.180.0', compatibilityVersion: '1.0.0' },
    ]);
  });
});
