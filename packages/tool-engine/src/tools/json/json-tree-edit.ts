/**
 * Pure, framework-free mutation logic for the JSON Formatter's editable tree
 * view. Operates on structural `segments` (from `json-tree.ts`'s
 * `JsonTreeNode.segments`), never the lossy display-string `path` — a key
 * containing `.`/`[`/`]` cannot be unambiguously reversed out of that
 * string, so edits must address nodes structurally.
 */

import { JsonValueType } from "./json-tree.js";

export type JsonTreeEdit =
  | { readonly kind: 'setValue'; readonly value: unknown }
  | { readonly kind: 'setType'; readonly type: JsonValueType }
  | { readonly kind: 'renameKey'; readonly newKey: string }
  | { readonly kind: 'delete' }
  | { readonly kind: 'addChild'; readonly key?: string; readonly value: unknown };

export type JsonTreeEditApplyResult = { readonly ok: true; readonly root: unknown } | { readonly ok: false; readonly error: string };

class TreeEditError extends Error {}

function defaultValueForType(type: JsonValueType): unknown {
  if (type === 'object') return {};
  if (type === 'array') return [];
  if (type === 'string') return '';
  if (type === 'number') return 0;
  if (type === 'boolean') return false;
  return null;
}

function nextAvailableKey(obj: Record<string, unknown>): string {
  let i = 1;
  while (`newKey${i}` in obj) i++;
  return `newKey${i}`;
}

function addChild(target: unknown, key: string | undefined, value: unknown): unknown {
  if (Array.isArray(target)) return [...target, value];
  if (target !== null && typeof target === 'object') {
    const obj = target as Record<string, unknown>;
    const finalKey = key ?? nextAvailableKey(obj);
    if (finalKey in obj) throw new TreeEditError(`Key "${finalKey}" already exists.`);
    return { ...obj, [finalKey]: value };
  }
  throw new TreeEditError('Can only add children to an object or array.');
}

function deleteChild(parent: unknown, key: string | number): unknown {
  if (typeof key === 'number') {
    if (!Array.isArray(parent)) throw new TreeEditError('Path does not match the document structure.');
    const clone = parent.slice();
    clone.splice(key, 1);
    return clone;
  }
  if (parent === null || typeof parent !== 'object' || Array.isArray(parent)) {
    throw new TreeEditError('Path does not match the document structure.');
  }
  const clone = { ...(parent as Record<string, unknown>) };
  delete clone[key];
  return clone;
}

function renameChild(parent: unknown, key: string | number, newKey: string): unknown {
  if (typeof key === 'number') throw new TreeEditError('Array indices cannot be renamed.');
  if (parent === null || typeof parent !== 'object' || Array.isArray(parent)) {
    throw new TreeEditError('Path does not match the document structure.');
  }
  const obj = parent as Record<string, unknown>;
  if (!(key in obj)) throw new TreeEditError(`Key "${key}" not found.`);
  if (newKey !== key && newKey in obj) throw new TreeEditError(`Key "${newKey}" already exists.`);

  const clone: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) clone[k === key ? newKey : k] = v;
  return clone;
}

function cloneAlongPath(node: unknown, segments: readonly (string | number)[], transform: (target: unknown) => unknown): unknown {
  if (segments.length === 0) return transform(node);

  const [head, ...rest] = segments;
  if (typeof head === 'number') {
    if (!Array.isArray(node)) throw new TreeEditError('Path does not match the document structure.');
    if (head < 0 || head >= node.length) throw new TreeEditError('Array index out of range.');
    const clone = node.slice();
    clone[head] = cloneAlongPath(node[head], rest, transform);
    return clone;
  }

  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    throw new TreeEditError('Path does not match the document structure.');
  }
  if (!(head in node)) throw new TreeEditError(`Key "${head}" not found.`);
  const clone = { ...(node as Record<string, unknown>) };
  clone[head] = cloneAlongPath((node as Record<string, unknown>)[head], rest, transform);
  return clone;
}

export function applyJsonTreeEdit(root: unknown, segments: readonly (string | number)[], edit: JsonTreeEdit): JsonTreeEditApplyResult {
  try {
    if (edit.kind === 'delete' || edit.kind === 'renameKey') {
      if (segments.length === 0) {
        throw new TreeEditError(edit.kind === 'delete' ? 'Cannot delete the root value.' : 'Cannot rename the root value.');
      }
      const parentSegments = segments.slice(0, -1);
      const targetKey = segments[segments.length - 1];
      const newRoot = cloneAlongPath(root, parentSegments, (parent) =>
        edit.kind === 'delete' ? deleteChild(parent, targetKey) : renameChild(parent, targetKey, edit.newKey),
      );
      return { ok: true, root: newRoot };
    }

    const newRoot = cloneAlongPath(root, segments, (target) => {
      if (edit.kind === 'setValue') return edit.value;
      if (edit.kind === 'setType') return defaultValueForType(edit.type);
      return addChild(target, edit.key, edit.value);
    });
    return { ok: true, root: newRoot };
  } catch (error) {
    if (error instanceof TreeEditError) return { ok: false, error: error.message };
    throw error;
  }
}
