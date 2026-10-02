import { findYamlAnchors } from "./yaml-anchors-transform.js";

describe('findYamlAnchors', () => {
  it('finds an anchor definition and its alias references', () => {
    const result = findYamlAnchors('base: &base\n  a: 1\nsame: *base\n');

    expect(result).toEqual({
      ok: true,
      anchors: [{ anchor: 'base', definitionPaths: ['base'], aliasPaths: ['same'] }],
    });
  });

  it('reports a merge-key alias path using its "<<" key', () => {
    const result = findYamlAnchors('base: &base\n  a: 1\nover:\n  <<: *base\n  b: 2\n');

    expect(result).toEqual({
      ok: true,
      anchors: [{ anchor: 'base', definitionPaths: ['base'], aliasPaths: ['over.<<'] }],
    });
  });

  it('reports an alias inside a sequence with a bracketed index', () => {
    const result = findYamlAnchors('base: &base\n  a: 1\nlist:\n  - *base\n');

    expect(result).toEqual({
      ok: true,
      anchors: [{ anchor: 'base', definitionPaths: ['base'], aliasPaths: ['list[0]'] }],
    });
  });

  it('lists multiple alias references to the same anchor', () => {
    const result = findYamlAnchors('base: &base 1\na: *base\nb: *base\n');

    expect(result).toEqual({
      ok: true,
      anchors: [{ anchor: 'base', definitionPaths: ['base'], aliasPaths: ['a', 'b'] }],
    });
  });

  it('returns an empty list for a document with no anchors', () => {
    const result = findYamlAnchors('a: 1\nb: 2\n');

    expect(result).toEqual({ ok: true, anchors: [] });
  });

  it('rejects empty input', () => {
    expect(findYamlAnchors('').ok).toBe(false);
    expect(findYamlAnchors('   ').ok).toBe(false);
  });

  it('reports a parse error for malformed YAML', () => {
    const result = findYamlAnchors('a: [1,2\n');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message.length > 0).toBe(true);
  });
});
