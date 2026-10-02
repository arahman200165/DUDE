/**
 * Pure, framework-free conversion of an arbitrary decoded value (from any of
 * the binary-format decoders: Protobuf, MessagePack, BSON, CBOR, Avro) into
 * the shared `TreeView`'s generic node shape. Deliberately format-agnostic —
 * each decoder just needs to produce plain JS values (objects/arrays/Maps/
 * Uint8Array/Date/primitives) and this renders all of them the same way.
 */

import { TreeNode } from "@dude/domain/shared/models/tree-node.model";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Uint8Array) && !(value instanceof Date) && !(value instanceof Map);
}

function bytesLabel(byteLength: number): string {
  return `<${byteLength} byte${byteLength === 1 ? '' : 's'}>`;
}

function scalarLabel(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (value instanceof Uint8Array) return bytesLabel(value.byteLength);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}

function typeLabel(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Map) return 'map';
  if (value instanceof Uint8Array) return 'bytes';
  if (value instanceof Date) return 'date';
  return typeof value;
}

function buildNode(label: string, path: string, value: unknown): TreeNode {
  const type = typeLabel(value);

  if (Array.isArray(value)) {
    return {
      label,
      path,
      valueLabel: `[ ${value.length} ]`,
      type,
      children: value.map((item, index) => buildNode(String(index), `${path}[${index}]`, item)),
    };
  }

  if (value instanceof Map) {
    const entries = [...value.entries()];
    return {
      label,
      path,
      valueLabel: `Map( ${entries.length} )`,
      type,
      children: entries.map(([key, childValue], index) => buildNode(String(key), `${path}[${index}]`, childValue)),
    };
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    return {
      label,
      path,
      valueLabel: `{ ${entries.length} }`,
      type,
      children: entries.map(([key, childValue]) => buildNode(key, `${path}.${key}`, childValue)),
    };
  }

  return { label, path, valueLabel: scalarLabel(value), type };
}

/** Wraps the decoded value under a single root node, matching `TreeView`'s `readonly TreeNode[]` input. */
export function binaryValueToTree(value: unknown, rootLabel = 'root'): readonly TreeNode[] {
  return [buildNode(rootLabel, '$', value)];
}
