import { dataViewOf, Endianness, readUint16, readUint32, readUint64, readUint8 } from "../../shared/utils/struct-reader.js";

const ELF_MAGIC = [0x7f, 0x45, 0x4c, 0x46]; // 0x7f 'E' 'L' 'F'

const TYPE_NAMES: Record<number, string> = { 0: 'NONE', 1: 'REL (relocatable)', 2: 'EXEC (executable)', 3: 'DYN (shared object/PIE)', 4: 'CORE' };

const MACHINE_NAMES: Record<number, string> = {
  3: 'i386',
  8: 'MIPS',
  20: 'PowerPC',
  21: 'PowerPC64',
  40: 'ARM',
  62: 'x86-64',
  183: 'AArch64',
  243: 'RISC-V',
};

const SEGMENT_TYPE_NAMES: Record<number, string> = {
  0: 'NULL',
  1: 'LOAD',
  2: 'DYNAMIC',
  3: 'INTERP',
  4: 'NOTE',
  5: 'SHLIB',
  6: 'PHDR',
  7: 'TLS',
  0x6474e550: 'GNU_EH_FRAME',
  0x6474e551: 'GNU_STACK',
  0x6474e552: 'GNU_RELRO',
};

const SECTION_TYPE_NAMES: Record<number, string> = {
  0: 'NULL',
  1: 'PROGBITS',
  2: 'SYMTAB',
  3: 'STRTAB',
  4: 'RELA',
  5: 'HASH',
  6: 'DYNAMIC',
  7: 'NOTE',
  8: 'NOBITS',
  9: 'REL',
  10: 'SHLIB',
  11: 'DYNSYM',
  14: 'INIT_ARRAY',
  15: 'FINI_ARRAY',
  17: 'GROUP',
};

function hex(value: bigint | number): string {
  return '0x' + value.toString(16);
}

export interface ElfProgramHeader {
  readonly type: string;
  readonly offset: string;
  readonly vaddr: string;
  readonly filesz: string;
  readonly memsz: string;
}

export interface ElfSectionHeader {
  readonly name: string;
  readonly type: string;
  readonly addr: string;
  readonly offset: string;
  readonly size: string;
}

export interface ElfSymbol {
  readonly name: string;
  readonly value: string;
  readonly size: string;
}

export interface ElfReport {
  readonly isElf: true;
  readonly bitness: '32-bit' | '64-bit';
  readonly endianness: 'little-endian' | 'big-endian';
  readonly type: string;
  readonly machine: string;
  readonly entryPoint: string;
  readonly programHeaders: readonly ElfProgramHeader[];
  readonly sectionHeaders: readonly ElfSectionHeader[];
  readonly dynamicSymbols: readonly ElfSymbol[];
}

export interface ElfParseError {
  readonly isElf: false;
  readonly error: string;
}

function readCString(bytes: Uint8Array, offset: number, maxLength = 256): string {
  let end = offset;
  while (end < bytes.length && end < offset + maxLength && bytes[end] !== 0) end++;
  let out = '';
  for (let i = offset; i < end; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

export function parseElfHeaders(bytes: Uint8Array): ElfReport | ElfParseError {
  if (bytes.length < 52) return { isElf: false, error: 'File is too small to contain an ELF header.' };
  if (!ELF_MAGIC.every((b, i) => bytes[i] === b)) return { isElf: false, error: 'Missing 0x7F "ELF" magic bytes.' };

  const eiClass = readUint8(dataViewOf(bytes), 4);
  const eiData = readUint8(dataViewOf(bytes), 5);
  if (eiClass !== 1 && eiClass !== 2) return { isElf: false, error: `Unrecognized EI_CLASS byte (${eiClass}); expected 1 (32-bit) or 2 (64-bit).` };
  if (eiData !== 1 && eiData !== 2) return { isElf: false, error: `Unrecognized EI_DATA byte (${eiData}); expected 1 (LE) or 2 (BE).` };

  const is64 = eiClass === 2;
  const endianness: Endianness = eiData === 1 ? 'LE' : 'BE';
  const headerSize = is64 ? 64 : 52;
  if (bytes.length < headerSize) return { isElf: false, error: 'File is too small to contain a full ELF header.' };

  const view = dataViewOf(bytes);
  const readWord = (offset: number): bigint => (is64 ? readUint64(view, offset, endianness) : BigInt(readUint32(view, offset, endianness)));

  const eType = readUint16(view, 16, endianness);
  const eMachine = readUint16(view, 18, endianness);
  const entry = readWord(24);

  const wordSize = is64 ? 8 : 4;
  const phoffOffset = 24 + wordSize;
  const shoffOffset = phoffOffset + wordSize;
  const phoff = readWord(phoffOffset);
  const shoff = readWord(shoffOffset);

  const tailOffset = shoffOffset + wordSize + 4; // + e_flags (always uint32)
  const phentsize = readUint16(view, tailOffset + 2, endianness);
  const phnum = readUint16(view, tailOffset + 4, endianness);
  const shentsize = readUint16(view, tailOffset + 6, endianness);
  const shnum = readUint16(view, tailOffset + 8, endianness);
  const shstrndx = readUint16(view, tailOffset + 10, endianness);

  const programHeaders: ElfProgramHeader[] = [];
  for (let i = 0; i < phnum; i++) {
    const base = Number(phoff) + i * phentsize;
    if (base + phentsize > bytes.length) break;

    const pType = readUint32(view, base, endianness);
    if (is64) {
      programHeaders.push({
        type: SEGMENT_TYPE_NAMES[pType] ?? `unknown (${hex(pType)})`,
        offset: hex(readUint64(view, base + 8, endianness)),
        vaddr: hex(readUint64(view, base + 16, endianness)),
        filesz: hex(readUint64(view, base + 32, endianness)),
        memsz: hex(readUint64(view, base + 40, endianness)),
      });
    } else {
      programHeaders.push({
        type: SEGMENT_TYPE_NAMES[pType] ?? `unknown (${hex(pType)})`,
        offset: hex(readUint32(view, base + 4, endianness)),
        vaddr: hex(readUint32(view, base + 8, endianness)),
        filesz: hex(readUint32(view, base + 16, endianness)),
        memsz: hex(readUint32(view, base + 20, endianness)),
      });
    }
  }

  interface RawSection {
    readonly nameOffset: number;
    readonly type: number;
    readonly addr: bigint;
    readonly offset: bigint;
    readonly size: bigint;
    readonly link: number;
    readonly entsize: bigint;
  }

  const rawSections: RawSection[] = [];
  for (let i = 0; i < shnum; i++) {
    const base = Number(shoff) + i * shentsize;
    if (base + shentsize > bytes.length) break;

    if (is64) {
      rawSections.push({
        nameOffset: readUint32(view, base, endianness),
        type: readUint32(view, base + 4, endianness),
        addr: readUint64(view, base + 16, endianness),
        offset: readUint64(view, base + 24, endianness),
        size: readUint64(view, base + 32, endianness),
        link: readUint32(view, base + 40, endianness),
        entsize: readUint64(view, base + 56, endianness),
      });
    } else {
      rawSections.push({
        nameOffset: readUint32(view, base, endianness),
        type: readUint32(view, base + 4, endianness),
        addr: BigInt(readUint32(view, base + 12, endianness)),
        offset: BigInt(readUint32(view, base + 16, endianness)),
        size: BigInt(readUint32(view, base + 20, endianness)),
        link: readUint32(view, base + 24, endianness),
        entsize: BigInt(readUint32(view, base + 36, endianness)),
      });
    }
  }

  const shstrtab = rawSections[shstrndx];
  const sectionName = (nameOffset: number): string => {
    if (!shstrtab) return `+${nameOffset}`;
    try {
      return readCString(bytes, Number(shstrtab.offset) + nameOffset);
    } catch {
      return `+${nameOffset}`;
    }
  };

  const sectionHeaders: ElfSectionHeader[] = rawSections.map((s) => ({
    name: sectionName(s.nameOffset),
    type: SECTION_TYPE_NAMES[s.type] ?? `unknown (${s.type})`,
    addr: hex(s.addr),
    offset: hex(s.offset),
    size: hex(s.size),
  }));

  const dynamicSymbols: ElfSymbol[] = [];
  const dynsym = rawSections.find((s) => sectionName(s.nameOffset) === '.dynsym');
  if (dynsym) {
    const strtab = rawSections[dynsym.link];
    const symEntrySize = is64 ? 24 : 16;
    const count = dynsym.entsize > 0n ? Number(dynsym.size / dynsym.entsize) : Number(dynsym.size) / symEntrySize;

    for (let i = 0; i < count; i++) {
      const base = Number(dynsym.offset) + i * symEntrySize;
      if (base + symEntrySize > bytes.length) break;

      const nameOffset = readUint32(view, base, endianness);
      const name = strtab ? readCString(bytes, Number(strtab.offset) + nameOffset) : `+${nameOffset}`;
      if (!name) continue;

      const value = is64 ? readUint64(view, base + 8, endianness) : BigInt(readUint32(view, base + 4, endianness));
      const size = is64 ? readUint64(view, base + 16, endianness) : BigInt(readUint32(view, base + 8, endianness));
      dynamicSymbols.push({ name, value: hex(value), size: hex(size) });
    }
  }

  return {
    isElf: true,
    bitness: is64 ? '64-bit' : '32-bit',
    endianness: eiData === 1 ? 'little-endian' : 'big-endian',
    type: TYPE_NAMES[eType] ?? `unknown (${eType})`,
    machine: MACHINE_NAMES[eMachine] ?? `unknown (${eMachine})`,
    entryPoint: hex(entry),
    programHeaders,
    sectionHeaders,
    dynamicSymbols,
  };
}
