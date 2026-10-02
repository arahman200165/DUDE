import { DiffLine } from "../diff/text-diff.js";
import { computeLineDiffIgnoring, IgnoreOptions, NO_IGNORE_OPTIONS } from "./diff-normalize.js";

/**
 * Hand-rolled diff3-style three-way merge — no dependency; the ecosystem has
 * no small, well-maintained in-browser diff3 library, and this technique
 * (diff base-vs-left and base-vs-right independently, then correlate both
 * edit scripts against the shared base sequence) is the same kind of logic
 * `diff-hunks.ts` already hand-rolls for two-way diff.
 *
 * Key invariant this relies on: `computeLineDiff(base, X)` always produces a
 * flat sequence whose 'equal' and 'remove' entries, in order, reconstruct
 * `base` exactly — only 'add' entries are insertions absent from `base`.
 * Since both `computeLineDiff(base, left)` and `computeLineDiff(base, right)`
 * are aligned to the *same* base sequence, their base-consuming entries
 * ('equal'/'remove') walk base lines in lockstep, letting us correlate them
 * one base line at a time without ever comparing left directly to right.
 */

export type ThreeWayLineStatus = 'left-only' | 'right-only' | 'both-same' | 'conflict';

export interface ThreeWayHunk {
  readonly index: number;
  readonly baseLines: readonly string[];
  readonly leftLines: readonly string[];
  readonly rightLines: readonly string[];
  readonly status: ThreeWayLineStatus;
  /** True for a pure "both sides kept this unchanged" passthrough group — never needs a decision. */
  readonly context: boolean;
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

interface RawEntry {
  readonly baseLines: readonly string[];
  readonly leftLines: readonly string[];
  readonly rightLines: readonly string[];
  readonly status: ThreeWayLineStatus;
  readonly context: boolean;
}

function buildRawEntries(base: string, left: string, right: string, ignoreOptions: IgnoreOptions): readonly RawEntry[] {
  const baseVsLeft = computeLineDiffIgnoring(base, left, ignoreOptions).lines;
  const baseVsRight = computeLineDiffIgnoring(base, right, ignoreOptions).lines;

  const entries: RawEntry[] = [];
  let li = 0;
  let ri = 0;

  const takeInserts = (lines: readonly DiffLine[], index: number): { inserts: string[]; next: number } => {
    const inserts: string[] = [];
    let i = index;
    while (i < lines.length && lines[i].type === 'add') {
      inserts.push(lines[i].text);
      i++;
    }
    return { inserts, next: i };
  };

  while (li < baseVsLeft.length || ri < baseVsRight.length) {
    const left1 = takeInserts(baseVsLeft, li);
    li = left1.next;
    const right1 = takeInserts(baseVsRight, ri);
    ri = right1.next;

    if (left1.inserts.length > 0 || right1.inserts.length > 0) {
      const same = arraysEqual(left1.inserts, right1.inserts);
      entries.push({
        baseLines: [],
        leftLines: left1.inserts,
        rightLines: right1.inserts,
        status: same ? 'both-same' : left1.inserts.length === 0 ? 'right-only' : right1.inserts.length === 0 ? 'left-only' : 'conflict',
        context: false,
      });
    }

    if (li >= baseVsLeft.length && ri >= baseVsRight.length) break;

    // Both sides now point at a base-consuming entry ('equal' or 'remove')
    // for the SAME base line, per the alignment invariant above.
    const L = baseVsLeft[li++];
    const R = baseVsRight[ri++];
    const baseLineText = L.text;
    const leftKept = L.type === 'equal';
    const rightKept = R.type === 'equal';

    if (leftKept && rightKept) {
      entries.push({ baseLines: [baseLineText], leftLines: [baseLineText], rightLines: [baseLineText], status: 'both-same', context: true });
    } else if (!leftKept && !rightKept) {
      entries.push({ baseLines: [baseLineText], leftLines: [], rightLines: [], status: 'both-same', context: false });
    } else if (!leftKept && rightKept) {
      entries.push({ baseLines: [baseLineText], leftLines: [], rightLines: [baseLineText], status: 'left-only', context: false });
    } else {
      entries.push({ baseLines: [baseLineText], leftLines: [baseLineText], rightLines: [], status: 'right-only', context: false });
    }
  }

  return entries;
}

export interface ThreeWayMergeResult {
  readonly hunks: readonly ThreeWayHunk[];
}

export function computeThreeWayMerge(
  base: string,
  left: string,
  right: string,
  ignoreOptions: IgnoreOptions = NO_IGNORE_OPTIONS,
): ThreeWayMergeResult {
  const entries = buildRawEntries(base, left, right, ignoreOptions);

  const hunks: ThreeWayHunk[] = [];
  let i = 0;
  while (i < entries.length) {
    const baseLines: string[] = [];
    const leftLines: string[] = [];
    const rightLines: string[] = [];
    const first = entries[i];
    let status = first.status;
    const context = first.context;

    while (i < entries.length && entries[i].context === context) {
      const e = entries[i];
      if (e.context !== context) break;
      baseLines.push(...e.baseLines);
      leftLines.push(...e.leftLines);
      rightLines.push(...e.rightLines);
      if (e.status === 'conflict') status = 'conflict';
      else if (status !== 'conflict' && e.status !== status) status = 'conflict';
      i++;
    }

    hunks.push({ index: hunks.length, baseLines, leftLines, rightLines, status, context });
  }

  return { hunks };
}

export type ThreeWayDecision = 'left' | 'right' | 'base';

function autoResolve(hunk: ThreeWayHunk): readonly string[] | null {
  if (hunk.context) return hunk.baseLines;
  if (hunk.status === 'both-same') return hunk.leftLines; // both sides converged — leftLines === rightLines by construction
  if (hunk.status === 'left-only') return hunk.leftLines;
  if (hunk.status === 'right-only') return hunk.rightLines;
  return null; // 'conflict' — needs an explicit decision
}

export function buildThreeWayMergeOutput(
  hunks: readonly ThreeWayHunk[],
  decisions: ReadonlyMap<number, ThreeWayDecision>,
): string {
  const output: string[] = [];

  for (const hunk of hunks) {
    const decision = decisions.get(hunk.index);
    if (decision === 'left') {
      output.push(...hunk.leftLines);
      continue;
    }
    if (decision === 'right') {
      output.push(...hunk.rightLines);
      continue;
    }
    if (decision === 'base') {
      output.push(...hunk.baseLines);
      continue;
    }

    const resolved = autoResolve(hunk);
    if (resolved) {
      output.push(...resolved);
      continue;
    }

    output.push('<<<<<<< left', ...hunk.leftLines, '||||||| base', ...hunk.baseLines, '=======', ...hunk.rightLines, '>>>>>>> right');
  }

  return output.join('\n');
}
