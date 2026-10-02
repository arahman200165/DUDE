/**
 * Pure, framework-free YAML anchor/alias discovery used by the YAML Anchor /
 * Alias Visualizer tool. Shared as-is between the main thread (small inputs)
 * and `yaml-anchors.worker.ts` (large inputs).
 *
 * Uses the `yaml` package rather than `js-yaml`, which silently resolves
 * aliases to their target value and does not expose the anchor/alias graph
 * after parsing.
 */

import { isPair, parseDocument, visit } from 'yaml';

export interface YamlAnchorInfo {
  readonly anchor: string;
  readonly definitionPaths: readonly string[];
  readonly aliasPaths: readonly string[];
}

export interface YamlAnchorsError {
  readonly message: string;
}

export type YamlAnchorsResult =
  | { readonly ok: true; readonly anchors: readonly YamlAnchorInfo[] }
  | { readonly ok: false; readonly error: YamlAnchorsError };

function pathToString(path: readonly unknown[], key: unknown): string {
  const segments: string[] = [];
  for (const node of path) {
    if (isPair(node)) {
      const keyNode = node.key as { value?: unknown } | null;
      segments.push(keyNode && typeof keyNode === 'object' && 'value' in keyNode ? String(keyNode.value) : '?');
    }
  }
  if (typeof key === 'number') segments.push(`[${key}]`);

  if (segments.length === 0) return '(root)';
  return segments.reduce((acc, segment) => (acc === '' || segment.startsWith('[') ? acc + segment : `${acc}.${segment}`), '');
}

export function findYamlAnchors(input: string): YamlAnchorsResult {
  if (input.trim() === '') return { ok: false, error: { message: 'Enter some YAML.' } };

  const doc = parseDocument(input);
  if (doc.errors.length > 0) {
    return { ok: false, error: { message: doc.errors[0].message } };
  }

  const definitions = new Map<string, string[]>();
  const aliases = new Map<string, string[]>();

  visit(doc, {
    Node(key, node, path) {
      const anchor = (node as { anchor?: string }).anchor;
      if (!anchor) return;
      const list = definitions.get(anchor) ?? [];
      list.push(pathToString(path, key));
      definitions.set(anchor, list);
    },
    Alias(key, node, path) {
      const list = aliases.get(node.source) ?? [];
      list.push(pathToString(path, key));
      aliases.set(node.source, list);
    },
  });

  const anchorNames = new Set([...definitions.keys(), ...aliases.keys()]);
  const anchors: YamlAnchorInfo[] = [...anchorNames].sort().map((anchor) => ({
    anchor,
    definitionPaths: definitions.get(anchor) ?? [],
    aliasPaths: aliases.get(anchor) ?? [],
  }));

  return { ok: true, anchors };
}
