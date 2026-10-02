import { computeLineDiff, DiffLine, DiffResult, splitLines } from "../diff/text-diff.js";

export interface IgnoreOptions {
  readonly ignoreWhitespace: boolean;
  readonly ignoreLineEndings: boolean;
  readonly ignoreCase: boolean;
}

export const NO_IGNORE_OPTIONS: IgnoreOptions = {
  ignoreWhitespace: false,
  ignoreLineEndings: false,
  ignoreCase: false,
};

export function hasAnyIgnoreOption(options: IgnoreOptions): boolean {
  return options.ignoreWhitespace || options.ignoreLineEndings || options.ignoreCase;
}

export function normalizeLine(line: string, options: IgnoreOptions): string {
  let result = options.ignoreLineEndings ? line.replace(/\r$/, '') : line;
  if (options.ignoreWhitespace) result = result.trim().replace(/[ \t]+/g, ' ');
  if (options.ignoreCase) result = result.toLowerCase();
  return result;
}

export function normalizeWholeText(text: string, options: IgnoreOptions): string {
  return splitLines(text)
    .map((line) => normalizeLine(line, options))
    .join('\n');
}

/**
 * Diffs `left`/`right` after normalizing each line per `options`, then remaps the result back onto
 * the *original* line text for display -- the diff should never show normalized text to the user.
 * Relies on the same alignment invariant `three-way-merge.ts` documents: computeLineDiff's 'equal'/
 * 'remove' entries walk the left sequence in order, and 'add' entries walk the right sequence in
 * order, so original lines can be substituted back in lockstep by two independent counters.
 */
export function computeLineDiffIgnoring(left: string, right: string, options: IgnoreOptions): DiffResult {
  if (!hasAnyIgnoreOption(options)) return computeLineDiff(left, right);

  const originalLeftLines = splitLines(left);
  const originalRightLines = splitLines(right);
  const normalizedLeft = originalLeftLines.map((line) => normalizeLine(line, options)).join('\n');
  const normalizedRight = originalRightLines.map((line) => normalizeLine(line, options)).join('\n');

  const normalizedResult = computeLineDiff(normalizedLeft, normalizedRight);

  let leftIndex = 0;
  let rightIndex = 0;
  const lines: DiffLine[] = normalizedResult.lines.map((line) => {
    if (line.type === 'add') return { type: line.type, text: originalRightLines[rightIndex++] };
    return { type: line.type, text: originalLeftLines[leftIndex++] };
  });

  return { lines, summary: normalizedResult.summary };
}
