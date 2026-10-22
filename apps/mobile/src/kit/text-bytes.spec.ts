import { describe, expect, it } from 'vitest';
import { checkInputBudget, formatInputSize, inputBudgetMessage, utf8ByteLength } from './text-bytes';

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

describe('input budget helpers', () => {
  it('formats KB below 1 MiB (rounded up) and MB above', () => {
    expect(formatInputSize(128 * 1024)).toBe('128 KB');
    expect(formatInputSize(128 * 1024 + 1)).toBe('129 KB');
    expect(formatInputSize(1024 * 1024)).toBe('1 MB');
    expect(formatInputSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });
  it('builds the message and returns null at or under the budget', () => {
    expect(inputBudgetMessage(300 * 1024, 128 * 1024)).toBe('Input is 300 KB; this tool handles up to 128 KB on Android.');
    expect(checkInputBudget('a'.repeat(100), 100)).toBeNull();
    expect(checkInputBudget('a'.repeat(101), 100)).toBe('Input is 1 KB; this tool handles up to 1 KB on Android.');
    expect(checkInputBudget('�'.repeat(34), 100)).not.toBeNull();
    expect(checkInputBudget('�'.repeat(33), 100)).toBeNull();
  });
});
