import { describe, expect, it } from 'vitest';
import { processJson } from '@dude/tool-engine/tools/json/json-format';
import { decodeIndent, decodeMode, describeJsonError, SAMPLE_JSON, toOutcome, utf8ByteLength } from './json-mobile';

describe('json mobile helpers', () => {
  it('decodes the web indent values and rejects others', () => {
    expect(decodeIndent(2)).toBe(2);
    expect(decodeIndent(4)).toBe(4);
    expect(decodeIndent('tab')).toBe('tab');
    expect(decodeIndent('4')).toBe(4);
    expect(decodeIndent(3)).toBeNull();
    expect(decodeMode('minify')).toBe('minify');
    expect(decodeMode('tree')).toBeNull();
  });
  it('appends line and column once', () => {
    expect(describeJsonError({ message: 'bad', line: 2, column: 5 })).toBe('bad (line 2, column 5)');
    expect(describeJsonError({ message: 'bad at line 2 column 5', line: 2, column: 5 })).toBe('bad at line 2 column 5');
    expect(describeJsonError({ message: 'bad' })).toBe('bad');
  });
  it('formats the sample with the engine and fails invalid input', () => {
    expect(toOutcome(processJson(SAMPLE_JSON, 'pretty', 2))).toEqual({ ok: true, output: '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}' });
    expect(toOutcome(processJson('{a:1}', 'pretty', 2)).ok).toBe(false);
  });
  it('counts UTF-8 bytes', () => {
    expect(utf8ByteLength('aé€\u{1F600}')).toBe(1 + 2 + 3 + 4);
  });
});
