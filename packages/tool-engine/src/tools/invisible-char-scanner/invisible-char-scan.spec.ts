import { scanInvisibleChars, stripInvisibleChars } from "./invisible-char-scan.js";

describe('scanInvisibleChars', () => {
  it('finds no occurrences in plain ASCII text', () => {
    expect(scanInvisibleChars('hello world')).toEqual([]);
  });

  it('does not flag tab, LF, or CR', () => {
    expect(scanInvisibleChars('a\tb\nc\rd')).toEqual([]);
  });

  it('flags a C0 control character', () => {
    const [occurrence] = scanInvisibleChars('a\u0000b');
    expect(occurrence).toMatchObject({ position: 1, kind: 'control', codePointHex: 'U+0000' });
  });

  it('flags a zero-width space', () => {
    const [occurrence] = scanInvisibleChars('a​b');
    expect(occurrence).toMatchObject({ position: 1, kind: 'zero-width', codePointHex: 'U+200B' });
  });

  it('flags a BOM/ZWNBSP as zero-width', () => {
    const [occurrence] = scanInvisibleChars('﻿hello');
    expect(occurrence.kind).toBe('zero-width');
  });

  it('flags a bidi override as invisible', () => {
    const [occurrence] = scanInvisibleChars('a‮b');
    expect(occurrence.kind).toBe('invisible');
  });

  it('reports position by code point index, not UTF-16 index', () => {
    const [occurrence] = scanInvisibleChars('😀​');
    expect(occurrence.position).toBe(1);
  });

  it('includes a resolved name for each occurrence', () => {
    const [occurrence] = scanInvisibleChars('\u0000');
    expect(occurrence.name).not.toBe('');
  });
});

describe('stripInvisibleChars', () => {
  it('removes only the selected kinds', () => {
    const input = 'a​b\u0000c';
    expect(stripInvisibleChars(input, new Set(['zero-width']))).toBe('ab\u0000c');
    expect(stripInvisibleChars(input, new Set(['control']))).toBe('a​bc');
  });

  it('removes every flagged kind when all are selected', () => {
    const input = 'a​b\u0000c‮d';
    expect(stripInvisibleChars(input, new Set(['zero-width', 'control', 'invisible']))).toBe('abcd');
  });

  it('leaves ordinary text untouched when no kinds are selected', () => {
    const input = 'a​b';
    expect(stripInvisibleChars(input, new Set())).toBe(input);
  });
});
