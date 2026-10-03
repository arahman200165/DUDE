export type DiffKind = 'same' | 'changed' | 'removed' | 'added';

/** One side-by-side row; `left` is null for an added line, `right` for a removed one. */
export interface DiffRow {
  readonly kind: DiffKind;
  readonly left: string | null;
  readonly right: string | null;
}

const MAX_LCS_CELLS = 4_000_000;

/** Stable, indented JSON (object keys sorted) so equal values always print identically. */
export function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2) ?? 'null';
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}

type Op = { readonly op: 'same' | 'del' | 'add'; readonly text: string };

/**
 * Line-level side-by-side diff of two JSON values. Adjacent removed/added runs are paired into `changed` rows.
 * Pure and dependency-free; very large inputs fall back to a positional comparison instead of the LCS table.
 */
export function diffJson(left: unknown, right: unknown): DiffRow[] {
  const a = stableJson(left).split('\n');
  const b = stableJson(right).split('\n');
  return pairRuns(a.length * b.length <= MAX_LCS_CELLS ? lcsOps(a, b) : positionalOps(a, b));
}

export function hasDifferences(rows: readonly DiffRow[]): boolean {
  return rows.some((r) => r.kind !== 'same');
}

function lcsOps(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const table: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ op: 'same', text: a[i]! }); i++; j++; }
    else if (table[i + 1]![j]! >= table[i]![j + 1]!) ops.push({ op: 'del', text: a[i++]! });
    else ops.push({ op: 'add', text: b[j++]! });
  }
  while (i < n) ops.push({ op: 'del', text: a[i++]! });
  while (j < m) ops.push({ op: 'add', text: b[j++]! });
  return ops;
}

function positionalOps(a: string[], b: string[]): Op[] {
  const ops: Op[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length && i < b.length && a[i] === b[i]) ops.push({ op: 'same', text: a[i]! });
    else {
      if (i < a.length) ops.push({ op: 'del', text: a[i]! });
      if (i < b.length) ops.push({ op: 'add', text: b[i]! });
    }
  }
  return ops;
}

function pairRuns(ops: Op[]): DiffRow[] {
  const rows: DiffRow[] = [];
  let i = 0;
  while (i < ops.length) {
    const op = ops[i]!;
    if (op.op === 'same') { rows.push({ kind: 'same', left: op.text, right: op.text }); i++; continue; }
    const dels: string[] = [];
    const adds: string[] = [];
    while (i < ops.length && ops[i]!.op !== 'same') {
      (ops[i]!.op === 'del' ? dels : adds).push(ops[i]!.text);
      i++;
    }
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) {
      const left = dels[k] ?? null;
      const right = adds[k] ?? null;
      rows.push({ kind: left !== null && right !== null ? 'changed' : left !== null ? 'removed' : 'added', left, right });
    }
  }
  return rows;
}
