import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { convertYaml } from "./yaml-convert.js";

describe('convertYaml', () => {
  it('converts the nested deployment-shaped golden corpus', () => {
    const input = readFileSync(resolve(process.cwd(), 'packages/tool-engine/src/tools/yaml-json/__fixtures__/service-deployment.yaml'), 'utf8');
    const result = convertYaml(input, 'yaml-to-json', 2);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    const parsed: unknown = JSON.parse(result.output);
    expect(parsed).toEqual({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: 'workbench', labels: { app: 'workbench' } },
      spec: {
        replicas: 2,
        selector: { matchLabels: { app: 'workbench' } },
        template: {
          metadata: { labels: { app: 'workbench' } },
          spec: { containers: [{ name: 'web', image: 'example.invalid/workbench:1.2.3', ports: [{ name: 'http', containerPort: 8080 }] }] },
        },
      },
    });
  });
  it('converts YAML to pretty-printed JSON with a 2-space indent', () => {
    const result = convertYaml('a: 1\nb:\n  - 2\n  - 3\n', 'yaml-to-json', 2);

    expect(result).toEqual({ ok: true, output: '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}' });
  });

  it('converts YAML to JSON with a tab indent', () => {
    const result = convertYaml('a: 1\n', 'yaml-to-json', 'tab');

    expect(result).toEqual({ ok: true, output: '{\n\t"a": 1\n}' });
  });

  it('converts JSON to YAML', () => {
    const result = convertYaml('{"a":1,"b":[2,3]}', 'json-to-yaml', 2);

    expect(result).toEqual({ ok: true, output: 'a: 1\nb:\n  - 2\n  - 3\n' });
  });

  it('rejects empty input for either direction', () => {
    expect(convertYaml('', 'yaml-to-json', 2).ok).toBe(false);
    expect(convertYaml('   ', 'json-to-yaml', 2).ok).toBe(false);
  });

  it('reports a parse error for malformed YAML', () => {
    const result = convertYaml('a: [1,2\n', 'yaml-to-json', 2);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message.length > 0).toBe(true);
  });

  it('reports a parse error for malformed JSON', () => {
    const result = convertYaml('{"a": }', 'json-to-yaml', 2);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message.length > 0).toBe(true);
  });

  it('round-trips a nested structure', () => {
    const json = '{"name":"DUDE","tags":["dev","tools"],"active":true}';
    const toYaml = convertYaml(json, 'json-to-yaml', 2);
    expect(toYaml.ok).toBe(true);

    const backToJson = toYaml.ok ? convertYaml(toYaml.output, 'yaml-to-json', 2) : null;
    expect(backToJson).toEqual({ ok: true, output: JSON.stringify(JSON.parse(json), null, '  ') });
  });
});

describe('fuzzing (DUDE_PRD.md §21 Phase 23 Item 5)', () => {
  it('never throws for arbitrary text input, in either direction', () => {
    fc.assert(
      fc.property(fc.string(), fc.constantFrom<'yaml-to-json' | 'json-to-yaml'>('yaml-to-json', 'json-to-yaml'), (input, direction) => {
        expect(() => convertYaml(input, direction, 2)).not.toThrow();
      }),
    );
  });
});
