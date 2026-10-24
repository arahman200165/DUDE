import type { FieldRule } from './policies.js';
import { mergeText3 } from './text-merge.js';

export type Merge3Result = { kind: 'merged'; value: unknown } | { kind: 'conflict'; fields: string[] };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Structural equality for JSON-like values. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isPlainObject(a)) {
    if (!isPlainObject(b)) return false;
    const ak = Object.keys(a);
    if (ak.length !== Object.keys(b).length) return false;
    return ak.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

const UNRESOLVED = Symbol('unresolved');

/** A both-sides change under a field rule, or UNRESOLVED when the rule does not apply or cannot settle it. */
function resolveField(rule: FieldRule | undefined, base: unknown, inBase: boolean, lv: unknown, rv: unknown): unknown {
  if (rule === 'max-iso') return typeof lv === 'string' && typeof rv === 'string' ? (lv >= rv ? lv : rv) : UNRESOLVED;
  if (rule === 'text') return inBase && typeof base === 'string' && typeof lv === 'string' && typeof rv === 'string' ? mergeText3(base, lv, rv) : UNRESOLVED;
  if (typeof rule === 'object') return mergeKeyedList(inBase ? base : [], lv, rv, rule.keyedList, rule.text);
  return UNRESOLVED;
}

/** Items matched by `key`; local order with remote-only additions appended in remote order. */
function mergeKeyedList(base: unknown, lv: unknown, rv: unknown, key: string, textFields: readonly string[]): unknown {
  const keyed = (v: unknown): Map<string, Record<string, unknown>> | null => {
    if (!Array.isArray(v)) return null;
    const map = new Map<string, Record<string, unknown>>();
    for (const item of v) {
      if (!isPlainObject(item) || typeof item[key] !== 'string' || map.has(item[key])) return null;
      map.set(item[key], item);
    }
    return map;
  };
  const b = keyed(base);
  const l = keyed(lv);
  const r = keyed(rv);
  if (b === null || l === null || r === null) return UNRESOLVED;
  const textRules = Object.fromEntries(textFields.map((f) => [f, 'text' as const]));
  const out: unknown[] = [];
  const merge = (id: string): boolean => {
    const li = l.get(id);
    const ri = r.get(id);
    const bi = b.get(id);
    if (li !== undefined && ri !== undefined) {
      const merged = merge3(bi ?? null, li, ri, bi === undefined ? undefined : textRules);
      if (merged.kind === 'conflict') return false;
      out.push(merged.value);
      return true;
    }
    const only = li ?? ri;
    if (only === undefined) return true;
    if (bi === undefined) { out.push(only); return true; }
    // Present in the base and removed on one side: the removal wins.
    return true;
  };
  for (const id of l.keys()) if (!merge(id)) return UNRESOLVED;
  for (const id of r.keys()) if (!l.has(id) && !merge(id)) return UNRESOLVED;
  return out;
}

/**
 * Three-way merge over the top-level fields of plain objects. A field changed on one side only takes that side;
 * changed to equal values on both takes it; changed differently conflicts unless a field rule ('max-iso', 'text', keyed list) settles it.
 * A null base is treated as an empty object. Non-object values merge only when equal (conflict fields ['*']).
 */
export function merge3(
  base: unknown | null,
  local: unknown,
  remote: unknown,
  rules?: Readonly<Record<string, FieldRule>>,
): Merge3Result {
  if (!isPlainObject(local) || !isPlainObject(remote)) {
    return deepEqual(local, remote) ? { kind: 'merged', value: local } : { kind: 'conflict', fields: ['*'] };
  }
  const b: Record<string, unknown> = isPlainObject(base) ? base : {};
  const has = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
  const same = (x: unknown, xin: boolean, y: unknown, yin: boolean) => xin === yin && (!xin || deepEqual(x, y));
  const keys = new Set([...Object.keys(b), ...Object.keys(local), ...Object.keys(remote)]);
  const out: Record<string, unknown> = {};
  const conflicts: string[] = [];
  for (const k of keys) {
    const inL = has(local, k);
    const inR = has(remote, k);
    const inB = has(b, k);
    let take: 'local' | 'remote' | 'conflict';
    if (same(local[k], inL, remote[k], inR)) take = 'local';
    else if (same(local[k], inL, b[k], inB)) take = 'remote';
    else if (same(remote[k], inR, b[k], inB)) take = 'local';
    else take = 'conflict';
    if (take === 'conflict') {
      const resolved = resolveField(rules?.[k], b[k], inB, local[k], remote[k]);
      if (resolved === UNRESOLVED) conflicts.push(k);
      else out[k] = resolved;
      continue;
    }
    if (take === 'local' ? inL : inR) out[k] = take === 'local' ? local[k] : remote[k];
  }
  return conflicts.length > 0 ? { kind: 'conflict', fields: conflicts } : { kind: 'merged', value: out };
}
