/**
 * Non-AI, heuristic, offline pattern synthesis from example strings — distinct
 * from the already-shipped Phase 8 Stage 4 AI-based natural-language-to-regex
 * feature (desktop-only, `tools/regex/regex-ai.ts`), which stays untouched.
 *
 * Tokenizes each example into a run-length sequence of character classes
 * (digit/lower/upper/space/a specific literal char). If every example shares
 * the same run-kind sequence, each run generalizes to a class with a
 * `{min,max}` length quantifier observed across the examples; otherwise falls
 * back to an escaped-literal alternation. Either way the result is always
 * self-validated against every example (must match) and counter-example (must
 * not match) with the native `RegExp` before being returned — an unverified
 * pattern is never surfaced, matching this codebase's crypto-tools posture of
 * cross-validating output rather than trusting the algorithm blindly.
 */
export type RunKind = 'digit' | 'lower' | 'upper' | 'space' | 'literal';

export interface Run {
  readonly kind: RunKind;
  readonly text: string;
  readonly literalChar?: string;
}

export type GenerateResult =
  | { readonly ok: true; readonly pattern: string; readonly generalized: boolean }
  | { readonly ok: false; readonly error: string };

function classify(char: string): RunKind {
  if (/[0-9]/.test(char)) return 'digit';
  if (/[a-z]/.test(char)) return 'lower';
  if (/[A-Z]/.test(char)) return 'upper';
  if (/\s/.test(char)) return 'space';
  return 'literal';
}

export function tokenize(example: string): readonly Run[] {
  const runs: Run[] = [];
  for (const char of example) {
    const kind = classify(char);
    const last = runs[runs.length - 1];
    const sameLiteral = kind === 'literal' ? last?.literalChar === char : true;

    if (last && last.kind === kind && sameLiteral) {
      runs[runs.length - 1] = { ...last, text: last.text + char };
    } else {
      runs.push({ kind, text: char, literalChar: kind === 'literal' ? char : undefined });
    }
  }
  return runs;
}

interface RunShape {
  readonly kind: RunKind;
  readonly literalChar?: string;
}

function shapeOf(runs: readonly Run[]): readonly RunShape[] {
  return runs.map((r) => ({ kind: r.kind, literalChar: r.literalChar }));
}

function sameShape(a: readonly RunShape[], b: readonly RunShape[]): boolean {
  return a.length === b.length && a.every((r, i) => r.kind === b[i].kind && r.literalChar === b[i].literalChar);
}

function escapeRegexLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function classPattern(kind: RunKind): string {
  switch (kind) {
    case 'digit':
      return '\\d';
    case 'lower':
      return '[a-z]';
    case 'upper':
      return '[A-Z]';
    case 'space':
      return '\\s';
    case 'literal':
      return '';
  }
}

function quantifierFor(minLen: number, maxLen: number): string {
  if (minLen === maxLen) return minLen === 1 ? '' : `{${minLen}}`;
  return `{${minLen},${maxLen}}`;
}

function generalizeRun(shape: RunShape, minLen: number, maxLen: number): string {
  const base = shape.kind === 'literal' ? escapeRegexLiteral(shape.literalChar!) : classPattern(shape.kind);
  return `${base}${quantifierFor(minLen, maxLen)}`;
}

function buildGeneralizedPattern(tokenizedExamples: readonly (readonly Run[])[]): string {
  const shape = shapeOf(tokenizedExamples[0]);
  const parts = shape.map((runShape, i) => {
    const lengths = tokenizedExamples.map((runs) => runs[i].text.length);
    return generalizeRun(runShape, Math.min(...lengths), Math.max(...lengths));
  });
  return `^${parts.join('')}$`;
}

function buildLiteralAlternation(examples: readonly string[]): string {
  return `^(?:${examples.map(escapeRegexLiteral).join('|')})$`;
}

function validates(pattern: string, examples: readonly string[], counterExamples: readonly string[]): boolean {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    return false;
  }
  return examples.every((e) => regex.test(e)) && !counterExamples.some((c) => regex.test(c));
}

export function generateHeuristicRegex(rawExamples: readonly string[], rawCounterExamples: readonly string[] = []): GenerateResult {
  const examples = rawExamples.map((e) => e.trim()).filter((e) => e !== '');
  const counterExamples = rawCounterExamples.map((e) => e.trim()).filter((e) => e !== '');

  if (examples.length === 0) return { ok: false, error: 'Enter at least one example.' };

  const overlap = examples.find((e) => counterExamples.includes(e));
  if (overlap !== undefined) {
    return { ok: false, error: `"${overlap}" is listed as both an example and a counter-example — remove it from one list.` };
  }

  const tokenizedExamples = examples.map(tokenize);
  const firstShape = shapeOf(tokenizedExamples[0]);
  const allSameShape = tokenizedExamples.every((runs) => sameShape(shapeOf(runs), firstShape));

  if (allSameShape) {
    const generalized = buildGeneralizedPattern(tokenizedExamples);
    if (validates(generalized, examples, counterExamples)) return { ok: true, pattern: generalized, generalized: true };
  }

  const literal = buildLiteralAlternation(examples);
  if (validates(literal, examples, counterExamples)) return { ok: true, pattern: literal, generalized: false };

  return {
    ok: false,
    error: 'Could not synthesize a pattern that matches every example and rejects every counter-example — check for contradictions.',
  };
}
