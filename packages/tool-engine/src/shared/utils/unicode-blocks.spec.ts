import { blockNameOf } from "./unicode-blocks.js";

describe('blockNameOf', () => {
  it('resolves Basic Latin', () => {
    expect(blockNameOf('A'.codePointAt(0)!)).toBe('Basic Latin');
  });

  it('resolves a block boundary exactly (start and end inclusive)', () => {
    expect(blockNameOf(0x0080)).toBe('Latin-1 Supplement');
    expect(blockNameOf(0x00ff)).toBe('Latin-1 Supplement');
  });

  it('resolves CJK Unified Ideographs', () => {
    expect(blockNameOf('丁'.codePointAt(0)!)).toBe('CJK Unified Ideographs');
  });

  it('resolves a supplementary-plane emoji block', () => {
    const [emoji] = Array.from('😀');
    expect(blockNameOf(emoji.codePointAt(0)!)).toBe('Emoticons');
  });

  it('resolves the last valid code point of the highest listed block', () => {
    expect(blockNameOf(0x10fffd)).toBe('Supplementary Private Use Area-B');
  });

  it('falls back to Unassigned / Other outside every listed range', () => {
    expect(blockNameOf(0x10ffff)).toBe('Unassigned / Other');
    expect(blockNameOf(0xffffffff)).toBe('Unassigned / Other');
  });
});
