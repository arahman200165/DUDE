import esm_fast_json_patch from 'fast-json-patch';
const { compare, getValueByPointer } = esm_fast_json_patch;

import { load as loadYaml } from 'js-yaml';
import { XMLParser } from 'fast-xml-parser';

export type SemanticFormat = 'json' | 'yaml' | 'xml';

export interface TreeDiffEntry {
  readonly path: string;
  readonly op: 'add' | 'remove' | 'replace';
  readonly oldValue?: unknown;
  readonly newValue?: unknown;
}

export interface TreeDiffSummary {
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
}

export interface TreeDiffResult {
  readonly entries: readonly TreeDiffEntry[];
  readonly summary: TreeDiffSummary;
}

export interface ParseError {
  readonly message: string;
}

export type ParseResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: ParseError };

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

/** Parses `input` per `format`. XML/JSON attribute-vs-text-node key names (`@_attr`, `#text`) are surfaced as-is in diff paths. */
export function parseSemanticInput(input: string, format: SemanticFormat): ParseResult {
  try {
    if (format === 'json') return { ok: true, value: JSON.parse(input) };
    if (format === 'yaml') return { ok: true, value: loadYaml(input) };
    return { ok: true, value: xmlParser.parse(input) };
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}

/** Lowercases every string leaf (not object/array keys) so `ignoreCase` never silently merges two distinct keys. */
function lowercaseStringLeaves(value: unknown): unknown {
  if (typeof value === 'string') return value.toLowerCase();
  if (Array.isArray(value)) return value.map(lowercaseStringLeaves);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, v]) => [key, lowercaseStringLeaves(v)]));
  }
  return value;
}

/**
 * Structural diff between two parsed values, via `fast-json-patch`'s `compare()` (already installed,
 * used by JSON Patch Generator) -- one engine shared by all three semantic diff modes, only the front-end
 * parser differs. `remove`/`replace` old values are looked up in the original (pre-lowercasing) `before`
 * tree by JSON Pointer, so a case-insensitive comparison still displays real, unmodified values.
 */
export function diffTrees(before: unknown, after: unknown, options: { readonly ignoreCase: boolean }): TreeDiffResult {
  const compareBefore = options.ignoreCase ? lowercaseStringLeaves(before) : before;
  const compareAfter = options.ignoreCase ? lowercaseStringLeaves(after) : after;

  const operations = compare(compareBefore as object, compareAfter as object);

  const entries: TreeDiffEntry[] = [];
  const summary = { added: 0, removed: 0, changed: 0 };

  for (const operation of operations) {
    if (operation.op === 'add') {
      entries.push({ path: operation.path, op: 'add', newValue: operation.value });
      summary.added++;
    } else if (operation.op === 'remove') {
      entries.push({ path: operation.path, op: 'remove', oldValue: getValueByPointer(before, operation.path) });
      summary.removed++;
    } else if (operation.op === 'replace') {
      entries.push({
        path: operation.path,
        op: 'replace',
        oldValue: getValueByPointer(before, operation.path),
        newValue: operation.value,
      });
      summary.changed++;
    }
  }

  return { entries, summary };
}
