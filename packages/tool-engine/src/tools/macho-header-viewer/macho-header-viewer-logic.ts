import { dataViewOf, Endianness, readInt32, readUint32 } from "../../shared/utils/struct-reader.js";

const CPU_TYPE_NAMES: Record<number, string> = {
  0x00000007: 'x86',
  0x01000007: 'x86-64',
  0x0000000c: 'ARM',
  0x0100000c: 'ARM64',
  0x00000012: 'PowerPC',
  0x01000012: 'PowerPC64',
};

const FILE_TYPE_NAMES: Record<number, string> = {
  1: 'MH_OBJECT (relocatable object)',
  2: 'MH_EXECUTE (executable)',
  3: 'MH_FVMLIB',
  4: 'MH_CORE (core dump)',
  5: 'MH_PRELOAD',
  6: 'MH_DYLIB (dynamic library)',
  7: 'MH_DYLINKER (dynamic linker)',
  8: 'MH_BUNDLE (loadable bundle)',
  9: 'MH_DYLIB_STUB',
  10: 'MH_DSYM (debug symbols)',
  11: 'MH_KEXT_BUNDLE',
};

const LOAD_COMMAND_NAMES: Record<number, string> = {
  0x1: 'LC_SEGMENT',
  0x2: 'LC_SYMTAB',
  0x4: 'LC_THREAD',
  0x5: 'LC_UNIXTHREAD',
  0xb: 'LC_DYSYMTAB',
  0xc: 'LC_LOAD_DYLIB',
  0xd: 'LC_ID_DYLIB',
  0xe: 'LC_LOAD_DYLINKER',
  0xf: 'LC_ID_DYLINKER',
  0x19: 'LC_SEGMENT_64',
  0x1b: 'LC_UUID',
  0x1d: 'LC_CODE_SIGNATURE',
  0x1e: 'LC_SEGMENT_SPLIT_INFO',
  0x22: 'LC_DYLD_INFO',
  0x80000022: 'LC_DYLD_INFO_ONLY',
  0x24: 'LC_VERSION_MIN_MACOSX',
  0x25: 'LC_VERSION_MIN_IPHONEOS',
  0x26: 'LC_FUNCTION_STARTS',
  0x80000028: 'LC_MAIN',
  0x29: 'LC_DATA_IN_CODE',
  0x2a: 'LC_SOURCE_VERSION',
  0x32: 'LC_BUILD_VERSION',
  0x8000001c: 'LC_LOAD_WEAK_DYLIB',
  0x8000001f: 'LC_REEXPORT_DYLIB',
  0x20: 'LC_LAZY_LOAD_DYLIB',
};

const DYLIB_COMMANDS = new Set([0xc, 0xd, 0x8000001c, 0x8000001f, 0x20]);

function readCString(bytes: Uint8Array, offset: number, maxLength = 256): string {
  let end = offset;
  while (end < bytes.length && end < offset + maxLength && bytes[end] !== 0) end++;
  let out = '';
  for (let i = offset; i < end; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function formatVersion(packed: number): string {
  const major = (packed >>> 16) & 0xffff;
  const minor = (packed >>> 8) & 0xff;
  const patch = packed & 0xff;
  return `${major}.${minor}.${patch}`;
}

export interface MachOLoadCommand {
  readonly cmd: string;
  readonly cmdsize: number;
}

export interface MachODylib {
  readonly name: string;
  readonly currentVersion: string;
  readonly compatibilityVersion: string;
}

export interface MachOArch {
  readonly cpuType: string;
  readonly offset: number;
  readonly size: number;
}

export interface MachOReport {
  readonly isMachO: true;
  readonly isFat: boolean;
  readonly architectures: readonly MachOArch[];
  readonly bitness: '32-bit' | '64-bit';
  readonly endianness: 'little-endian' | 'big-endian';
  readonly cpuType: string;
  readonly fileType: string;
  readonly loadCommands: readonly MachOLoadCommand[];
  readonly dylibs: readonly MachODylib[];
}

export interface MachOParseError {
  readonly isMachO: false;
  readonly error: string;
}

interface MagicInfo {
  readonly is64: boolean;
  readonly endianness: Endianness;
}

function detectThinMagic(bytes: Uint8Array): MagicInfo | null {
  const match = (sig: readonly number[]) => sig.every((b, i) => bytes[i] === b);
  if (match([0xfe, 0xed, 0xfa, 0xce])) return { is64: false, endianness: 'BE' };
  if (match([0xce, 0xfa, 0xed, 0xfe])) return { is64: false, endianness: 'LE' };
  if (match([0xfe, 0xed, 0xfa, 0xcf])) return { is64: true, endianness: 'BE' };
  if (match([0xcf, 0xfa, 0xed, 0xfe])) return { is64: true, endianness: 'LE' };
  return null;
}

function parseThinMachO(bytes: Uint8Array, magic: MagicInfo): MachOReport {
  const view = dataViewOf(bytes);
  const { is64, endianness } = magic;

  const cpuType = readInt32(view, 4, endianness);
  const fileType = readUint32(view, 12, endianness);
  const ncmds = readUint32(view, 16, endianness);
  const sizeofcmds = readUint32(view, 20, endianness);

  const headerSize = is64 ? 32 : 28;
  const loadCommands: MachOLoadCommand[] = [];
  const dylibs: MachODylib[] = [];

  let offset = headerSize;
  const commandsEnd = Math.min(bytes.length, headerSize + sizeofcmds);
  for (let i = 0; i < ncmds && offset + 8 <= commandsEnd; i++) {
    const cmd = readUint32(view, offset, endianness);
    const cmdsize = readUint32(view, offset + 4, endianness);
    if (cmdsize < 8 || offset + cmdsize > bytes.length) break;

    loadCommands.push({ cmd: LOAD_COMMAND_NAMES[cmd] ?? `unknown (0x${cmd.toString(16)})`, cmdsize });

    if (DYLIB_COMMANDS.has(cmd) && offset + 24 <= bytes.length) {
      const nameOffsetField = readUint32(view, offset + 8, endianness);
      const currentVersion = readUint32(view, offset + 16, endianness);
      const compatibilityVersion = readUint32(view, offset + 20, endianness);
      dylibs.push({
        name: readCString(bytes, offset + nameOffsetField),
        currentVersion: formatVersion(currentVersion),
        compatibilityVersion: formatVersion(compatibilityVersion),
      });
    }

    offset += cmdsize;
  }

  return {
    isMachO: true,
    isFat: false,
    architectures: [],
    bitness: is64 ? '64-bit' : '32-bit',
    endianness: endianness === 'LE' ? 'little-endian' : 'big-endian',
    cpuType: CPU_TYPE_NAMES[cpuType >>> 0] ?? `unknown (0x${(cpuType >>> 0).toString(16)})`,
    fileType: FILE_TYPE_NAMES[fileType] ?? `unknown (${fileType})`,
    loadCommands,
    dylibs,
  };
}

export function parseMachOHeaders(bytes: Uint8Array): MachOReport | MachOParseError {
  if (bytes.length < 4) return { isMachO: false, error: 'File is too small to contain a Mach-O magic number.' };

  const match = (sig: readonly number[]) => sig.every((b, i) => bytes[i] === b);
  const isFat32 = match([0xca, 0xfe, 0xba, 0xbe]);
  const isFat64 = match([0xca, 0xfe, 0xba, 0xbf]);

  if (isFat32 || isFat64) {
    if (bytes.length < 8) return { isMachO: false, error: 'File is too small to contain a fat_header.' };

    const view = dataViewOf(bytes);
    const nfatArch = readUint32(view, 4, 'BE');
    const entrySize = isFat64 ? 32 : 20;
    const architectures: MachOArch[] = [];

    for (let i = 0; i < nfatArch; i++) {
      const base = 8 + i * entrySize;
      if (base + entrySize > bytes.length) break;

      const cpuType = readInt32(view, base, 'BE');
      const archOffset = isFat64 ? Number(view.getBigUint64(base + 8, false)) : readUint32(view, base + 8, 'BE');
      const archSize = isFat64 ? Number(view.getBigUint64(base + 16, false)) : readUint32(view, base + 12, 'BE');
      architectures.push({ cpuType: CPU_TYPE_NAMES[cpuType >>> 0] ?? `unknown (0x${(cpuType >>> 0).toString(16)})`, offset: archOffset, size: archSize });
    }

    const first = architectures[0];
    if (!first || first.offset + 4 > bytes.length) return { isMachO: false, error: 'Fat binary has no readable architecture slices.' };

    const sliceBytes = bytes.subarray(first.offset, first.offset + first.size);
    const sliceMagic = detectThinMagic(sliceBytes);
    if (!sliceMagic) return { isMachO: false, error: 'The first architecture slice is not a recognizable thin Mach-O.' };

    return { ...parseThinMachO(sliceBytes, sliceMagic), isFat: true, architectures };
  }

  const thinMagic = detectThinMagic(bytes);
  if (!thinMagic) return { isMachO: false, error: 'Missing a recognized Mach-O or fat-binary magic number.' };
  if (bytes.length < (thinMagic.is64 ? 32 : 28)) return { isMachO: false, error: 'File is too small to contain a full mach_header.' };

  return parseThinMachO(bytes, thinMagic);
}
