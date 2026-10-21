import { describe, expect, it } from 'vitest';
import {
  assertWithinLimit, DEFAULT_FILE_INPUT_BYTES, defaultOutputName, fileInputLimitFor, FileInputError, MAX_FILE_NAME_LENGTH, sanitizeFileName, validateTextContent,
} from './file-io-core';

describe('fileInputLimitFor', () => {
  const metadata = [
    { id: 'json', fileInput: { extensions: ['.json'] } },
    { id: 'big', fileInput: { extensions: ['.csv'], maxBytes: 5_000_000.9 } },
    { id: 'bad', fileInput: { extensions: [], maxBytes: -1 } },
    { id: 'base64' },
  ];
  it('uses the manifest fileInput and defaults to 2 MiB', () => {
    expect(fileInputLimitFor('json', metadata)).toEqual({ supported: true, maxBytes: 2 * 1024 * 1024, extensions: ['.json'] });
    expect(DEFAULT_FILE_INPUT_BYTES).toBe(2 * 1024 * 1024);
  });
  it('honours an explicit limit and ignores an invalid one', () => {
    expect(fileInputLimitFor('big', metadata).maxBytes).toBe(5_000_000);
    expect(fileInputLimitFor('bad', metadata).maxBytes).toBe(DEFAULT_FILE_INPUT_BYTES);
  });
  it('reports tools without fileInput (or unknown) as unsupported with the default cap', () => {
    expect(fileInputLimitFor('base64', metadata)).toEqual({ supported: false, maxBytes: DEFAULT_FILE_INPUT_BYTES, extensions: [] });
    expect(fileInputLimitFor('nope', metadata).supported).toBe(false);
  });
  it('resolves against the real registry', () => {
    const limit = fileInputLimitFor('json');
    expect(limit.maxBytes).toBe(DEFAULT_FILE_INPUT_BYTES);
    expect(typeof limit.supported).toBe('boolean');
  });
});

describe('assertWithinLimit', () => {
  it('rejects files over the limit with a clear message', () => {
    expect(() => assertWithinLimit('big.json', 3 * 1024 * 1024, DEFAULT_FILE_INPUT_BYTES)).toThrow(FileInputError);
    expect(() => assertWithinLimit('big.json', 3 * 1024 * 1024, DEFAULT_FILE_INPUT_BYTES)).toThrow('"big.json" is 3.0 MB; the limit for this tool is 2.0 MB.');
  });
  it('accepts a file exactly at the limit and an unknown size', () => {
    expect(() => assertWithinLimit('a.txt', DEFAULT_FILE_INPUT_BYTES, DEFAULT_FILE_INPUT_BYTES)).not.toThrow();
    expect(() => assertWithinLimit('a.txt', undefined, 10)).not.toThrow();
    expect(() => assertWithinLimit('a.txt', null, 10)).not.toThrow();
  });
});

describe('validateTextContent', () => {
  it('strips a UTF-8 BOM and keeps the rest', () => { expect(validateTextContent('a.txt', '\uFEFFhello')).toBe('hello'); });
  it('rejects NUL bytes (binary) and UTF-16 (decoded BOM)', () => {
    expect(() => validateTextContent('a.bin', 'ab\u0000cd')).toThrow('binary');
    expect(() => validateTextContent('a.txt', '\uFFFD\uFFFDh\u0000i')).toThrow('UTF-16');
  });
});

describe('sanitizeFileName', () => {
  it('keeps simple names', () => { expect(sanitizeFileName('notes.md')).toBe('notes.md'); });
  it('removes path separators and traversal', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd.txt');
    expect(sanitizeFileName('C:\\Users\\me\\out.json')).toBe('out.json');
    expect(sanitizeFileName('a/b\\c.json')).not.toMatch(/[\\/]/);
  });
  it('drops control and reserved characters and leading/trailing dots', () => {
    expect(sanitizeFileName('we<ir>d:"n|a?m*e\u0007.txt')).toBe('weirdname.txt');
    expect(sanitizeFileName('...hidden..')).toBe('hidden.txt');
  });
  it('always yields a safe extension', () => {
    expect(sanitizeFileName('noext')).toBe('noext.txt');
    expect(sanitizeFileName('noext', 'x', '.json')).toBe('noext.json');
    expect(sanitizeFileName('a.b c')).toBe('a.b c.txt');
    expect(sanitizeFileName('archive.TAR')).toBe('archive.tar');
    expect(sanitizeFileName('file.', 'x', 'bad ext')).toBe('file.txt');
  });
  it('limits the length including the extension', () => {
    const name = sanitizeFileName(`${'a'.repeat(500)}.json`);
    expect(name.length).toBe(MAX_FILE_NAME_LENGTH);
    expect(name.endsWith('.json')).toBe(true);
  });
  it('falls back for empty and reserved names', () => {
    expect(sanitizeFileName('')).toBe('dude-output.txt');
    expect(sanitizeFileName('///')).toBe('dude-output.txt');
    expect(sanitizeFileName('CON.txt')).toBe('dude-output.txt');
    expect(sanitizeFileName('.', 'tool')).toBe('tool.txt');
  });
  it('builds the default output name from the tool id', () => {
    expect(defaultOutputName('base64')).toBe('base64-output.txt');
    expect(defaultOutputName('../x')).toBe('x-output.txt');
  });
});
