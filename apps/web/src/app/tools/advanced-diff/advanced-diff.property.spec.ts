import fc from 'fast-check';
import { describe, it } from 'vitest';
import { neverThrows, invariant } from "../../../../../../tests/property-harness";
import { computeLineDiff } from "@dude/tool-engine/tools/diff/text-diff";
import { buildHunks, buildMergedOutput, MergeDecision } from "@dude/tool-engine/tools/advanced-diff/diff-hunks";
import { formatUnifiedDiff } from "@dude/tool-engine/tools/advanced-diff/unified-diff";
import { computeLineDiffIgnoring, IgnoreOptions, normalizeLine } from "@dude/tool-engine/tools/advanced-diff/diff-normalize";

const lineArb = fc.string().filter((s) => !s.includes('\n'));
const linesArb = fc.array(lineArb, { maxLength: 15 });
const textArb = linesArb.map((lines) => lines.join('\n'));
const ignoreOptionsArb = fc.record({
  ignoreWhitespace: fc.boolean(),
  ignoreLineEndings: fc.boolean(),
  ignoreCase: fc.boolean(),
});

describe('diff-normalize (pure core) fuzzing', () => {
  it('normalizeLine never throws and is idempotent for arbitrary lines/options', () => {
    invariant(
      ([line, options]: [string, IgnoreOptions]) => normalizeLine(line, options),
      fc.tuple(lineArb, ignoreOptionsArb),
      (normalized, [, options]) => normalizeLine(normalized, options) === normalized,
    );
  });

  it('computeLineDiffIgnoring never throws for arbitrary text/options', () => {
    neverThrows(
      ([left, right, options]: [string, string, IgnoreOptions]) => computeLineDiffIgnoring(left, right, options),
      fc.tuple(textArb, textArb, ignoreOptionsArb),
    );
  });
});

describe('unified-diff (pure core) fuzzing', () => {
  it('formatUnifiedDiff never throws for diff lines produced from arbitrary text', () => {
    neverThrows(([left, right]: [string, string]) => formatUnifiedDiff(computeLineDiff(left, right).lines), fc.tuple(textArb, textArb));
  });

  it('formatUnifiedDiff returns empty output only when there are no changes', () => {
    invariant(
      ([left, right]: [string, string]) => {
        const result = computeLineDiff(left, right);
        return { patch: formatUnifiedDiff(result.lines), changed: result.summary.added + result.summary.removed > 0 };
      },
      fc.tuple(textArb, textArb),
      ({ patch, changed }) => (changed ? patch.length > 0 : patch === ''),
    );
  });
});

// join('\n')/splitLines follow the standard "trailing newline means no extra empty last line"
// convention, so a line array ending in '' can't be told apart from the shorter array without
// that trailing empty string once it's flattened to text -- excluded here for that reason.
const reconstructableLinesArb = linesArb.filter((lines) => lines.length === 0 || lines[lines.length - 1] !== '');

describe('diff-hunks (pure core) reconstruction property', () => {
  it('resolving every hunk to "left" or "right" reconstructs the original left/right text', () => {
    invariant(
      ([leftLines, rightLines]: [readonly string[], readonly string[]]) => {
        const left = leftLines.join('\n');
        const right = rightLines.join('\n');
        const result = computeLineDiff(left, right);
        const hunks = buildHunks(result.lines);

        const decisionsFor = (decision: MergeDecision) => new Map(hunks.map((hunk) => [hunk.index, decision] as const));

        return {
          left,
          right,
          mergedLeft: buildMergedOutput(result.lines, hunks, decisionsFor('left')),
          mergedRight: buildMergedOutput(result.lines, hunks, decisionsFor('right')),
        };
      },
      fc.tuple(reconstructableLinesArb, reconstructableLinesArb),
      ({ left, right, mergedLeft, mergedRight }) => mergedLeft === left && mergedRight === right,
    );
  });
});
