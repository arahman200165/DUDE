/**
 * Pure, framework-free JSON-aware structural diff for the JSON Formatter's
 * "Compare" view — walks two parsed JSON documents by key/value structure,
 * unlike the generic line-based Advanced Diff tool.
 *
 * Known v1 limitation: array comparison is index-based, not LCS/move-aware
 * — inserting one element in the middle of an array shows as a cascade of
 * "changed" entries rather than one clean insertion. Acceptable for v1; this
 * is a well-defined tree diff, not the kind of fiddly parsing logic the
 * project reaches for a dependency over.
 */

export type JsonDiffKind = 'added' | 'removed' | 'changed' | 'type-changed';

export interface JsonDiffEntry {
  readonly path: string;
  readonly kind: JsonDiffKind;
  readonly before?: unknown;
  readonly after?: unknown;
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export function diffJsonValues(left: unknown, right: unknown, path = '$'): readonly JsonDiffEntry[] {
  const leftType = typeOf(left);
  const rightType = typeOf(right);

  if (leftType !== rightType) {
    return [{ path, kind: 'type-changed', before: left, after: right }];
  }

  if (leftType === 'object') {
    const leftObj = left as Record<string, unknown>;
    const rightObj = right as Record<string, unknown>;
    const keys = new Set([...Object.keys(leftObj), ...Object.keys(rightObj)]);
    const entries: JsonDiffEntry[] = [];
    for (const key of keys) {
      const childPath = `${path}.${key}`;
      if (!(key in leftObj)) {
        entries.push({ path: childPath, kind: 'added', after: rightObj[key] });
      } else if (!(key in rightObj)) {
        entries.push({ path: childPath, kind: 'removed', before: leftObj[key] });
      } else {
        entries.push(...diffJsonValues(leftObj[key], rightObj[key], childPath));
      }
    }
    return entries;
  }

  if (leftType === 'array') {
    const leftArr = left as readonly unknown[];
    const rightArr = right as readonly unknown[];
    const maxLength = Math.max(leftArr.length, rightArr.length);
    const entries: JsonDiffEntry[] = [];
    for (let i = 0; i < maxLength; i++) {
      const childPath = `${path}[${i}]`;
      if (i >= leftArr.length) entries.push({ path: childPath, kind: 'added', after: rightArr[i] });
      else if (i >= rightArr.length) entries.push({ path: childPath, kind: 'removed', before: leftArr[i] });
      else entries.push(...diffJsonValues(leftArr[i], rightArr[i], childPath));
    }
    return entries;
  }

  // Primitive comparison.
  return Object.is(left, right) ? [] : [{ path, kind: 'changed', before: left, after: right }];
}

export type JsonDiffComputeResult =
  | { readonly ok: true; readonly entries: readonly JsonDiffEntry[] }
  | { readonly ok: false; readonly error: string; readonly side: 'left' | 'right' };

/** Parses both sides independently so a failure names which side didn't parse, then diffs the results. */
export function computeJsonDiff(left: string, right: string): JsonDiffComputeResult {
  let leftParsed: unknown;
  try {
    leftParsed = JSON.parse(left);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), side: 'left' };
  }

  let rightParsed: unknown;
  try {
    rightParsed = JSON.parse(right);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), side: 'right' };
  }

  return { ok: true, entries: diffJsonValues(leftParsed, rightParsed) };
}
