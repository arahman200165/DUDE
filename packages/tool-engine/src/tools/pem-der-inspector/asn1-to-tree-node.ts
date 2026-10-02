import { Asn1TreeNode } from "../../shared/utils/asn1-tree.js";
import { TreeNode } from "@dude/domain/shared/models/tree-node.model";

/** Adapts the shared `Asn1TreeNode` shape into `TreeView`'s generic `TreeNode` shape. */
export function asn1ToTreeNode(node: Asn1TreeNode, label: string, path: string): TreeNode {
  const valueLabel = node.constructed
    ? `${node.typeName} — ${node.children.length} element${node.children.length === 1 ? '' : 's'}, ${node.byteLength} bytes`
    : `${node.typeName} = ${node.valuePreview} (${node.byteLength} bytes)`;

  return {
    label,
    path,
    valueLabel,
    type: node.typeName,
    children: node.constructed
      ? node.children.map((child, index) => asn1ToTreeNode(child, `[${index}]`, `${path}[${index}]`))
      : undefined,
  };
}
