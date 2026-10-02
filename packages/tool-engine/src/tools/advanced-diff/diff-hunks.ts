import { DiffLine } from "../diff/text-diff.js";

/**
 * Pure, framework-free hunk grouping built on top of `computeLineDiff`'s
 * flat `DiffLine[]` — shared structural backbone for the merge view (accept
 * left/right per hunk) and the unified-diff exporter's hunk headers.
 *
 * A hunk is a maximal contiguous run of non-`equal` lines.
 */
export interface DiffHunk {
  readonly index: number;
  readonly removedLines: readonly string[];
  readonly addedLines: readonly string[];
}

export function buildHunks(lines: readonly DiffLine[]): readonly DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let i = 0;

  while (i < lines.length) {
    if (lines[i].type === 'equal') {
      i++;
      continue;
    }

    const removedLines: string[] = [];
    const addedLines: string[] = [];
    while (i < lines.length && lines[i].type !== 'equal') {
      if (lines[i].type === 'remove') removedLines.push(lines[i].text);
      else addedLines.push(lines[i].text);
      i++;
    }
    hunks.push({ index: hunks.length, removedLines, addedLines });
  }

  return hunks;
}

export type MergeDecision = 'left' | 'right';

/**
 * Reconstructs the merged text by walking the original diff in order,
 * keeping `equal` lines as shared context and resolving each hunk to its
 * left or right lines — or, while unresolved, a familiar textual conflict
 * marker (no git/3-way semantics implied; this is a plain two-way merge).
 */
export function buildMergedOutput(
  lines: readonly DiffLine[],
  hunks: readonly DiffHunk[],
  decisions: ReadonlyMap<number, MergeDecision>,
): string {
  const output: string[] = [];
  let i = 0;
  let hunkPointer = 0;

  while (i < lines.length) {
    if (lines[i].type === 'equal') {
      output.push(lines[i].text);
      i++;
      continue;
    }

    const hunk = hunks[hunkPointer++];
    const decision = decisions.get(hunk.index);

    if (decision === 'left') {
      output.push(...hunk.removedLines);
    } else if (decision === 'right') {
      output.push(...hunk.addedLines);
    } else {
      output.push('<<<<<<< left', ...hunk.removedLines, '=======', ...hunk.addedLines, '>>>>>>> right');
    }

    i += hunk.removedLines.length + hunk.addedLines.length;
  }

  return output.join('\n');
}
