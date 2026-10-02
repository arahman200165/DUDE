import DiffMatchPatch from 'diff-match-patch';

/**
 * Pure, framework-free character- and word-level diffing for the Advanced
 * Diff/Merge tool's fine-grained highlighting modes. Complements
 * `../diff/text-diff.ts`'s line-oriented `computeLineDiff` (reused directly,
 * not duplicated) with two finer granularities:
 *
 * - Char mode calls `diff-match-patch`'s `diff_main` directly — it already
 *   diffs at character granularity.
 * - Word mode maps each word/whitespace token to a synthetic single
 *   character (the same "collapse to a single-char alphabet, diff, expand"
 *   technique `text-diff.ts` uses for lines via `diff_linesToChars_`) so
 *   `diff_main`'s character-level algorithm effectively operates over
 *   tokens instead. This is a generic token mapper, not tied to newlines,
 *   so it doesn't reuse dmp's line-specific (and newline-joining) helpers.
 */

export type DiffSegmentType = 'add' | 'remove' | 'equal';

export interface DiffSegment {
  readonly type: DiffSegmentType;
  readonly text: string;
}

export interface FineDiffSummary {
  readonly addedChars: number;
  readonly removedChars: number;
}

export interface FineDiffResult {
  readonly segments: readonly DiffSegment[];
  readonly summary: FineDiffSummary;
}

function toSegments(diffs: readonly [number, string][]): DiffSegment[] {
  return diffs.map(([op, text]) => ({
    type: op === DiffMatchPatch.DIFF_INSERT ? 'add' : op === DiffMatchPatch.DIFF_DELETE ? 'remove' : 'equal',
    text,
  }));
}

function summarize(segments: readonly DiffSegment[]): FineDiffSummary {
  let addedChars = 0;
  let removedChars = 0;
  for (const segment of segments) {
    if (segment.type === 'add') addedChars += segment.text.length;
    else if (segment.type === 'remove') removedChars += segment.text.length;
  }
  return { addedChars, removedChars };
}

export function computeCharDiff(left: string, right: string): FineDiffResult {
  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(left, right);
  dmp.diff_cleanupSemantic(diffs);
  const segments = toSegments(diffs);
  return { segments, summary: summarize(segments) };
}

/** Splits into alternating non-whitespace/whitespace runs — concatenating the result reproduces the input exactly. */
export function tokenizeWords(text: string): readonly string[] {
  return text.match(/\S+|\s+/g) ?? [];
}

function tokensToSyntheticChars(
  tokensLeft: readonly string[],
  tokensRight: readonly string[],
): { charsLeft: string; charsRight: string; tokenArray: readonly string[] } {
  const tokenArray: string[] = [];
  const tokenIndex = new Map<string, number>();

  function encode(tokens: readonly string[]): string {
    let chars = '';
    for (const token of tokens) {
      let index = tokenIndex.get(token);
      if (index === undefined) {
        index = tokenArray.length;
        tokenArray.push(token);
        tokenIndex.set(token, index);
      }
      chars += String.fromCharCode(index + 1); // +1 avoids the reserved null character
    }
    return chars;
  }

  const charsLeft = encode(tokensLeft);
  const charsRight = encode(tokensRight);
  return { charsLeft, charsRight, tokenArray };
}

export function computeWordDiff(left: string, right: string): FineDiffResult {
  const { charsLeft, charsRight, tokenArray } = tokensToSyntheticChars(tokenizeWords(left), tokenizeWords(right));

  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(charsLeft, charsRight);
  dmp.diff_cleanupSemantic(diffs);

  const segments = toSegments(diffs).map((segment) => ({
    ...segment,
    text: Array.from(segment.text)
      .map((char) => tokenArray[char.codePointAt(0)! - 1])
      .join(''),
  }));

  return { segments, summary: summarize(segments) };
}
