import { DEFAULT_NORMALIZE, decodeText, isProbablyBinary, normalizeText } from "../../shared/fs/text-normalize.js";
import { groupsToCsv, keeperOf, selectByRule, trashCandidates, type DuplicateGroup } from "./duplicate-rules.js";

const group: DuplicateGroup = {
  key: 'k', size: 10, wasted: 20, identicalBytes: true,
  files: [
    { path: 'backup/old/photo.jpg', size: 10, mtimeMs: 100 },
    { path: 'photo.jpg', size: 10, mtimeMs: 300 },
    { path: 'keep/photo.jpg', size: 10, mtimeMs: 200 },
  ],
};

describe('duplicate keep rules', () => {
  it('picks one keeper per rule', () => {
    expect(keeperOf(group, 'oldest').path).toBe('backup/old/photo.jpg');
    expect(keeperOf(group, 'newest').path).toBe('photo.jpg');
    expect(keeperOf(group, 'shortest-path').path).toBe('photo.jpg');
    expect(keeperOf(group, 'longest-path').path).toBe('backup/old/photo.jpg');
    expect(keeperOf(group, 'alphabetical').path).toBe('backup/old/photo.jpg');
    expect(keeperOf(group, 'in-folder', 'keep\\').path).toBe('keep/photo.jpg');
    expect(keeperOf(group, 'in-folder', 'nowhere').path).toBe('backup/old/photo.jpg');
  });

  it('selects every copy but the keeper, and refuses to remove all copies of a group', () => {
    const selected = selectByRule([group], 'newest');
    expect([...selected].sort()).toEqual(['backup/old/photo.jpg', 'keep/photo.jpg']);
    expect(trashCandidates([group], selected)).toEqual({ paths: ['backup/old/photo.jpg', 'keep/photo.jpg'], bytes: 20 });
    expect(() => trashCandidates([group], new Set(group.files.map((file) => file.path)))).toThrow(/keep at least one/);
    expect(groupsToCsv([group]).split('\n')[1]).toBe('1,backup/old/photo.jpg,10,1970-01-01T00:00:00.100Z,true');
  });
});

describe('text normalization for content groups', () => {
  const encode = (text: string) => new TextEncoder().encode(text);
  it('treats CRLF/LF, trailing whitespace, a BOM, and a final newline as the same content', () => {
    const a = normalizeText(decodeText(encode('﻿line one  \r\nline two\r\n')), DEFAULT_NORMALIZE);
    const b = normalizeText(decodeText(encode('line one\nline two')), DEFAULT_NORMALIZE);
    expect(a).toBe(b);
    expect(normalizeText('A B\nc', { ...DEFAULT_NORMALIZE, allWhitespace: true, caseInsensitive: true })).toBe('abc');
  });

  it('decodes UTF-16 with a BOM and detects binary files by NUL bytes', () => {
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00]))).toBe('hi');
    expect(isProbablyBinary(new Uint8Array([0xff, 0xfe, 0x68, 0x00]))).toBe(false);
    expect(isProbablyBinary(new Uint8Array([0x89, 0x50, 0x00, 0x47]))).toBe(true);
    expect(isProbablyBinary(encode('plain'))).toBe(false);
  });
});
