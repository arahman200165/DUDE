import { identifyZipContainer, sniffFileType } from "@dude/shared-types/shared/utils/file-signatures";

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function textBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('sniffFileType', () => {
  it('detects PNG', () => {
    expect(sniffFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))?.mime).toBe('image/png');
  });

  it('detects JPEG', () => {
    expect(sniffFileType(bytes(0xff, 0xd8, 0xff, 0xe0))?.mime).toBe('image/jpeg');
  });

  it('detects ICO, distinct from the similar-looking GIF check', () => {
    expect(sniffFileType(bytes(0x00, 0x00, 0x01, 0x00, 0x01, 0x00))?.mime).toBe('image/x-icon');
  });

  it('detects little-endian TIFF', () => {
    expect(sniffFileType(bytes(0x49, 0x49, 0x2a, 0x00))?.mime).toBe('image/tiff');
  });

  it('detects big-endian TIFF', () => {
    expect(sniffFileType(bytes(0x4d, 0x4d, 0x00, 0x2a))?.mime).toBe('image/tiff');
  });

  it('detects ZIP and honestly notes the ZIP-family collision', () => {
    const result = sniffFileType(bytes(0x50, 0x4b, 0x03, 0x04));
    expect(result?.mime).toBe('application/zip');
    expect(result?.note).toMatch(/docx|zip-family/i);
  });

  it('detects gzip', () => {
    expect(sniffFileType(bytes(0x1f, 0x8b, 0x08, 0x00))?.mime).toBe('application/gzip');
  });

  it('detects 7z', () => {
    expect(sniffFileType(bytes(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0x00, 0x04))?.mime).toBe('application/x-7z-compressed');
  });

  it('detects sqlite', () => {
    const sqlite = textBytes('SQLite format 3\u0000');
    expect(sniffFileType(sqlite)?.mime).toBe('application/vnd.sqlite3');
  });

  it('detects a Java class file and discloses the Mach-O fat-binary ambiguity', () => {
    const result = sniffFileType(bytes(0xca, 0xfe, 0xba, 0xbe, 0x00, 0x00, 0x00, 0x34));
    expect(result?.extension).toBe('class');
    expect(result?.note).toMatch(/mach-o/i);
  });

  it('detects WASM', () => {
    expect(sniffFileType(bytes(0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00))?.mime).toBe('application/wasm');
  });

  it('detects a PE/MZ executable', () => {
    expect(sniffFileType(bytes(0x4d, 0x5a, 0x90, 0x00))?.extension).toBe('exe');
  });

  it('detects an ELF binary', () => {
    expect(sniffFileType(bytes(0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01))?.extension).toBe('elf');
  });

  it('detects a 64-bit little-endian Mach-O binary', () => {
    const result = sniffFileType(bytes(0xcf, 0xfa, 0xed, 0xfe));
    expect(result?.mime).toBe('application/x-mach-binary');
    expect(result?.note).toMatch(/64-bit/i);
  });

  it('returns null for plain text with no magic bytes', () => {
    expect(sniffFileType(textBytes('hello world'))).toBeNull();
  });

  it('returns null for an empty buffer', () => {
    expect(sniffFileType(bytes())).toBeNull();
  });
});

describe('identifyZipContainer', () => {
  it('identifies a docx by its internal document.xml path', () => {
    const fake = textBytes('PK\u0003\u0004garbageword/document.xmlmore garbage');
    expect(identifyZipContainer(fake)).toBe('docx');
  });

  it('identifies an xlsx by its internal workbook.xml path', () => {
    const fake = textBytes('PK\u0003\u0004xl/workbook.xml');
    expect(identifyZipContainer(fake)).toBe('xlsx');
  });

  it('identifies a jar by its MANIFEST.MF path', () => {
    const fake = textBytes('PK\u0003\u0004META-INF/MANIFEST.MF');
    expect(identifyZipContainer(fake)).toBe('jar');
  });

  it('falls back to a generic OOXML label when only [Content_Types].xml is present', () => {
    const fake = textBytes('PK\u0003\u0004[Content_Types].xml');
    expect(identifyZipContainer(fake)).toBe('ooxml (unspecified)');
  });

  it('returns null for a plain zip with no recognizable internal paths', () => {
    const fake = textBytes('PK\u0003\u0004readme.txtsome file contents');
    expect(identifyZipContainer(fake)).toBeNull();
  });
});
