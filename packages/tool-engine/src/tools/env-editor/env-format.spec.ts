import { envToObject, parseEnv, serializeEnv } from "./env-format.js";

describe('parseEnv', () => {
  it('parses simple KEY=VALUE lines', () => {
    expect(parseEnv('FOO=bar\nBAZ=qux')).toEqual([
      { key: 'FOO', value: 'bar' },
      { key: 'BAZ', value: 'qux' },
    ]);
  });

  it('strips an "export " prefix', () => {
    expect(parseEnv('export FOO=bar')).toEqual([{ key: 'FOO', value: 'bar' }]);
  });

  it('unquotes a double-quoted value and unescapes it', () => {
    expect(parseEnv('FOO="line1\\nline2"')).toEqual([{ key: 'FOO', value: 'line1\nline2' }]);
  });

  it('treats a single-quoted value literally', () => {
    expect(parseEnv("FOO='no \\n escapes here'")).toEqual([{ key: 'FOO', value: 'no \\n escapes here' }]);
  });

  it('skips comments and blank lines', () => {
    expect(parseEnv('# comment\n\nFOO=bar\n')).toEqual([{ key: 'FOO', value: 'bar' }]);
  });

  it('returns an empty list for empty input', () => {
    expect(parseEnv('')).toEqual([]);
  });
});

describe('serializeEnv', () => {
  it('serializes plain values unquoted', () => {
    expect(serializeEnv([{ key: 'FOO', value: 'bar' }])).toBe('FOO=bar');
  });

  it('quotes a value containing whitespace', () => {
    expect(serializeEnv([{ key: 'FOO', value: 'hello world' }])).toBe('FOO="hello world"');
  });

  it('escapes embedded quotes and newlines', () => {
    expect(serializeEnv([{ key: 'FOO', value: 'say "hi"\nline2' }])).toBe('FOO="say \\"hi\\"\\nline2"');
  });

  it('round-trips through parseEnv', () => {
    const pairs = [
      { key: 'A', value: 'plain' },
      { key: 'B', value: 'has space' },
    ];
    expect(parseEnv(serializeEnv(pairs))).toEqual(pairs);
  });
});

describe('envToObject', () => {
  it('converts to a flat key-value object', () => {
    expect(envToObject('FOO=bar\nBAZ=qux')).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });
});
