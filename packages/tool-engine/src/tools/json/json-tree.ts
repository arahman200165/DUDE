/**
 * Pure, framework-free JSON structural-tree building used by the JSON
 * Formatter tool's "Tree" view (Phase 2 roadmap item #23, "JSON Structural
 * Explorer"). No Angular imports, so it stays trivially unit-testable.
 */

import { TreeNode } from "@dude/domain/shared/models/tree-node.model";

export type JsonValueType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

export interface JsonTreeNode {
  readonly key: string;
  /** Display-only JSONPath-style string (`$.a.b[0]`) — lossy for keys containing `.`/`[`/`]`, never parsed back. */
  readonly path: string;
  /** Structural, edit-safe path from the root — built directly, never derived from `path`. */
  readonly segments: readonly (string | number)[];
  readonly type: JsonValueType;
  readonly value: unknown;
  readonly children?: readonly JsonTreeNode[];
}

function typeOf(value: unknown): JsonValueType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value as JsonValueType;
}

function buildNode(key: string, path: string, segments: readonly (string | number)[], value: unknown): JsonTreeNode {
  const type = typeOf(value);

  if (type === 'object') {
    const children = Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) =>
      buildNode(childKey, `${path}.${childKey}`, [...segments, childKey], childValue),
    );
    return { key, path, segments, type, value, children };
  }

  if (type === 'array') {
    const children = (value as readonly unknown[]).map((item, index) =>
      buildNode(String(index), `${path}[${index}]`, [...segments, index], item),
    );
    return { key, path, segments, type, value, children };
  }

  return { key, path, segments, type, value };
}

/** Builds a tree rooted at `$`, the conventional JSONPath root. */
export function buildJsonTree(parsed: unknown): JsonTreeNode {
  return buildNode('$', '$', [], parsed);
}

function jsonTreeNodeLabel(node: JsonTreeNode): string {
  if (node.type === 'object') return `{ ${(node.children ?? []).length} }`;
  if (node.type === 'array') return `[ ${(node.children ?? []).length} ]`;
  return JSON.stringify(node.value);
}

/** Adapts a JSON-specific tree node into the shared, generic `TreeView` shape. */
export function toTreeNode(node: JsonTreeNode): TreeNode {
  return {
    label: node.key,
    path: node.path,
    valueLabel: jsonTreeNodeLabel(node),
    type: node.type,
    children: node.children?.map(toTreeNode),
  };
}
