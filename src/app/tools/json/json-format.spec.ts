import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { processJson } from './json-format';

describe('processJson', () => {
  it('formats the package-manifest golden corpus without changing its values', () => {
    const input = readFileSync(resolve(process.cwd(), 'src/app/tools/json/__fixtures__/project-metadata.json'), 'utf8');
    const result = processJson(input, 'pretty', 2);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(JSON.parse(result.output)).toEqual({
      name: '@dude/workbench',
      private: true,
      engines: { node: '>=22' },
      scripts: { test: 'vitest run', lint: 'eslint .' },
      keywords: ['developer', 'offline', 'tools'],
    });
    expect(result.output).toContain('\n  "engines": {');
  });
  it('pretty-prints with a 2-space indent', () => {
    const result = processJson('{"a":1,"b":[2,3]}', 'pretty', 2);

    expect(result).toEqual({ ok: true, output: '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}' });
  });

  it('pretty-prints with a tab indent', () => {
    const result = processJson('{"a":1}', 'pretty', 'tab');

    expect(result).toEqual({ ok: true, output: '{\n\t"a": 1\n}' });
  });

  it('minifies formatted JSON', () => {
    const result = processJson('{\n  "a": 1\n}', 'minify', 2);

    expect(result).toEqual({ ok: true, output: '{"a":1}' });
  });

  it('validate mode returns the original input unchanged when valid', () => {
    const input = '{"a": 1}';
    expect(processJson(input, 'validate', 2)).toEqual({ ok: true, output: input });
  });

  it('rejects empty input', () => {
    expect(processJson('', 'pretty', 2).ok).toBe(false);
    expect(processJson('   ', 'pretty', 2).ok).toBe(false);
  });

  it('reports a parse error for malformed JSON', () => {
    const result = processJson('{"a": }', 'pretty', 2);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message.length > 0).toBe(true);
  });

  it('formats a top-level JSON array', () => {
    const result = processJson('[1,2,3]', 'pretty', 2);

    expect(result).toEqual({ ok: true, output: '[\n  1,\n  2,\n  3\n]' });
  });

  it('formats a top-level JSON primitive', () => {
    expect(processJson('42', 'minify', 2)).toEqual({ ok: true, output: '42' });
    expect(processJson('"just a string"', 'minify', 2)).toEqual({ ok: true, output: '"just a string"' });
  });

  it('locates a line/column for a malformed JSON error when the engine reports a position', () => {
    const result = processJson('{\n  "a": ,\n}', 'pretty', 2);

    expect(result.ok).toBe(false);
    if (!result.ok && result.error.line !== undefined) {
      expect(result.error.line).toBeGreaterThan(0);
      expect(result.error.column).toBeGreaterThan(0);
    }
  });
});

describe('fuzzing (DUDE_PRD.md §21 Phase 23 Item 5)', () => {
  it('never throws for arbitrary text input, in any mode', () => {
    fc.assert(
      fc.property(fc.string(), fc.constantFrom<'pretty' | 'minify' | 'validate'>('pretty', 'minify', 'validate'), (input, mode) => {
        expect(() => processJson(input, mode, 2)).not.toThrow();
      }),
    );
  });
});
