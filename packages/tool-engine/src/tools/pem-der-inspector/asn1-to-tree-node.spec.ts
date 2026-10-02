import { describe, expect, it } from 'vitest';
import { Asn1TreeNode } from "../../shared/utils/asn1-tree.js";
import { asn1ToTreeNode } from "./asn1-to-tree-node.js";

describe('asn1ToTreeNode', () => {
  it('labels a primitive leaf with its value preview and byte length', () => {
    const leaf: Asn1TreeNode = {
      tagClassName: 'UNIVERSAL',
      typeName: 'INTEGER',
      constructed: false,
      byteLength: 3,
      valuePreview: '42',
      children: [],
    };
    const node = asn1ToTreeNode(leaf, 'root', '$');
    expect(node.valueLabel).toBe('INTEGER = 42 (3 bytes)');
    expect(node.type).toBe('INTEGER');
    expect(node.children).toBeUndefined();
  });

  it('labels a constructed node with element count and recurses into children', () => {
    const child: Asn1TreeNode = {
      tagClassName: 'UNIVERSAL',
      typeName: 'BOOLEAN',
      constructed: false,
      byteLength: 3,
      valuePreview: 'TRUE',
      children: [],
    };
    const sequence: Asn1TreeNode = {
      tagClassName: 'UNIVERSAL',
      typeName: 'SEQUENCE',
      constructed: true,
      byteLength: 10,
      children: [child],
    };
    const node = asn1ToTreeNode(sequence, 'root', '$');
    expect(node.valueLabel).toBe('SEQUENCE — 1 element, 10 bytes');
    expect(node.children).toHaveLength(1);
    expect(node.children![0].path).toBe('$[0]');
    expect(node.children![0].valueLabel).toBe('BOOLEAN = TRUE (3 bytes)');
  });
});
