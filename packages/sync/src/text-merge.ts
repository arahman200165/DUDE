/**
 * Three-way text merge (PD-102). Each side is diffed against the base at code-point level and the two edits are
 * combined the way concurrent collaborative edits combine: every base character deleted by either side is gone, and
 * the text either side inserted at a position is kept (the other side's first). An insertion made identically on both
 * sides, or one side's insertion that contains the other's, is kept once, so an edit that reaches the Hub twice (as a
 * live update and again as a queued write) is never duplicated. The merge never fails and never adds markers.
 */

/** Beyond this many edits between a side and the base, the changed middle is treated as one replacement. */
export const TEXT_DIFF_MAX_COST = 600;

interface TextEdit {
  /** deleted[i]: base code point i is removed. */
  deleted: Uint8Array;
  /** inserted.get(g): text inserted in gap g (before base code point g; g === length is the end). */
  inserted: Map<number, string>;
}

const codePoints = (s: string): string[] => Array.from(s);

/** Myers' O(ND) shortest edit script on code-point arrays; null when it needs more than `maxCost` edits. */
function shortestEdit(a: readonly string[], b: readonly string[], maxCost: number): Array<'=' | '-' | '+'> | null {
  const n = a.length;
  const m = b.length;
  const limit = Math.min(maxCost, n + m);
  const offset = limit + 1;
  const v = new Int32Array(2 * limit + 3);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= limit; d += 1) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!) ? v[offset + k + 1]! : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x += 1; y += 1; }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        trace.push(v.slice(offset - d, offset + d + 1));
        return backtrack(trace, n, m);
      }
    }
    trace.push(v.slice(offset - d, offset + d + 1));
  }
  return null;
}

function backtrack(trace: readonly Int32Array[], n: number, m: number): Array<'=' | '-' | '+'> {
  const ops: Array<'=' | '-' | '+'> = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d > 0; d -= 1) {
    const prev = trace[d - 1]!;
    const at = (k: number): number => prev[k + d - 1]!;
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const prevK = down ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) { ops.push('='); x -= 1; y -= 1; }
    ops.push(down ? '+' : '-');
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) { ops.push('='); x -= 1; y -= 1; }
  return ops.reverse();
}

function diffText(base: readonly string[], other: readonly string[], maxCost: number): TextEdit {
  const deleted = new Uint8Array(base.length);
  const inserted = new Map<number, string>();
  let start = 0;
  while (start < base.length && start < other.length && base[start] === other[start]) start += 1;
  let endB = base.length;
  let endO = other.length;
  while (endB > start && endO > start && base[endB - 1] === other[endO - 1]) { endB -= 1; endO -= 1; }
  const a = base.slice(start, endB);
  const b = other.slice(start, endO);
  const ops = shortestEdit(a, b, maxCost) ?? [...a.map(() => '-' as const), ...b.map(() => '+' as const)];
  let i = start;
  let j = start;
  for (const op of ops) {
    if (op === '=') { i += 1; j += 1; }
    else if (op === '-') { deleted[i] = 1; i += 1; }
    else { inserted.set(i, (inserted.get(i) ?? '') + other[j]!); j += 1; }
  }
  return { deleted, inserted };
}

function combineInsertions(theirs: string, ours: string): string {
  if (theirs === ours || theirs.includes(ours)) return theirs;
  if (ours.includes(theirs)) return ours;
  return theirs + ours;
}

/** Merges `ours` and `theirs`, both edited from `base`. Always succeeds. */
export function mergeText3(base: string, ours: string, theirs: string, maxCost = TEXT_DIFF_MAX_COST): string {
  if (ours === theirs || theirs === base) return ours;
  if (ours === base) return theirs;
  const b = codePoints(base);
  const eo = diffText(b, codePoints(ours), maxCost);
  const et = diffText(b, codePoints(theirs), maxCost);
  let out = '';
  for (let g = 0; g <= b.length; g += 1) {
    out += combineInsertions(et.inserted.get(g) ?? '', eo.inserted.get(g) ?? '');
    if (g < b.length && eo.deleted[g] === 0 && et.deleted[g] === 0) out += b[g];
  }
  return out;
}

/** One contiguous replacement of `deleteCount` UTF-16 units at `at` by `insert`. */
export interface TextHunk {
  /** UTF-16 index into the original text. */
  at: number;
  /** UTF-16 units removed from the original text. */
  deleteCount: number;
  /** Text inserted at `at` after the deletion. */
  insert: string;
}

/**
 * The minimal multi-hunk edit that turns `a` into `b`, diffed at code-point level so a surrogate pair is never split.
 * Hunks are returned in descending `at` order (right to left, every `at` indexes the original `a`), so applying them in
 * array order with ordinary splice/`Y.Text` edits never shifts a hunk that has yet to be applied. Past `maxCost` edits
 * the changed middle becomes one replacement hunk.
 */
export function textHunks(a: string, b: string, maxCost = TEXT_DIFF_MAX_COST): TextHunk[] {
  if (a === b) return [];
  const ca = codePoints(a);
  const cb = codePoints(b);
  let start = 0;
  let offset = 0;
  while (start < ca.length && start < cb.length && ca[start] === cb[start]) { offset += ca[start]!.length; start += 1; }
  let endA = ca.length;
  let endB = cb.length;
  while (endA > start && endB > start && ca[endA - 1] === cb[endB - 1]) { endA -= 1; endB -= 1; }
  const ma = ca.slice(start, endA);
  const mb = cb.slice(start, endB);
  const ops = shortestEdit(ma, mb, maxCost) ?? [...ma.map(() => '-' as const), ...mb.map(() => '+' as const)];
  const hunks: TextHunk[] = [];
  let pending: TextHunk | null = null;
  let i = 0;
  let j = 0;
  const flush = (): void => { if (pending) { hunks.push(pending); pending = null; } };
  for (const op of ops) {
    if (op === '=') { flush(); offset += ma[i]!.length; i += 1; j += 1; continue; }
    pending ??= { at: offset, deleteCount: 0, insert: '' };
    if (op === '-') { pending.deleteCount += ma[i]!.length; offset += ma[i]!.length; i += 1; }
    else { pending.insert += mb[j]!; j += 1; }
  }
  flush();
  return hunks.reverse();
}
