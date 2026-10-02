import DiffMatchPatch from 'diff-match-patch';

/**
 * Pure, framework-free line-oriented diff used by the Text Diff tool. Runs
 * inside `text-diff.worker.ts` for large inputs.
 *
 * diff-match-patch diffs at the character level by default; the standard
 * technique for a line-oriented diff is to first collapse each line to a
 * single synthetic character (`diff_linesToChars_`), diff those character
 * strings, then expand the result back to full lines (`diff_charsToLines_`).
 */

export type DiffLineType = 'add' | 'remove' | 'equal';

export interface DiffLine {
  readonly type: DiffLineType;
  readonly text: string;
}

export interface DiffSummary {
  readonly added: number;
  readonly removed: number;
  readonly unchanged: number;
}

export interface DiffResult {
  readonly lines: readonly DiffLine[];
  readonly summary: DiffSummary;
}

export function splitLines(text: string): readonly string[] {
  if (text === '') return [];
  const withoutTrailingNewline = text.endsWith('\n') ? text.slice(0, -1) : text;
  return withoutTrailingNewline.split('\n');
}

/**
 * `diff_linesToChars_` maps each exact line *including its trailing
 * newline* to a synthetic character, so a shared final line ends up mapped
 * to two different characters when only one side has a trailing newline
 * (a textarea's last line almost never has one) — that line then wrongly
 * shows up as removed+added instead of unchanged. Padding both sides to
 * always end in `\n` before diffing avoids that mismatch.
 */
function ensureTrailingNewline(text: string): string {
  if (text === '' || text.endsWith('\n')) return text;
  return `${text}\n`;
}

export function computeLineDiff(left: string, right: string): DiffResult {
  const dmp = new DiffMatchPatch();
  const { chars1, chars2, lineArray } = dmp.diff_linesToChars_(ensureTrailingNewline(left), ensureTrailingNewline(right));
  const diffs = dmp.diff_main(chars1, chars2, false);
  dmp.diff_cleanupSemantic(diffs);
  dmp.diff_charsToLines_(diffs, lineArray);

  const lines: DiffLine[] = [];
  const summary: { added: number; removed: number; unchanged: number } = { added: 0, removed: 0, unchanged: 0 };

  for (const [op, text] of diffs) {
    const type: DiffLineType = op === DiffMatchPatch.DIFF_INSERT ? 'add' : op === DiffMatchPatch.DIFF_DELETE ? 'remove' : 'equal';

    for (const lineText of splitLines(text)) {
      lines.push({ type, text: lineText });
      if (type === 'add') summary.added++;
      else if (type === 'remove') summary.removed++;
      else summary.unchanged++;
    }
  }

  return { lines, summary };
}
