/**
 * Diff of two process/user environments. Names compare case-insensitively (as Windows does); values
 * compare exactly. `toDiffViewEntries` maps the result onto the shared `app-diff-view` entry shape.
 */
export type EnvDiffOp = 'add' | 'remove' | 'change';

export interface EnvPathBreakdown {
  /** Segments only in the new value. */
  readonly added: readonly string[];
  /** Segments only in the old value. */
  readonly removed: readonly string[];
  /** Same segments, different order. */
  readonly reordered: boolean;
}

export interface EnvDiffEntry {
  readonly name: string;
  readonly op: EnvDiffOp;
  readonly before?: string;
  readonly after?: string;
  /** Present for `;`-separated (PATH-like) values that changed. */
  readonly pathBreakdown?: EnvPathBreakdown;
}

export type EnvMap = ReadonlyMap<string, string> | Readonly<Record<string, string>>;

const segments = (value: string): string[] => value.split(';').map((s) => s.trim()).filter(Boolean);

export function pathBreakdown(before: string, after: string): EnvPathBreakdown | undefined {
  if (!before.includes(';') && !after.includes(';')) return undefined;
  const a = segments(before);
  const b = segments(after);
  const lower = (s: string): string => s.toLowerCase();
  const inA = new Set(a.map(lower));
  const inB = new Set(b.map(lower));
  const ca = a.filter((s) => inB.has(lower(s))).map(lower);
  const cb = b.filter((s) => inA.has(lower(s))).map(lower);
  return {
    added: b.filter((s) => !inA.has(lower(s))),
    removed: a.filter((s) => !inB.has(lower(s))),
    reordered: ca.length === cb.length && ca.some((s, i) => s !== cb[i]),
  };
}

function index(env: EnvMap): Map<string, { name: string; value: string }> {
  const map = new Map<string, { name: string; value: string }>();
  const pairs = env instanceof Map ? [...env] : Object.entries(env);
  for (const [name, value] of pairs) map.set(name.toLowerCase(), { name, value });
  return map;
}

/** Entries sorted by name (case-insensitive). Identical environments give an empty list. */
export function diffEnvironments(a: EnvMap, b: EnvMap): EnvDiffEntry[] {
  const left = index(a);
  const right = index(b);
  const entries: EnvDiffEntry[] = [];
  for (const [key, l] of left) {
    const r = right.get(key);
    if (!r) entries.push({ name: l.name, op: 'remove', before: l.value });
    else if (r.value !== l.value) entries.push({ name: r.name, op: 'change', before: l.value, after: r.value, pathBreakdown: pathBreakdown(l.value, r.value) });
  }
  for (const [key, r] of right) if (!left.has(key)) entries.push({ name: r.name, op: 'add', after: r.value });
  return entries.sort((x, y) => x.name.toLowerCase().localeCompare(y.name.toLowerCase()) || x.name.localeCompare(y.name));
}

export function summarizeEnvDiff(entries: readonly EnvDiffEntry[]): { added: number; removed: number; changed: number } {
  return {
    added: entries.filter((e) => e.op === 'add').length,
    removed: entries.filter((e) => e.op === 'remove').length,
    changed: entries.filter((e) => e.op === 'change').length,
  };
}

/** Structurally identical to `app-diff-view`'s `DiffEntry`. */
export function toDiffViewEntries(entries: readonly EnvDiffEntry[]): { path: string; op: 'add' | 'remove' | 'replace'; oldValue?: string; newValue?: string }[] {
  return entries.map((e) => ({
    path: e.name,
    op: e.op === 'change' ? 'replace' : e.op,
    ...(e.before !== undefined ? { oldValue: e.before } : {}),
    ...(e.after !== undefined ? { newValue: e.after } : {}),
  }));
}
