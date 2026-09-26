import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ElfReport, parseElfHeaders } from './elf-header-viewer-logic';

function writeCString(bytes: Uint8Array, offset: number, text: string): number {
  for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  bytes[offset + text.length] = 0;
  return offset + text.length + 1;
}

/** Builds a minimal, valid little-endian ELF64 executable with one PT_LOAD segment and a .dynsym/.dynstr/.shstrtab section trio. */
function buildMinimalElf(): Uint8Array {
  const phoff = 64;
  const phSize = 56;
  const dynstrOffset = phoff + phSize; // 120
  const dynstr = new Uint8Array(16);
  dynstr[0] = 0;
  writeCString(dynstr, 1, 'foo');

  const dynsymOffset = dynstrOffset + dynstr.length; // 136
  const symEntrySize = 24;
  const dynsymLength = symEntrySize * 2; // a null entry + one real symbol

  const shstrtabOffset = dynsymOffset + dynsymLength;
  const shstrtab = new Uint8Array(32);
  let cursor = 1; // offset 0 is reserved for the empty/null-section name
  const dynsymNameOffset = cursor;
  cursor = writeCString(shstrtab, cursor, '.dynsym');
  const dynstrNameOffset = cursor;
  cursor = writeCString(shstrtab, cursor, '.dynstr');
  const shstrtabNameOffset = cursor;
  cursor = writeCString(shstrtab, cursor, '.shstrtab');
  const shstrtabLength = cursor;

  const shoff = shstrtabOffset + shstrtabLength;
  const sectionCount = 4; // NULL, .dynsym, .dynstr, .shstrtab
  const shEntrySize = 64;

  const totalLength = shoff + sectionCount * shEntrySize;
  const bytes = new Uint8Array(totalLength);
  bytes.set(dynstr, dynstrOffset);
  bytes.set(shstrtab.subarray(0, shstrtabLength), shstrtabOffset);

  const view = new DataView(bytes.buffer);

  // e_ident
  bytes.set([0x7f, 0x45, 0x4c, 0x46], 0);
  bytes[4] = 2; // EI_CLASS: 64-bit
  bytes[5] = 1; // EI_DATA: little-endian
  bytes[6] = 1; // EI_VERSION

  view.setUint16(16, 2, true); // e_type: EXEC
  view.setUint16(18, 62, true); // e_machine: x86-64
  view.setUint32(20, 1, true); // e_version
  view.setBigUint64(24, 0x401000n, true); // e_entry
  view.setBigUint64(32, BigInt(phoff), true); // e_phoff
  view.setBigUint64(40, BigInt(shoff), true); // e_shoff
  view.setUint32(48, 0, true); // e_flags
  view.setUint16(52, 64, true); // e_ehsize
  view.setUint16(54, phSize, true); // e_phentsize
  view.setUint16(56, 1, true); // e_phnum
  view.setUint16(58, shEntrySize, true); // e_shentsize
  view.setUint16(60, sectionCount, true); // e_shnum
  view.setUint16(62, 3, true); // e_shstrndx -> section index 3 (.shstrtab)

  // Program header (Phdr64) at 64
  view.setUint32(phoff + 0, 1, true); // p_type: LOAD
  view.setUint32(phoff + 4, 5, true); // p_flags
  view.setBigUint64(phoff + 8, 0n, true); // p_offset
  view.setBigUint64(phoff + 16, 0x400000n, true); // p_vaddr
  view.setBigUint64(phoff + 24, 0x400000n, true); // p_paddr
  view.setBigUint64(phoff + 32, 0x1000n, true); // p_filesz
  view.setBigUint64(phoff + 40, 0x1000n, true); // p_memsz

  // Dynamic symbol table: entry 0 is the conventional null symbol, entry 1 is "foo"
  const sym1 = dynsymOffset + symEntrySize;
  view.setUint32(sym1 + 0, 1, true); // st_name -> offset 1 in .dynstr ("foo")
  view.setUint16(sym1 + 6, 1, true); // st_shndx
  view.setBigUint64(sym1 + 8, 0x401000n, true); // st_value
  view.setBigUint64(sym1 + 16, 16n, true); // st_size

  function writeSectionHeader(index: number, nameOffset: number, type: number, offset: number, size: number, link: number, entsize: number): void {
    const base = shoff + index * shEntrySize;
    view.setUint32(base + 0, nameOffset, true);
    view.setUint32(base + 4, type, true);
    view.setBigUint64(base + 24, BigInt(offset), true);
    view.setBigUint64(base + 32, BigInt(size), true);
    view.setUint32(base + 40, link, true);
    view.setBigUint64(base + 56, BigInt(entsize), true);
  }

  writeSectionHeader(0, 0, 0, 0, 0, 0, 0); // NULL section
  writeSectionHeader(1, dynsymNameOffset, 11 /* SHT_DYNSYM */, dynsymOffset, dynsymLength, 2 /* link -> .dynstr */, symEntrySize);
  writeSectionHeader(2, dynstrNameOffset, 3 /* SHT_STRTAB */, dynstrOffset, dynstr.length, 0, 0);
  writeSectionHeader(3, shstrtabNameOffset, 3 /* SHT_STRTAB */, shstrtabOffset, shstrtabLength, 0, 0);

  return bytes;
}

describe('parseElfHeaders', () => {
  it('parses a minimal valid little-endian ELF64 executable', () => {
    const report = parseElfHeaders(buildMinimalElf()) as ElfReport;
    expect(report.isElf).toBe(true);
    expect(report.bitness).toBe('64-bit');
    expect(report.endianness).toBe('little-endian');
    expect(report.type).toBe('EXEC (executable)');
    expect(report.machine).toBe('x86-64');
    expect(report.entryPoint).toBe('0x401000');
  });

  it('parses the PT_LOAD program header', () => {
    const report = parseElfHeaders(buildMinimalElf()) as ElfReport;
    expect(report.programHeaders).toEqual([expect.objectContaining({ type: 'LOAD', vaddr: '0x400000', filesz: '0x1000' })]);
  });

  it('resolves section names via the shstrtab', () => {
    const report = parseElfHeaders(buildMinimalElf()) as ElfReport;
    const names = report.sectionHeaders.map((s) => s.name);
    expect(names).toEqual(['', '.dynsym', '.dynstr', '.shstrtab']);
  });

  it('resolves dynamic symbol names via .dynstr, skipping the null entry', () => {
    const report = parseElfHeaders(buildMinimalElf()) as ElfReport;
    expect(report.dynamicSymbols).toEqual([{ name: 'foo', value: '0x401000', size: '0x10' }]);
  });

  it('rejects a file without the ELF magic bytes', () => {
    expect(parseElfHeaders(new Uint8Array(64)).isElf).toBe(false);
  });

  it('rejects a file too small to hold an ELF header', () => {
    expect(parseElfHeaders(new Uint8Array(10)).isElf).toBe(false);
  });
});

describe('golden corpus (DUDE_PRD.md §21 Phase 23 Item 6)', () => {
  // Real x86-64 ELF (.NET's apphost launcher stub, cross-compiled from Windows), cross-checked
  // against Python's `pyelftools` rather than DUDE's own parser -- see __fixtures__/README.md for
  // provenance and exact values.
  it('parses a real .NET apphost executable', () => {
    const bytes = readFileSync(
      resolve(process.cwd(), 'src/app/tools/elf-header-viewer/__fixtures__/dotnet-apphost.elf'),
    );
    const report = parseElfHeaders(new Uint8Array(bytes)) as ElfReport;

    expect(report.isElf).toBe(true);
    expect(report.bitness).toBe('64-bit');
    expect(report.endianness).toBe('little-endian');
    expect(report.type).toBe('DYN (shared object/PIE)');
    expect(report.machine).toBe('x86-64');
    expect(report.entryPoint).toBe('0x7190');

    expect(report.programHeaders).toHaveLength(12);
    expect(report.programHeaders[0]).toEqual({ type: 'PHDR', offset: '0x40', vaddr: '0x40', filesz: '0x2a0', memsz: '0x2a0' });
    expect(report.programHeaders.filter((p) => p.type === 'LOAD')).toHaveLength(4);

    expect(report.sectionHeaders.map((s) => s.name)).toEqual([
      '',
      '.interp',
      '.note.ABI-tag',
      '.note.gnu.build-id',
      '.dynsym',
      '.gnu.version',
      '.gnu.version_r',
      '.gnu.hash',
      '.dynstr',
      '.rela.dyn',
      '.rela.plt',
      '.rodata',
      '.gcc_except_table',
      '.eh_frame_hdr',
      '.eh_frame',
      '.text',
      '.init',
      '.fini',
      '.plt',
      '.tbss',
      '.fini_array',
      '.init_array',
      '.data.rel.ro',
      '.dynamic',
      '.got',
      '.got.plt',
      '.relro_padding',
      '.data',
      '.tm_clone_table',
      '.bss',
      '.comment',
      '.shstrtab',
      '.gnu_debuglink',
    ]);

    // pyelftools reports 104 .dynsym entries; DUDE skips the mandatory leading null-name entry.
    expect(report.dynamicSymbols).toHaveLength(103);
    expect(report.dynamicSymbols.map((s) => s.name)).toContain('__libc_start_main');
    expect(report.dynamicSymbols.map((s) => s.name)).toContain('strlen');
  });
});
