import { DiffLine, DiffLineType } from "../diff/text-diff.js";

/**
 * Pure, framework-free unified-diff (.patch) formatter built on top of
 * `computeLineDiff`'s `DiffLine[]`.
 *
 * `diff-match-patch`'s own `patch_make`/`patch_toText` do NOT produce a
 * genuinely standard/GNU-diff-compatible format — they're character-offset
 * based, designed for dmp's own `patch_apply`, not `git apply`/`patch`. This
 * hand-rolled formatter produces real `--- a`/`+++ b`/`@@ -l,n +l,n @@`
 * output instead.
 */

export interface UnifiedDiffOptions {
  readonly context?: number;
  readonly leftLabel?: string;
  readonly rightLabel?: string;
  readonly leftHasTrailingNewline?: boolean;
  readonly rightHasTrailingNewline?: boolean;
}

interface AnnotatedLine {
  readonly type: DiffLineType;
  readonly text: string;
  readonly leftNo?: number;
  readonly rightNo?: number;
}

function annotate(lines: readonly DiffLine[]): readonly AnnotatedLine[] {
  const annotated: AnnotatedLine[] = [];
  let leftNo = 0;
  let rightNo = 0;

  for (const line of lines) {
    if (line.type === 'equal') {
      leftNo++;
      rightNo++;
      annotated.push({ ...line, leftNo, rightNo });
    } else if (line.type === 'remove') {
      leftNo++;
      annotated.push({ ...line, leftNo });
    } else {
      rightNo++;
      annotated.push({ ...line, rightNo });
    }
  }

  return annotated;
}

function groupChanges(annotated: readonly AnnotatedLine[], context: number): readonly [number, number][] {
  const changeIndices: number[] = [];
  annotated.forEach((line, index) => {
    if (line.type !== 'equal') changeIndices.push(index);
  });
  if (changeIndices.length === 0) return [];

  const groups: [number, number][] = [];
  let start = changeIndices[0];
  let end = changeIndices[0];

  for (const index of changeIndices.slice(1)) {
    if (index - end <= context * 2 + 1) {
      end = index;
      continue;
    }
    groups.push([start, end]);
    start = index;
    end = index;
  }
  groups.push([start, end]);

  return groups;
}

export function formatUnifiedDiff(lines: readonly DiffLine[], options: UnifiedDiffOptions = {}): string {
  const context = options.context ?? 3;
  const leftLabel = options.leftLabel ?? 'a';
  const rightLabel = options.rightLabel ?? 'b';

  const annotated = annotate(lines);
  const groups = groupChanges(annotated, context);
  if (groups.length === 0) return '';

  const body: string[] = [];

  groups.forEach(([start, end], groupIndex) => {
    const hunkStart = Math.max(0, start - context);
    const hunkEnd = Math.min(annotated.length - 1, end + context);
    const slice = annotated.slice(hunkStart, hunkEnd + 1);

    const leftLines = slice.filter((line) => line.type !== 'add');
    const rightLines = slice.filter((line) => line.type !== 'remove');
    const leftStart = leftLines[0]?.leftNo ?? 0;
    const rightStart = rightLines[0]?.rightNo ?? 0;

    body.push(`@@ -${leftStart},${leftLines.length} +${rightStart},${rightLines.length} @@`);

    const isLastGroup = groupIndex === groups.length - 1;
    const lastSliceLine = slice[slice.length - 1];
    const sliceReachesEnd = hunkEnd === annotated.length - 1;

    slice.forEach((line, lineIndex) => {
      const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
      body.push(prefix + line.text);

      if (!isLastGroup || !sliceReachesEnd || line !== lastSliceLine) return;

      const missesLeftNewline = line.type !== 'add' && options.leftHasTrailingNewline === false;
      const missesRightNewline = line.type !== 'remove' && options.rightHasTrailingNewline === false;
      if (missesLeftNewline || missesRightNewline) body.push('\\ No newline at end of file');
      void lineIndex;
    });
  });

  return [`--- ${leftLabel}`, `+++ ${rightLabel}`, ...body].join('\n');
}
