import { calculate } from 'specificity';

export interface SelectorScore {
  readonly selector: string;
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly formatted: string;
}

export type SelectorScoreResult = { readonly ok: true; readonly score: SelectorScore } | { readonly ok: false; readonly error: string };

/**
 * The `specificity` package only accepts a single selector, not a
 * comma-separated selector list, and throws on one (`"a,b" -> "Unexpected
 * input"`). Splitting on top-level commas lets a user paste a real selector
 * list (e.g. copied straight out of a stylesheet) and get each part scored.
 * This is a naive split -- it does not account for a comma inside a quoted
 * attribute value (`[data-x="a,b"]`), a known limitation.
 */
export function splitSelectorList(input: string): readonly string[] {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

export function scoreSelector(selector: string): SelectorScoreResult {
  const trimmed = selector.trim();
  if (trimmed === '') return { ok: false, error: 'Enter a CSS selector.' };

  try {
    const { A, B, C } = calculate(trimmed);
    return { ok: true, score: { selector: trimmed, a: A, b: B, c: C, formatted: `(${A},${B},${C})` } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not parse this selector.' };
  }
}

/** Classic CSS specificity comparison: compare A, then B, then C. */
export function compareScores(x: SelectorScore, y: SelectorScore): number {
  if (x.a !== y.a) return y.a - x.a;
  if (x.b !== y.b) return y.b - x.b;
  return y.c - x.c;
}

export interface RankedSelector {
  readonly result: SelectorScoreResult;
  readonly rank?: number;
}

/** Scores every selector in a list and ranks the ones that parsed successfully, most specific first. */
export function rankSelectors(input: string): readonly RankedSelector[] {
  const selectors = splitSelectorList(input);
  const results = selectors.map(scoreSelector);

  const scored = results.filter((r): r is { ok: true; score: SelectorScore } => r.ok).map((r) => r.score);
  scored.sort(compareScores);
  const rankOf = new Map(scored.map((s, i) => [s.selector, i + 1]));

  return results.map((result) => ({
    result,
    rank: result.ok ? rankOf.get(result.score.selector) : undefined,
  }));
}
