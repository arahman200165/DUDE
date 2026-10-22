import { describe, expect, it } from 'vitest';
import { utf8ByteLength } from './text-bytes';

describe('utf8ByteLength', () => {
  it('counts 1 to 4 byte characters', () => {
    expect(utf8ByteLength('')).toBe(0);
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('aé€\u{1F600}')).toBe(1 + 2 + 3 + 4);
  });
  it('counts lone surrogates as 3 bytes, like TextEncoder', () => {
    for (const text of ['\ud83d', '\ude00', 'a\ud83db', '\ude00\ud83d']) expect(utf8ByteLength(text)).toBe(new TextEncoder().encode(text).length);
  });
  it('matches TextEncoder for mixed text', () => {
    const text = 'Hello, wörld! € \u{1F4A9} \u{10FFFF} end';
    expect(utf8ByteLength(text)).toBe(new TextEncoder().encode(text).length);
  });
});
