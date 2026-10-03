import type { FieldRule } from './policies.js';

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

/**
 * Three-way merge over the top-level fields of plain objects. A field changed on one side only takes that side;
 * changed to equal values on both takes it; changed differently conflicts unless a 'max-iso' rule applies.
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
      const lv = local[k];
      const rv = remote[k];
      if (rules?.[k] === 'max-iso' && typeof lv === 'string' && typeof rv === 'string') {
        out[k] = lv >= rv ? lv : rv;
      } else {
        conflicts.push(k);
      }
      continue;
    }
    if (take === 'local' ? inL : inR) out[k] = take === 'local' ? local[k] : remote[k];
  }
  return conflicts.length > 0 ? { kind: 'conflict', fields: conflicts } : { kind: 'merged', value: out };
}
