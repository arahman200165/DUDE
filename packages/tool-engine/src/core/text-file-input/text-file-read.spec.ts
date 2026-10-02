import { describe, expect, it } from 'vitest';
import { MAX_TEXT_FILE_BYTES, acceptFromExtensions, describeBinaryPrefix, readTextFile, suggestSaveName } from "./text-file-read.js";

describe('describeBinaryPrefix', () => {
  it('accepts plain UTF-8 text', () => {
    expect(describeBinaryPrefix(new TextEncoder().encode('# Title\n\nünïcode ✓'))).toBeNull();
  });

  it('flags a NUL byte as binary', () => {
    expect(describeBinaryPrefix(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00]))).toMatch(/binary/);
  });

  it('flags UTF-16 by its BOM with a precise message', () => {
    expect(describeBinaryPrefix(new Uint8Array([0xff, 0xfe, 0x23, 0x00]))).toMatch(/UTF-16/);
    expect(describeBinaryPrefix(new Uint8Array([0xfe, 0xff, 0x00, 0x23]))).toMatch(/UTF-16/);
  });
});

describe('readTextFile', () => {
  it('returns the text and name, stripping a UTF-8 BOM', async () => {
    const file = new File([new Uint8Array([0xef, 0xbb, 0xbf]), '# Hello'], 'notes.md');
    expect(await readTextFile(file)).toEqual({ ok: true, text: '# Hello', name: 'notes.md' });
  });

  it('rejects files over the size cap without reading them', async () => {
    const result = await readTextFile(new File(['x'.repeat(20)], 'big.txt'), 10);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/big\.txt.*limit/);
  });

  it('rejects binary files', async () => {
    const result = await readTextFile(new File([new Uint8Array([1, 2, 0, 3])], 'image.png'));
    expect(result.ok).toBe(false);
  });

  it('defaults to a 10 MB cap', () => {
    expect(MAX_TEXT_FILE_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe('acceptFromExtensions', () => {
  it('joins extensions, or means "any file" when none are declared', () => {
    expect(acceptFromExtensions(['.yaml', '.yml'])).toBe('.yaml,.yml');
    expect(acceptFromExtensions(undefined)).toBe('');
  });
});

describe('suggestSaveName', () => {
  it('prefers an explicit name', () => {
    expect(suggestSaveName({ explicit: 'out.json', openedName: 'a.yaml', fallbackBase: 'yaml-json' })).toBe('out.json');
  });

  it('saves back under the opened file name, swapping the extension when the output differs', () => {
    expect(suggestSaveName({ openedName: 'notes.md', fallbackBase: 'markdown' })).toBe('notes.md');
    expect(suggestSaveName({ openedName: 'config.yaml', extension: '.json', fallbackBase: 'yaml-json' })).toBe('config.json');
    expect(suggestSaveName({ openedName: 'Dockerfile', fallbackBase: 'x', fallbackExtension: '.dockerfile' })).toBe('Dockerfile');
    expect(suggestSaveName({ openedName: '.env', fallbackBase: 'env-editor', fallbackExtension: '.env' })).toBe('.env');
    expect(suggestSaveName({ openedName: '.env', extension: '.json', fallbackBase: 'env-json' })).toBe('.env.json');
  });

  it('falls back to the tool id and its declared extension, then .txt', () => {
    expect(suggestSaveName({ fallbackBase: 'sql-formatter-tool', fallbackExtension: '.sql' })).toBe('sql-formatter-tool.sql');
    expect(suggestSaveName({ fallbackBase: 'diff' })).toBe('diff.txt');
  });
});
