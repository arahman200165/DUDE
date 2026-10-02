import { mergeYaml } from "./yaml-merge-transform.js";

describe('mergeYaml', () => {
  it('deep-merges nested mappings, with overlay keys winning', () => {
    const result = mergeYaml('a: 1\nnested:\n  x: 1\n  y: 2\n', 'b: 2\nnested:\n  y: 3\n  z: 4\n');

    expect(result).toEqual({ ok: true, output: "a: 1\nnested:\n  x: 1\n  'y': 3\n  z: 4\nb: 2\n" });
  });

  it('replaces sequences wholesale', () => {
    const result = mergeYaml('tags:\n  - a\n  - b\n', 'tags:\n  - c\n');

    expect(result).toEqual({ ok: true, output: 'tags:\n  - c\n' });
  });

  it('rejects empty base or overlay input', () => {
    expect(mergeYaml('', 'a: 1\n').ok).toBe(false);
    expect(mergeYaml('a: 1\n', '   ').ok).toBe(false);
  });

  it('reports which side failed to parse', () => {
    const baseError = mergeYaml('a: [1,2\n', 'b: 1\n');
    expect(baseError.ok).toBe(false);
    expect(!baseError.ok && baseError.error.message.startsWith('base YAML is invalid')).toBe(true);

    const overlayError = mergeYaml('a: 1\n', 'b: [1,2\n');
    expect(overlayError.ok).toBe(false);
    expect(!overlayError.ok && overlayError.error.message.startsWith('overlay YAML is invalid')).toBe(true);
  });
});
