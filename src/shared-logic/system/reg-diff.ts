/**
 * Diff of two registry subtrees. Key paths and value names compare case-insensitively (as Windows
 * does); type and data compare exactly. `toRegDiffViewEntries` maps the result onto the shared
 * `app-diff-view` entry shape.
 */
import { formatRegData, normalizeRegPath, type RegFileKey } from './reg-file';
import type { RegistryValueType } from './system-types';

export interface RegSnapshotValue {
  readonly type: RegistryValueType;
  readonly data: string | number | readonly string[];
}

/** `{ keyPath -> { valueName -> value } }`; '' is the (Default) value. */
export type RegTreeMap = Readonly<Record<string, Readonly<Record<string, RegSnapshotValue>>>>;

export type RegDiffOp = 'add' | 'remove' | 'change';

export interface RegDiffEntry {
  readonly keyPath: string;
  /** Undefined for a key-level entry (the key itself was added or removed). */
  readonly valueName?: string;
  readonly op: RegDiffOp;
  readonly before?: RegSnapshotValue;
  readonly after?: RegSnapshotValue;
}

/** Flattens parsed `.reg` keys into a tree map; deleted keys/values are skipped, later duplicates win. */
export function regKeysToMap(keys: readonly RegFileKey[]): RegTreeMap {
  const map: Record<string, Record<string, RegSnapshotValue>> = {};
  for (const key of keys) {
    if (key.deleted) continue;
    const bucket = (map[normalizeRegPath(key.path)] ??= {});
    for (const v of key.values) if (!v.deleted) bucket[v.name] = { type: v.type, data: v.data };
  }
  return map;
}

const same = (a: RegSnapshotValue, b: RegSnapshotValue): boolean =>
  a.type === b.type && JSON.stringify(a.data) === JSON.stringify(b.data);

interface Indexed { path: string; values: Map<string, { name: string; value: RegSnapshotValue }> }

function index(tree: RegTreeMap): Map<string, Indexed> {
  const out = new Map<string, Indexed>();
  for (const [path, values] of Object.entries(tree)) {
    const normalized = normalizeRegPath(path);
    const lower = normalized.toLowerCase();
    const entry = out.get(lower) ?? { path: normalized, values: new Map() };
    for (const [name, value] of Object.entries(values)) entry.values.set(name.toLowerCase(), { name, value });
    out.set(lower, entry);
  }
  return out;
}

/** Entries sorted by key path, the key-level entry first, then by value name. */
export function diffRegistry(a: RegTreeMap, b: RegTreeMap): RegDiffEntry[] {
  const left = index(a);
  const right = index(b);
  const entries: RegDiffEntry[] = [];
  const paths = new Set([...left.keys(), ...right.keys()]);
  for (const lower of paths) {
    const l = left.get(lower);
    const r = right.get(lower);
    const keyPath = (r ?? l)!.path;
    if (!l) entries.push({ keyPath, op: 'add' });
    else if (!r) entries.push({ keyPath, op: 'remove' });
    const names = new Set([...(l?.values.keys() ?? []), ...(r?.values.keys() ?? [])]);
    for (const n of names) {
      const lv = l?.values.get(n);
      const rv = r?.values.get(n);
      if (lv && !rv) entries.push({ keyPath, valueName: lv.name, op: 'remove', before: lv.value });
      else if (!lv && rv) entries.push({ keyPath, valueName: rv.name, op: 'add', after: rv.value });
      else if (lv && rv && !same(lv.value, rv.value)) entries.push({ keyPath, valueName: rv.name, op: 'change', before: lv.value, after: rv.value });
    }
  }
  const sortKey = (e: RegDiffEntry): string => e.keyPath.toLowerCase() + (e.valueName === undefined ? '' : '\u0001' + e.valueName.toLowerCase());
  return entries.sort((x, y) => (sortKey(x) < sortKey(y) ? -1 : sortKey(x) > sortKey(y) ? 1 : 0));
}

export function summarizeRegDiff(entries: readonly RegDiffEntry[]): { added: number; removed: number; changed: number } {
  return {
    added: entries.filter((e) => e.op === 'add').length,
    removed: entries.filter((e) => e.op === 'remove').length,
    changed: entries.filter((e) => e.op === 'change').length,
  };
}

const render = (v: RegSnapshotValue): string => `${v.type}: ${formatRegData(v.type, v.data)}`;

/** Structurally identical to `app-diff-view`'s `DiffEntry`. */
export function toRegDiffViewEntries(entries: readonly RegDiffEntry[]): { path: string; op: 'add' | 'remove' | 'replace'; oldValue?: string; newValue?: string }[] {
  return entries.map((e) => ({
    path: e.valueName === undefined ? `${e.keyPath}\\` : `${e.keyPath} :: ${e.valueName === '' ? '(Default)' : e.valueName}`,
    op: e.op === 'change' ? 'replace' : e.op,
    ...(e.before ? { oldValue: render(e.before) } : {}),
    ...(e.after ? { newValue: render(e.after) } : {}),
  }));
}
