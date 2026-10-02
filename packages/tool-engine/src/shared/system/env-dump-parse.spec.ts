import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseEnvDump } from "./env-dump-parse.js";

describe('parseEnvDump', () => {
  it('parses set output, keeping order and splitting on the first =', () => {
    const map = parseEnvDump('ComSpec=C:\\Windows\\system32\\cmd.exe\r\nFOO=a=b\r\nEMPTY=\r\n');
    expect([...map]).toEqual([['ComSpec', 'C:\\Windows\\system32\\cmd.exe'], ['FOO', 'a=b'], ['EMPTY', '']]);
  });

  it('ignores blanks, comments and =-prefixed drive entries', () => {
    const map = parseEnvDump('# note\n; note\n\n=C:=C:\\work\n=ExitCode=00000000\nA=1');
    expect([...map]).toEqual([['A', '1']]);
  });

  it('handles .env shapes: export prefix and quoted values', () => {
    const map = parseEnvDump('export A="x y"\nB=\'z\'\nC=plain');
    expect([...map]).toEqual([['A', 'x y'], ['B', 'z'], ['C', 'plain']]);
  });

  it('parses a JSON object, stringifying non-strings', () => {
    expect([...parseEnvDump('{"A":"1","N":2}')]).toEqual([['A', '1'], ['N', '2']]);
    expect(() => parseEnvDump('{oops')).toThrow();
  });

  it('a later duplicate (case-insensitive) replaces the earlier one', () => {
    expect([...parseEnvDump('Path=1\nPATH=2')]).toEqual([['PATH', '2']]);
  });

  it('never throws on arbitrary non-JSON text', () => {
    fc.assert(fc.property(fc.string().filter((s) => !s.trim().startsWith('{')), (text) => {
      expect(parseEnvDump(text)).toBeInstanceOf(Map);
    }));
  });
});
