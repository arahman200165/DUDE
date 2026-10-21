import { describe, expect, it } from 'vitest';
import { convertYaml } from '@dude/tool-engine/tools/yaml-json/yaml-convert';
import { decodeDirection, decodeIndent, flipDirection, SAMPLES, toOutcome, utf8ByteLength } from './yaml-json-mobile';

describe('yaml-json mobile helpers', () => {
  it('decodes the web direction and indent values', () => {
    expect(decodeDirection('json-to-yaml')).toBe('json-to-yaml');
    expect(decodeDirection('x')).toBeNull();
    expect(decodeIndent(4)).toBe(4);
    expect(decodeIndent('tab')).toBe('tab');
    expect(decodeIndent(3)).toBeNull();
    expect(flipDirection('yaml-to-json')).toBe('json-to-yaml');
  });
  it('converts both samples with the engine', () => {
    expect(toOutcome(convertYaml(SAMPLES['yaml-to-json'], 'yaml-to-json', 2))).toEqual({ ok: true, output: '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}' });
    expect(toOutcome(convertYaml(SAMPLES['json-to-yaml'], 'json-to-yaml', 2))).toEqual({ ok: true, output: 'a: 1\nb:\n  - 2\n  - 3\n' });
  });
  it('reports the invalid inputs used by the Maestro journey', () => {
    expect(toOutcome(convertYaml('a: [1, 2', 'yaml-to-json', 2)).ok).toBe(false);
    expect(toOutcome(convertYaml('{a:1}', 'json-to-yaml', 2)).ok).toBe(false);
  });
  it('counts UTF-8 bytes', () => {
    expect(utf8ByteLength('aé€\u{1F600}')).toBe(1 + 2 + 3 + 4);
  });
});
