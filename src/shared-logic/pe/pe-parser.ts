import { dataViewOf, readUint16, readUint32, readUint64 } from './struct-reader';

const DOS_MAGIC = 0x5a4d;
const PE_SIGNATURE = 0x00004550;
const OPTIONAL_HEADER_PE32 = 0x10b;
const OPTIONAL_HEADER_PE32_PLUS = 0x20b;
const MAX_TABLE_ENTRIES = 100_000;

const MACHINE_NAMES: Record<number, string> = {
  0x014c: 'i386', 0x0200: 'IA64', 0x8664: 'x64 (AMD64)', 0x01c0: 'ARM', 0xaa64: 'ARM64',
};
const SUBSYSTEM_NAMES: Record<number, string> = {
  1: 'Native', 2: 'Windows GUI', 3: 'Windows CUI', 5: 'OS/2 CUI', 7: 'POSIX CUI',
  9: 'Windows CE GUI', 10: 'EFI Application', 11: 'EFI Boot Service Driver', 12: 'EFI Runtime Driver',
  13: 'EFI ROM', 14: 'Xbox', 16: 'Windows Boot Application',
};
const DATA_DIRECTORY_NAMES = [
  'Export Table', 'Import Table', 'Resource Table', 'Exception Table', 'Certificate Table',
  'Base Relocation Table', 'Debug', 'Architecture', 'Global Ptr', 'TLS Table', 'Load Config Table',
  'Bound Import', 'IAT', 'Delay Import Descriptor', 'CLR Runtime Header', 'Reserved',
];

export interface PeDataDirectory { readonly name: string; readonly virtualAddress: number; readonly size: number }
export interface PeSection {
  readonly name: string; readonly virtualSize: number; readonly virtualAddress: number;
  readonly sizeOfRawData: number; readonly pointerToRawData: number; readonly characteristics: number;
}
export interface PeImportModule { readonly dll: string; readonly symbols: readonly PeImportSymbol[] }
export interface PeImportSymbol { readonly name: string | null; readonly ordinal: number | null; readonly hint: number | null }
export interface PeExport {
  readonly name: string | null; readonly ordinal: number; readonly address: number;
  readonly forwardedTo: string | null;
}
export interface PeVersionResource {
  readonly fileVersion: string | null;
  readonly productVersion: string | null;
  readonly strings: Readonly<Record<string, string>>;
}
export interface PeClrHeader {
  readonly majorRuntimeVersion: number; readonly minorRuntimeVersion: number;
  readonly metadataRva: number; readonly metadataSize: number; readonly flags: number;
  readonly entryPointToken: number;
}
export interface PeDebugEntry {
  readonly type: number; readonly typeName: string; readonly timestamp: number;
  readonly codeViewSignature: string | null; readonly pdbPath: string | null;
  readonly pdbGuid: string | null; readonly pdbAge: number | null;
}

export interface PeReport {
  readonly isPe: true;
  readonly machine: string;
  readonly numberOfSections: number;
  readonly timestamp: string;
  readonly characteristics: number;
  readonly optionalHeaderMagic: 'PE32' | 'PE32+' | 'unknown';
  readonly addressOfEntryPoint: number;
  readonly imageBase: string;
  readonly subsystem: string;
  readonly sizeOfImage: number;
  readonly sizeOfHeaders: number;
  readonly dataDirectories: readonly PeDataDirectory[];
  readonly sections: readonly PeSection[];
  readonly importedDlls: readonly string[];
  readonly importModules: readonly PeImportModule[];
  readonly delayLoadImports: readonly PeImportModule[];
  readonly exportDllName: string | null;
  readonly exportFunctionCount: number;
  readonly exportNameCount: number;
  readonly exports: readonly PeExport[];
  readonly versionResource: PeVersionResource | null;
  readonly authenticode: { readonly present: boolean; readonly certificateTableSize: number };
  readonly clrHeader: PeClrHeader | null;
  readonly debugEntries: readonly PeDebugEntry[];
}
export interface PeParseError { readonly isPe: false; readonly error: string }

function inBounds(bytes: Uint8Array, offset: number, length: number): boolean {
  return Number.isSafeInteger(offset) && offset >= 0 && length >= 0 && offset + length <= bytes.length;
}

function readCString(bytes: Uint8Array, offset: number, maxLength = 4096): string {
  if (!inBounds(bytes, offset, 1)) return '';
  let end = offset;
  while (end < bytes.length && end < offset + maxLength && bytes[end] !== 0) end++;
  let out = '';
  for (let i = offset; i < end; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function readUtf16Z(bytes: Uint8Array, offset: number, limit: number): string {
  const view = dataViewOf(bytes);
  let out = '';
  for (let p = offset; p + 1 < Math.min(bytes.length, offset + limit); p += 2) {
    const code = view.getUint16(p, true);
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  return out;
}

function rvaToFileOffset(sections: readonly PeSection[], rva: number, sizeOfHeaders = 0): number | null {
  if (rva < sizeOfHeaders) return rva;
  for (const section of sections) {
    const span = Math.max(section.virtualSize, section.sizeOfRawData);
    if (rva >= section.virtualAddress && rva - section.virtualAddress < span) {
      const offset = section.pointerToRawData + (rva - section.virtualAddress);
      return Number.isSafeInteger(offset) ? offset : null;
    }
  }
  return null;
}

function directory(directories: readonly PeDataDirectory[], name: string): PeDataDirectory | undefined {
  return directories.find((item) => item.name === name && item.virtualAddress !== 0 && item.size !== 0);
}

function parseThunks(
  bytes: Uint8Array, view: DataView, sections: readonly PeSection[], sizeOfHeaders: number,
  thunkRva: number, is64: boolean,
): PeImportSymbol[] {
  const offset = rvaToFileOffset(sections, thunkRva, sizeOfHeaders);
  if (offset === null) return [];
  const width = is64 ? 8 : 4;
  const ordinalFlag = is64 ? 0x8000000000000000n : 0x80000000n;
  const mask = is64 ? 0x7fffffffffffffffn : 0x7fffffffn;
  const results: PeImportSymbol[] = [];
  for (let i = 0; i < MAX_TABLE_ENTRIES && inBounds(bytes, offset + i * width, width); i++) {
    const value = is64 ? readUint64(view, offset + i * width) : BigInt(readUint32(view, offset + i * width));
    if (value === 0n) break;
    if ((value & ordinalFlag) !== 0n) {
      results.push({ name: null, ordinal: Number(value & 0xffffn), hint: null });
      continue;
    }
    const nameOffset = rvaToFileOffset(sections, Number(value & mask), sizeOfHeaders);
    if (nameOffset === null || !inBounds(bytes, nameOffset, 2)) continue;
    results.push({ name: readCString(bytes, nameOffset + 2), ordinal: null, hint: readUint16(view, nameOffset) });
  }
  return results;
}

function parseImports(
  bytes: Uint8Array, view: DataView, sections: readonly PeSection[], sizeOfHeaders: number,
  directories: readonly PeDataDirectory[], imageBase: bigint, is64: boolean, delay: boolean,
): PeImportModule[] {
  const dir = directory(directories, delay ? 'Delay Import Descriptor' : 'Import Table');
  if (!dir) return [];
  const start = rvaToFileOffset(sections, dir.virtualAddress, sizeOfHeaders);
  if (start === null) return [];
  const itemSize = delay ? 32 : 20;
  const output: PeImportModule[] = [];
  const stop = Math.min(bytes.length, start + Math.min(dir.size || bytes.length, 1_000_000));
  for (let p = start, count = 0; p + itemSize <= stop && count++ < 4096; p += itemSize) {
    const fields = Array.from({ length: delay ? 8 : 5 }, (_, i) => readUint32(view, p + i * 4));
    if (fields.every((field) => field === 0)) break;
    let nameRva: number;
    let thunkRva: number;
    if (delay) {
      const rvaBased = (fields[0] & 1) !== 0;
      nameRva = rvaBased ? fields[1] : Number(BigInt(fields[1]) - imageBase);
      thunkRva = rvaBased ? (fields[4] || fields[3]) : Number(BigInt(fields[4] || fields[3]) - imageBase);
    } else {
      nameRva = fields[3];
      thunkRva = fields[0] || fields[4];
    }
    if (!Number.isSafeInteger(nameRva) || nameRva <= 0) continue;
    const nameOffset = rvaToFileOffset(sections, nameRva, sizeOfHeaders);
    if (nameOffset === null) continue;
    output.push({ dll: readCString(bytes, nameOffset), symbols: thunkRva > 0 ? parseThunks(bytes, view, sections, sizeOfHeaders, thunkRva, is64) : [] });
  }
  return output;
}

function parseExports(
  bytes: Uint8Array, view: DataView, sections: readonly PeSection[], sizeOfHeaders: number,
  dir: PeDataDirectory | undefined,
): { dll: string | null; functions: number; names: number; exports: PeExport[] } {
  if (!dir) return { dll: null, functions: 0, names: 0, exports: [] };
  const start = rvaToFileOffset(sections, dir.virtualAddress, sizeOfHeaders);
  if (start === null || !inBounds(bytes, start, 40)) return { dll: null, functions: 0, names: 0, exports: [] };
  const dllNameOffset = rvaToFileOffset(sections, readUint32(view, start + 12), sizeOfHeaders);
  const functions = readUint32(view, start + 20);
  const names = readUint32(view, start + 24);
  const base = readUint32(view, start + 16);
  const addressTable = rvaToFileOffset(sections, readUint32(view, start + 28), sizeOfHeaders);
  const nameTable = rvaToFileOffset(sections, readUint32(view, start + 32), sizeOfHeaders);
  const ordinalTable = rvaToFileOffset(sections, readUint32(view, start + 36), sizeOfHeaders);
  const cap = Math.min(functions, MAX_TABLE_ENTRIES);
  const namesByIndex = new Map<number, string>();
  if (nameTable !== null && ordinalTable !== null) {
    for (let i = 0; i < Math.min(names, MAX_TABLE_ENTRIES); i++) {
      if (!inBounds(bytes, nameTable + i * 4, 4) || !inBounds(bytes, ordinalTable + i * 2, 2)) break;
      const nameOffset = rvaToFileOffset(sections, readUint32(view, nameTable + i * 4), sizeOfHeaders);
      const functionIndex = readUint16(view, ordinalTable + i * 2);
      if (nameOffset !== null && functionIndex < cap) namesByIndex.set(functionIndex, readCString(bytes, nameOffset));
    }
  }
  const exports: PeExport[] = [];
  if (addressTable !== null) {
    for (let i = 0; i < cap && inBounds(bytes, addressTable + i * 4, 4); i++) {
      const address = readUint32(view, addressTable + i * 4);
      if (address === 0) continue;
      const forwarded = address >= dir.virtualAddress && address - dir.virtualAddress < dir.size;
      const forwardOffset = forwarded ? rvaToFileOffset(sections, address, sizeOfHeaders) : null;
      exports.push({
        name: namesByIndex.get(i) ?? null,
        ordinal: base + i,
        address,
        forwardedTo: forwardOffset === null ? null : readCString(bytes, forwardOffset),
      });
    }
  }
  return { dll: dllNameOffset === null ? null : readCString(bytes, dllNameOffset), functions, names, exports };
}

function align4(value: number): number { return (value + 3) & ~3; }

function versionFromWords(ms: number, ls: number): string {
  return `${ms >>> 16}.${ms & 0xffff}.${ls >>> 16}.${ls & 0xffff}`;
}

function parseVersionBlob(bytes: Uint8Array, offset: number, size: number): PeVersionResource | null {
  if (!inBounds(bytes, offset, Math.min(size, 6)) || size < 6) return null;
  const view = dataViewOf(bytes);
  const end = Math.min(bytes.length, offset + size);
  const rootLength = readUint16(view, offset);
  const valueLength = readUint16(view, offset + 2);
  if (rootLength < 6 || offset + rootLength > end) return null;
  const key = readUtf16Z(bytes, offset + 6, rootLength - 6);
  if (key !== 'VS_VERSION_INFO') return null;
  let cursor = align4(offset + 6 + (key.length + 1) * 2);
  const strings: Record<string, string> = {};
  let fileVersion: string | null = null;
  let productVersion: string | null = null;
  if (valueLength >= 52 && inBounds(bytes, cursor, 52) && readUint32(view, cursor) === 0xfeef04bd) {
    fileVersion = versionFromWords(readUint32(view, cursor + 8), readUint32(view, cursor + 12));
    productVersion = versionFromWords(readUint32(view, cursor + 16), readUint32(view, cursor + 20));
  }
  cursor = align4(cursor + valueLength * 2);
  const parseBlock = (blockOffset: number, depth: number): number => {
    if (depth > 8 || !inBounds(bytes, blockOffset, 6)) return end;
    const len = readUint16(view, blockOffset);
    const valLen = readUint16(view, blockOffset + 2);
    const blockEnd = Math.min(end, blockOffset + len);
    if (len < 6 || blockEnd <= blockOffset) return end;
    const blockKey = readUtf16Z(bytes, blockOffset + 6, blockEnd - blockOffset - 6);
    let child = align4(blockOffset + 6 + (blockKey.length + 1) * 2);
    if (blockKey === 'StringFileInfo') {
      while (child + 6 <= blockEnd) {
        const childLen = readUint16(view, child);
        if (childLen < 6 || child + childLen > blockEnd) break;
        const tableEnd = child + childLen;
        let item = align4(child + 6 + (readUtf16Z(bytes, child + 6, childLen - 6).length + 1) * 2);
        while (item + 6 <= tableEnd) {
          const itemLen = readUint16(view, item);
          if (itemLen < 6 || item + itemLen > tableEnd) break;
          const itemKey = readUtf16Z(bytes, item + 6, itemLen - 6);
          const valueOffset = align4(item + 6 + (itemKey.length + 1) * 2);
          const valueBytes = Math.min((readUint16(view, item) - (valueOffset - item)) & ~1, tableEnd - valueOffset);
          if (valueBytes > 0) strings[itemKey] = readUtf16Z(bytes, valueOffset, valueBytes).replace(/\0+$/, '');
          item = align4(item + itemLen);
        }
        child = align4(child + childLen);
      }
    } else if (blockKey !== 'VS_VERSION_INFO' && valLen === 0) {
      // Translation and string-table blocks have no direct value.
    }
    return align4(blockEnd);
  };
  // Walk the conventional VS_VERSION_INFO child blocks. Unknown blocks are skipped by their length.
  while (cursor + 6 <= end) {
    const len = readUint16(view, cursor);
    if (len < 6 || cursor + len > end) break;
    parseBlock(cursor, 0);
    cursor = align4(cursor + len);
  }
  return { fileVersion, productVersion, strings };
}

function parseVersionResource(
  bytes: Uint8Array, view: DataView, sections: readonly PeSection[], sizeOfHeaders: number,
  dir: PeDataDirectory | undefined,
): PeVersionResource | null {
  if (!dir) return null;
  const root = rvaToFileOffset(sections, dir.virtualAddress, sizeOfHeaders);
  if (root === null || !inBounds(bytes, root, 16)) return null;
  const walkDirectory = (offset: number, targetId: number, depth: number): number | null => {
    if (depth > 3 || !inBounds(bytes, offset, 16)) return null;
    const count = readUint16(view, offset + 12) + readUint16(view, offset + 14);
    if (count > 4096 || !inBounds(bytes, offset + 16, count * 8)) return null;
    for (let i = 0; i < count; i++) {
      const entry = offset + 16 + i * 8;
      const id = readUint32(view, entry);
      const child = readUint32(view, entry + 4);
      const isNamedEntry = (id & 0x80000000) !== 0;
      const matchesType = depth !== 0 || (!isNamedEntry && (id & 0xffff) === targetId);
      if (!matchesType) continue;
      if ((child & 0x80000000) !== 0) {
        const nested = walkDirectory(root + (child & 0x7fffffff), targetId, depth + 1);
        if (nested !== null) return nested;
      } else if (depth > 0) {
        const dataEntry = root + child;
        if (inBounds(bytes, dataEntry, 16)) return dataEntry;
      }
    }
    return null;
  };
  const dataEntry = walkDirectory(root, 16, 0);
  if (dataEntry === null) return null;
  const dataRva = readUint32(view, dataEntry);
  const dataSize = readUint32(view, dataEntry + 4);
  const dataOffset = rvaToFileOffset(sections, dataRva, sizeOfHeaders);
  return dataOffset === null ? null : parseVersionBlob(bytes, dataOffset, dataSize);
}

function parseClrHeader(bytes: Uint8Array, view: DataView, sections: readonly PeSection[], sizeOfHeaders: number, dir?: PeDataDirectory): PeClrHeader | null {
  if (!dir) return null;
  const offset = rvaToFileOffset(sections, dir.virtualAddress, sizeOfHeaders);
  if (offset === null || !inBounds(bytes, offset, 24)) return null;
  return {
    majorRuntimeVersion: readUint16(view, offset + 4), minorRuntimeVersion: readUint16(view, offset + 6),
    metadataRva: readUint32(view, offset + 8), metadataSize: readUint32(view, offset + 12),
    flags: readUint32(view, offset + 16), entryPointToken: readUint32(view, offset + 20),
  };
}

const DEBUG_TYPES: Record<number, string> = { 1: 'COFF', 2: 'CodeView', 3: 'FPO', 4: 'Misc', 5: 'Exception', 6: 'Fixup', 7: 'OMAP-to-source', 8: 'OMAP-from-source', 9: 'Borland', 10: 'Reserved10', 11: 'CLSID', 12: 'VC feature', 13: 'PGO', 14: 'ILTCG', 15: 'MPX', 16: 'Reproducible', 17: 'Embedded portable PDB', 18: 'SPGO', 19: 'PDB checksum', 20: 'Extended DLL characteristics', 21: 'Perf map' };

function parseDebugEntries(bytes: Uint8Array, view: DataView, sections: readonly PeSection[], sizeOfHeaders: number, dir?: PeDataDirectory): PeDebugEntry[] {
  if (!dir) return [];
  const start = rvaToFileOffset(sections, dir.virtualAddress, sizeOfHeaders);
  if (start === null) return [];
  const output: PeDebugEntry[] = [];
  const count = Math.min(Math.floor(dir.size / 28), 4096);
  for (let i = 0; i < count && inBounds(bytes, start + i * 28, 28); i++) {
    const p = start + i * 28;
    const dataSize = readUint32(view, p + 16);
    const dataRva = readUint32(view, p + 20);
    const rawOffset = readUint32(view, p + 24);
    const dataOffset = rawOffset !== 0 && inBounds(bytes, rawOffset, dataSize) ? rawOffset : rvaToFileOffset(sections, dataRva, sizeOfHeaders);
    const type = readUint32(view, p + 12);
    let signature: string | null = null;
    let pdbPath: string | null = null;
    let pdbGuid: string | null = null;
    let pdbAge: number | null = null;
    if (type === 2 && dataOffset !== null && inBounds(bytes, dataOffset, Math.min(dataSize, 4))) {
      signature = readCString(bytes, dataOffset, Math.min(dataSize, 4));
      if (signature === 'RSDS' && inBounds(bytes, dataOffset, 24)) {
        const guidBytes = bytes.slice(dataOffset + 4, dataOffset + 20);
        const guidView = new DataView(guidBytes.buffer, guidBytes.byteOffset, guidBytes.byteLength);
        pdbGuid = `${readUint32(guidView, 0).toString(16).padStart(8, '0')}-${readUint16(guidView, 4).toString(16).padStart(4, '0')}-${readUint16(guidView, 6).toString(16).padStart(4, '0')}-${Array.from(guidBytes.slice(8, 10), (b) => b.toString(16).padStart(2, '0')).join('')}-${Array.from(guidBytes.slice(10, 16), (b) => b.toString(16).padStart(2, '0')).join('')}`;
        pdbAge = readUint32(view, dataOffset + 20);
        pdbPath = readCString(bytes, dataOffset + 24, Math.max(0, dataSize - 24));
      } else if (signature === 'NB10' && inBounds(bytes, dataOffset, 16)) {
        pdbAge = readUint32(view, dataOffset + 12);
        pdbPath = readCString(bytes, dataOffset + 16, Math.max(0, dataSize - 16));
      }
    }
    output.push({ type, typeName: DEBUG_TYPES[type] ?? `Unknown (${type})`, timestamp: readUint32(view, p + 4), codeViewSignature: signature, pdbPath, pdbGuid, pdbAge });
  }
  return output;
}

export function parsePeHeaders(bytes: Uint8Array): PeReport | PeParseError {
  if (bytes.length < 64) return { isPe: false, error: 'File is too small to contain a DOS header.' };
  const view = dataViewOf(bytes);
  if (readUint16(view, 0) !== DOS_MAGIC) return { isPe: false, error: 'Missing "MZ" DOS header signature.' };
  const peOffset = readUint32(view, 0x3c);
  if (peOffset + 24 > bytes.length) return { isPe: false, error: 'PE header offset (e_lfanew) is out of range.' };
  if (readUint32(view, peOffset) !== PE_SIGNATURE) return { isPe: false, error: 'Missing "PE\\0\\0" signature at e_lfanew.' };
  const coffOffset = peOffset + 4;
  const machineCode = readUint16(view, coffOffset);
  const numberOfSections = readUint16(view, coffOffset + 2);
  const timeDateStamp = readUint32(view, coffOffset + 4);
  const sizeOfOptionalHeader = readUint16(view, coffOffset + 16);
  const characteristics = readUint16(view, coffOffset + 18);
  const optOffset = coffOffset + 20;
  if (!inBounds(bytes, optOffset, Math.min(sizeOfOptionalHeader, 2))) return { isPe: false, error: 'Optional header is out of range.' };
  const magicValue = sizeOfOptionalHeader >= 2 ? readUint16(view, optOffset) : 0;
  const isPe32Plus = magicValue === OPTIONAL_HEADER_PE32_PLUS;
  const optionalHeaderMagic: PeReport['optionalHeaderMagic'] = magicValue === OPTIONAL_HEADER_PE32 ? 'PE32' : isPe32Plus ? 'PE32+' : 'unknown';
  let addressOfEntryPoint = 0, sizeOfImage = 0, sizeOfHeaders = 0, subsystemCode = 0, numberOfRvaAndSizes = 0;
  let imageBase = 0n;
  let dataDirStart = 0;
  if (sizeOfOptionalHeader >= 96 && inBounds(bytes, optOffset, sizeOfOptionalHeader)) {
    addressOfEntryPoint = readUint32(view, optOffset + 16);
    if (isPe32Plus) {
      imageBase = readUint64(view, optOffset + 24);
      sizeOfImage = readUint32(view, optOffset + 56); sizeOfHeaders = readUint32(view, optOffset + 60);
      subsystemCode = readUint16(view, optOffset + 68);
      if (sizeOfOptionalHeader >= 112) { numberOfRvaAndSizes = readUint32(view, optOffset + 108); dataDirStart = optOffset + 112; }
    } else {
      imageBase = BigInt(readUint32(view, optOffset + 28));
      sizeOfImage = readUint32(view, optOffset + 56); sizeOfHeaders = readUint32(view, optOffset + 60);
      subsystemCode = readUint16(view, optOffset + 68);
      numberOfRvaAndSizes = readUint32(view, optOffset + 92); dataDirStart = optOffset + 96;
    }
  }
  const dataDirectories: PeDataDirectory[] = [];
  const directoryCount = Math.min(numberOfRvaAndSizes, DATA_DIRECTORY_NAMES.length, Math.floor(Math.max(0, optOffset + sizeOfOptionalHeader - dataDirStart) / 8));
  for (let i = 0; i < directoryCount; i++) {
    const entryOffset = dataDirStart + i * 8;
    dataDirectories.push({ name: DATA_DIRECTORY_NAMES[i], virtualAddress: readUint32(view, entryOffset), size: readUint32(view, entryOffset + 4) });
  }
  const sectionsStart = optOffset + sizeOfOptionalHeader;
  const sections: PeSection[] = [];
  for (let i = 0; i < numberOfSections; i++) {
    const entryOffset = sectionsStart + i * 40;
    if (!inBounds(bytes, entryOffset, 40)) break;
    let name = '';
    for (let j = 0; j < 8 && bytes[entryOffset + j] !== 0; j++) name += String.fromCharCode(bytes[entryOffset + j]);
    sections.push({ name, virtualSize: readUint32(view, entryOffset + 8), virtualAddress: readUint32(view, entryOffset + 12), sizeOfRawData: readUint32(view, entryOffset + 16), pointerToRawData: readUint32(view, entryOffset + 20), characteristics: readUint32(view, entryOffset + 36) });
  }
  const importModules = parseImports(bytes, view, sections, sizeOfHeaders, dataDirectories, imageBase, isPe32Plus, false);
  const delayLoadImports = parseImports(bytes, view, sections, sizeOfHeaders, dataDirectories, imageBase, isPe32Plus, true);
  const exportInfo = parseExports(bytes, view, sections, sizeOfHeaders, directory(dataDirectories, 'Export Table'));
  const certificate = directory(dataDirectories, 'Certificate Table');
  return {
    isPe: true,
    machine: MACHINE_NAMES[machineCode] ?? `unknown (0x${machineCode.toString(16)})`,
    numberOfSections,
    timestamp: timeDateStamp > 0 ? new Date(timeDateStamp * 1000).toISOString() : 'not set',
    characteristics, optionalHeaderMagic, addressOfEntryPoint, imageBase: '0x' + imageBase.toString(16),
    subsystem: SUBSYSTEM_NAMES[subsystemCode] ?? `unknown (${subsystemCode})`, sizeOfImage, sizeOfHeaders,
    dataDirectories, sections,
    importedDlls: importModules.map((module) => module.dll), importModules, delayLoadImports,
    exportDllName: exportInfo.dll, exportFunctionCount: exportInfo.functions, exportNameCount: exportInfo.names,
    exports: exportInfo.exports,
    versionResource: parseVersionResource(bytes, view, sections, sizeOfHeaders, directory(dataDirectories, 'Resource Table')),
    authenticode: { present: !!certificate, certificateTableSize: certificate?.size ?? 0 },
    clrHeader: parseClrHeader(bytes, view, sections, sizeOfHeaders, directory(dataDirectories, 'CLR Runtime Header')),
    debugEntries: parseDebugEntries(bytes, view, sections, sizeOfHeaders, directory(dataDirectories, 'Debug')),
  };
}
