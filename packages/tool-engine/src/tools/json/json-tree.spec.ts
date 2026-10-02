import { buildJsonTree, toTreeNode } from "./json-tree.js";

describe('buildJsonTree', () => {
  it('builds a leaf node for a primitive', () => {
    expect(buildJsonTree(42)).toEqual({ key: '$', path: '$', segments: [], type: 'number', value: 42 });
    expect(buildJsonTree('hi')).toEqual({ key: '$', path: '$', segments: [], type: 'string', value: 'hi' });
    expect(buildJsonTree(null)).toEqual({ key: '$', path: '$', segments: [], type: 'null', value: null });
    expect(buildJsonTree(true)).toEqual({ key: '$', path: '$', segments: [], type: 'boolean', value: true });
  });

  it('builds nested object paths with dot notation', () => {
    const tree = buildJsonTree({ a: { b: 1 } });

    expect(tree.type).toBe('object');
    expect(tree.children).toEqual([
      {
        key: 'a',
        path: '$.a',
        segments: ['a'],
        type: 'object',
        value: { b: 1 },
        children: [{ key: 'b', path: '$.a.b', segments: ['a', 'b'], type: 'number', value: 1 }],
      },
    ]);
  });

  it('builds array element paths with bracket notation', () => {
    const tree = buildJsonTree([1, 2]);

    expect(tree.type).toBe('array');
    expect(tree.children).toEqual([
      { key: '0', path: '$[0]', segments: [0], type: 'number', value: 1 },
      { key: '1', path: '$[1]', segments: [1], type: 'number', value: 2 },
    ]);
  });

  it('mixes object and array nesting in paths', () => {
    const tree = buildJsonTree({ items: [{ name: 'x' }] });

    expect(tree.children?.[0].children?.[0].children?.[0]).toEqual({
      key: 'name',
      path: '$.items[0].name',
      segments: ['items', 0, 'name'],
      type: 'string',
      value: 'x',
    });
  });
});

describe('toTreeNode', () => {
  it('labels object and array nodes with their child counts', () => {
    const tree = buildJsonTree({ a: 1, b: [1, 2, 3] });
    const node = toTreeNode(tree);

    expect(node.valueLabel).toBe('{ 2 }');
    expect(node.children?.find((child) => child.label === 'b')?.valueLabel).toBe('[ 3 ]');
  });

  it('labels primitive nodes with their JSON-serialized value', () => {
    const node = toTreeNode(buildJsonTree('hello'));
    expect(node.valueLabel).toBe('"hello"');

    const nullNode = toTreeNode(buildJsonTree(null));
    expect(nullNode.valueLabel).toBe('null');
  });
});
