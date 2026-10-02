import { describe, expect, it } from 'vitest';
import { formatHexDump, parseHexDump } from "./hex-dump-codec.js";

describe('formatHexDump', () => {
  it('formats a short buffer with offset, hex, and ASCII columns', () => {
    const bytes = new TextEncoder().encode('Hello, world!');
    const dump = formatHexDump(bytes);
    const lines = dump.split('\n');
    expect(lines[0]).toBe('00000000  48 65 6c 6c 6f 2c 20 77  6f 72 6c 64 21           |Hello, world!|');
    expect(lines[1]).toBe('0000000d');
  });

  it('renders non-printable bytes as a dot', () => {
    const dump = formatHexDump(new Uint8Array([0, 1, 255]));
    expect(dump.split('\n')[0]).toContain('|...|');
  });

  it('wraps at 16 bytes per line', () => {
    const bytes = new Uint8Array(20).fill(0x41);
    const lines = formatHexDump(bytes).split('\n');
    expect(lines).toHaveLength(3); // two data lines + trailing offset line
    expect(lines[1].startsWith('00000010')).toBe(true);
    expect(lines[2]).toBe('00000014');
  });

  it('handles an empty buffer', () => {
    expect(formatHexDump(new Uint8Array())).toBe('00000000');
  });
});

describe('parseHexDump', () => {
  it('round-trips formatHexDump output', () => {
    const bytes = new TextEncoder().encode('The quick brown fox jumps over the lazy dog.');
    const dump = formatHexDump(bytes);
    const parsed = parseHexDump(dump);
    expect(parsed.ok && Array.from(parsed.value)).toEqual(Array.from(bytes));
  });

  it('round-trips an empty dump', () => {
    const parsed = parseHexDump(formatHexDump(new Uint8Array()));
    expect(parsed.ok && Array.from(parsed.value)).toEqual([]);
  });

  it('rejects an invalid hex token', () => {
    expect(parseHexDump('00000000  zz 65 6c 6c            |xell|').ok).toBe(false);
  });
});
