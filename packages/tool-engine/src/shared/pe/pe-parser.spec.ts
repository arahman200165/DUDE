import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parsePeHeaders, PeReport } from "./pe-parser.js";

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
      resolve(process.cwd(), 'packages/tool-engine/src/tools/pe-header-viewer/__fixtures__/dotnet-apphost.exe'),
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

/** A deterministic corpus image carrying representative optional PE directories. */
function buildFeaturePe(): Uint8Array {
  const bytes = new Uint8Array(0xa00);
  const view = new DataView(bytes.buffer);
  const u16 = (o: number, v: number) => view.setUint16(o, v, true);
  const u32 = (o: number, v: number) => view.setUint32(o, v, true);
  const rva = (value: number) => 0x200 + value - 0x1000;
  const ascii = (o: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[o + i] = value.charCodeAt(i); };
  const utf16 = (o: number, value: string) => { for (let i = 0; i < value.length; i++) u16(o + i * 2, value.charCodeAt(i)); u16(o + value.length * 2, 0); };

  u16(0, 0x5a4d); u32(0x3c, 0x80); u32(0x80, 0x4550);
  const coff = 0x84, opt = coff + 20;
  u16(coff, 0x8664); u16(coff + 2, 1); u32(coff + 4, 1700000000); u16(coff + 16, 240);
  u16(opt, 0x20b); u32(opt + 16, 0x1000); view.setBigUint64(opt + 24, 0x140000000n, true);
  u32(opt + 56, 0x2000); u32(opt + 60, 0x200); u16(opt + 68, 3); u32(opt + 108, 16);
  const dirs = opt + 112;
  const setDir = (i: number, address: number, size: number) => { u32(dirs + i * 8, address); u32(dirs + i * 8 + 4, size); };
  setDir(0, 0x1100, 0x100); setDir(1, 0x1200, 40); setDir(2, 0x1300, 0x100);
  setDir(4, 0x900, 8); setDir(6, 0x1500, 28); setDir(13, 0x1600, 64); setDir(14, 0x1720, 24);
  const section = opt + 240;
  ascii(section, '.rdata'); u32(section + 8, 0x800); u32(section + 12, 0x1000); u32(section + 16, 0x800); u32(section + 20, 0x200); u32(section + 36, 0x40000040);

  // Export table: one named forwarder and one ordinal-only direct export.
  let p = rva(0x1100); u32(p + 12, 0x1140); u32(p + 16, 5); u32(p + 20, 2); u32(p + 24, 1); u32(p + 28, 0x1160); u32(p + 32, 0x1168); u32(p + 36, 0x1170);
  ascii(rva(0x1140), 'feature.dll'); u32(rva(0x1160), 0x17a0); u32(rva(0x1164), 0x1190); u32(rva(0x1168), 0x1180); u16(rva(0x1170), 1); ascii(rva(0x1180), 'Forwarded'); ascii(rva(0x1190), 'KERNELBASE.Real');

  // Normal import table with an import-by-name and an ordinal thunk.
  p = rva(0x1200); u32(p, 0x1260); u32(p + 12, 0x1240); u32(p + 16, 0x1260); ascii(rva(0x1240), 'KERNEL32.dll');
  view.setBigUint64(rva(0x1260), 0x1280n, true); view.setBigUint64(rva(0x1268), 0x8000000000000007n, true); view.setBigUint64(rva(0x1270), 0n, true);
  u16(rva(0x1280), 3); ascii(rva(0x1282), 'Sleep');

  // Version resource: RT_VERSION -> name 1 -> language 1033 -> VS_FIXEDFILEINFO.
  p = rva(0x1300); u16(p + 14, 1); u32(p + 16, 16); u32(p + 20, 0x80000018);
  p = rva(0x1318); u16(p + 14, 1); u32(p + 16, 1); u32(p + 20, 0x80000030);
  p = rva(0x1330); u16(p + 14, 1); u32(p + 16, 1033); u32(p + 20, 0x48);
  p = rva(0x1348); u32(p, 0x1380); u32(p + 4, 92);
  p = rva(0x1380); u16(p, 92); u16(p + 2, 52); u16(p + 4, 0); utf16(p + 6, 'VS_VERSION_INFO');
  p = (p + 6 + 32 + 3) & ~3; u32(p, 0xfeef04bd); u32(p + 4, 0x00010000); u32(p + 8, 0x00010002); u32(p + 12, 0x00030004); u32(p + 16, 0x00050006); u32(p + 20, 0x00070008);

  // Debug directory with an RSDS CodeView record and a PDB path.
  p = rva(0x1500); u32(p + 4, 1700000000); u32(p + 12, 2); u32(p + 16, 36); u32(p + 20, 0x1780); u32(p + 24, rva(0x1780));
  p = rva(0x1780); ascii(p, 'RSDS'); u32(p + 4, 0x12345678); u16(p + 8, 0x1234); u16(p + 10, 0xabcd);
  bytes.set([1, 2, 3, 4, 5, 6, 7, 8], p + 12); u32(p + 20, 2); ascii(p + 24, 'sample.pdb'); bytes[p + 24 + 'sample.pdb'.length] = 0;

  // Delay import descriptor.
  p = rva(0x1600); u32(p, 1); u32(p + 4, 0x1640); u32(p + 12, 0x1660); u32(p + 16, 0x1660);
  ascii(rva(0x1640), 'DELAY.dll'); view.setBigUint64(rva(0x1660), 0x1680n, true); view.setBigUint64(rva(0x1668), 0n, true); u16(rva(0x1680), 0); ascii(rva(0x1682), 'Later');

  // CLR runtime header and a file-offset-based certificate directory entry.
  p = rva(0x1720); u32(p, 72); u16(p + 4, 2); u16(p + 6, 5); u32(p + 8, 0x1740); u32(p + 12, 0x80); u32(p + 16, 1); u32(p + 20, 0x06000001);
  u32(0x900, 8); u16(0x904, 0x0200); u16(0x906, 2);
  return bytes;
}

describe('extended PE directories', () => {
  it('reads delay imports, ordinal and forwarded exports, version, certificate presence, CLR and PDB data', () => {
    const report = parsePeHeaders(buildFeaturePe()) as PeReport;
    expect(report.importModules).toEqual([{ dll: 'KERNEL32.dll', symbols: [
      { name: 'Sleep', ordinal: null, hint: 3 }, { name: null, ordinal: 7, hint: null },
    ] }]);
    expect(report.importedDlls).toEqual(['KERNEL32.dll']);
    expect(report.delayLoadImports[0]).toMatchObject({ dll: 'DELAY.dll', symbols: [{ name: 'Later', ordinal: null }] });
    expect(report.exports).toEqual([
      { name: null, ordinal: 5, address: 0x17a0, forwardedTo: null },
      { name: 'Forwarded', ordinal: 6, address: 0x1190, forwardedTo: 'KERNELBASE.Real' },
    ]);
    expect(report.versionResource).toMatchObject({ fileVersion: '1.2.3.4', productVersion: '5.6.7.8' });
    expect(report.authenticode).toEqual({ present: true, certificateTableSize: 8 });
    expect(report.clrHeader).toMatchObject({ majorRuntimeVersion: 2, minorRuntimeVersion: 5, flags: 1, entryPointToken: 0x06000001 });
    expect(report.debugEntries[0]).toMatchObject({ codeViewSignature: 'RSDS', pdbPath: 'sample.pdb', pdbAge: 2 });
  });
});
