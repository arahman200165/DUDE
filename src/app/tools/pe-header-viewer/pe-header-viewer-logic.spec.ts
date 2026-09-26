import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parsePeHeaders, PeReport } from './pe-header-viewer-logic';

/** Builds a minimal, valid PE32+ (x64) executable with one ".text" section and no data directories. */
function buildMinimalPe(): Uint8Array {
  const bytes = new Uint8Array(240);
  const view = new DataView(bytes.buffer);

  // DOS header
  view.setUint16(0, 0x5a4d, true); // 'MZ'
  view.setUint32(0x3c, 64, true); // e_lfanew -> PE header immediately follows a stub-free DOS header

  // PE signature
  view.setUint32(64, 0x00004550, true);

  // COFF header (20 bytes) at 68
  const coff = 68;
  view.setUint16(coff + 0, 0x8664, true); // Machine: x64
  view.setUint16(coff + 2, 1, true); // NumberOfSections
  view.setUint32(coff + 4, 1700000000, true); // TimeDateStamp
  view.setUint16(coff + 16, 112, true); // SizeOfOptionalHeader
  view.setUint16(coff + 18, 0x0102, true); // Characteristics

  // Optional header (PE32+, 112 bytes, no data directories) at 88
  const opt = coff + 20;
  view.setUint16(opt + 0, 0x20b, true); // Magic: PE32+
  view.setUint32(opt + 16, 0x1000, true); // AddressOfEntryPoint
  view.setBigUint64(opt + 24, 0x140000000n, true); // ImageBase
  view.setUint32(opt + 56, 0x2000, true); // SizeOfImage
  view.setUint32(opt + 60, 0x400, true); // SizeOfHeaders
  view.setUint16(opt + 68, 3, true); // Subsystem: Windows CUI
  view.setUint32(opt + 108, 0, true); // NumberOfRvaAndSizes

  // Section table (1 entry, 40 bytes) at 200
  const section = opt + 112;
  const name = '.text';
  for (let i = 0; i < name.length; i++) bytes[section + i] = name.charCodeAt(i);
  view.setUint32(section + 8, 0x500, true); // VirtualSize
  view.setUint32(section + 12, 0x1000, true); // VirtualAddress
  view.setUint32(section + 16, 0x400, true); // SizeOfRawData
  view.setUint32(section + 20, 0x400, true); // PointerToRawData
  view.setUint32(section + 36, 0x60000020, true); // Characteristics

  return bytes;
}

describe('parsePeHeaders', () => {
  it('parses a minimal valid PE32+ executable', () => {
    const report = parsePeHeaders(buildMinimalPe()) as PeReport;
    expect(report.isPe).toBe(true);
    expect(report.machine).toBe('x64 (AMD64)');
    expect(report.numberOfSections).toBe(1);
    expect(report.optionalHeaderMagic).toBe('PE32+');
    expect(report.addressOfEntryPoint).toBe(0x1000);
    expect(report.imageBase).toBe('0x140000000');
    expect(report.subsystem).toBe('Windows CUI');
    expect(report.sizeOfImage).toBe(0x2000);
    expect(report.sections).toEqual([
      expect.objectContaining({ name: '.text', virtualAddress: 0x1000, sizeOfRawData: 0x400 }),
    ]);
    expect(report.importedDlls).toEqual([]);
    expect(report.exportDllName).toBeNull();
  });

  it('rejects a file without the MZ signature', () => {
    const report = parsePeHeaders(new Uint8Array(64));
    expect(report.isPe).toBe(false);
  });

  it('rejects a file that is too small to hold a DOS header', () => {
    const report = parsePeHeaders(new Uint8Array(10));
    expect(report.isPe).toBe(false);
  });

  it('rejects a file with a valid DOS header but no PE signature', () => {
    const bytes = new Uint8Array(80);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, 0x5a4d, true);
    view.setUint32(0x3c, 64, true);
    // Bytes at offset 64 are left as zero, not 'PE\0\0'.
    const report = parsePeHeaders(bytes);
    expect(report.isPe).toBe(false);
  });

  it('formats a nonzero timestamp as an ISO date string', () => {
    const report = parsePeHeaders(buildMinimalPe()) as PeReport;
    expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('golden corpus (DUDE_PRD.md §21 Phase 23 Item 6)', () => {
  // Real native x64 PE (.NET's apphost launcher stub), cross-checked against Python's `pefile`
  // rather than DUDE's own parser -- see __fixtures__/README.md for provenance and exact values.
  it('parses a real .NET apphost executable', () => {
    const bytes = readFileSync(
      resolve(process.cwd(), 'src/app/tools/pe-header-viewer/__fixtures__/dotnet-apphost.exe'),
    );
    const report = parsePeHeaders(new Uint8Array(bytes)) as PeReport;

    expect(report.isPe).toBe(true);
    expect(report.machine).toBe('x64 (AMD64)');
    expect(report.numberOfSections).toBe(6);
    expect(report.timestamp).toBe('2026-03-25T15:32:16.000Z');
    expect(report.characteristics).toBe(0x0022);
    expect(report.optionalHeaderMagic).toBe('PE32+');
    expect(report.addressOfEntryPoint).toBe(0x13ba0);
    expect(report.imageBase).toBe('0x140000000');
    expect(report.subsystem).toBe('Windows CUI');
    expect(report.sizeOfImage).toBe(184320);
    expect(report.sizeOfHeaders).toBe(1024);
    expect(report.sections.map((s) => s.name)).toEqual(['.text', '.rdata', '.data', '.pdata', '.reloc', '.rsrc']);
    expect(report.importedDlls).toEqual([
      'SHELL32.dll',
      'ADVAPI32.dll',
      'KERNEL32.dll',
      'USER32.dll',
      'api-ms-win-crt-runtime-l1-1-0.dll',
      'api-ms-win-crt-heap-l1-1-0.dll',
      'api-ms-win-crt-time-l1-1-0.dll',
      'api-ms-win-crt-stdio-l1-1-0.dll',
      'api-ms-win-crt-locale-l1-1-0.dll',
      'api-ms-win-crt-string-l1-1-0.dll',
      'api-ms-win-crt-convert-l1-1-0.dll',
      'api-ms-win-crt-math-l1-1-0.dll',
    ]);
  });
});
