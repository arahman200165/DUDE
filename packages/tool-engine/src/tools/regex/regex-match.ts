/**
 * Pure, framework-free regex matching used by the Regex Tester tool. Runs
 * inside `regex-match.worker.ts` — a genuinely pathological pattern (e.g.
 * catastrophic backtracking) can only be stopped by terminating the worker
 * that is running it, which is what the tool's timeout/Cancel does; this
 * function itself cannot interrupt a single synchronous `exec` call.
 */

export interface RegexMatchGroup {
  readonly index: number;
  readonly name?: string;
  readonly value: string | undefined;
}

export interface RegexMatchEntry {
  readonly match: string;
  readonly index: number;
  readonly groups: readonly RegexMatchGroup[];
}

export type RegexMatchResult =
  | { readonly ok: true; readonly matches: readonly RegexMatchEntry[] }
  | { readonly ok: false; readonly error: string };

/** Hard cap so a pattern that matches at every position of a huge input still terminates. */
const MAX_MATCHES = 10_000;

export function findMatches(pattern: string, flags: string, testText: string): RegexMatchResult {
  if (pattern === '') return { ok: false, error: 'Enter a regular expression.' };

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  const matches: RegexMatchEntry[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(testText)) !== null && matches.length < MAX_MATCHES) {
    matches.push({ match: match[0], index: match.index, groups: buildGroups(match) });

    if (match[0] === '') regex.lastIndex++;
  }

  return { ok: true, matches };
}

export type RegexReplaceResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: string };

/**
 * Uses the flags exactly as given — unlike `findMatches`, which force-adds
 * `g` for enumeration purposes, replace mode must respect the user's actual
 * flags verbatim, since JS's own single-vs-`g` replace semantics *are* the
 * "Replace" vs "Replace All" distinction. `$1`/`$<name>` substitution is
 * native to `String.prototype.replace` — nothing to hand-roll here.
 */
export function replaceMatches(pattern: string, flags: string, testText: string, replacement: string): RegexReplaceResult {
  if (pattern === '') return { ok: false, error: 'Enter a regular expression.' };

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  return { ok: true, output: testText.replace(regex, replacement) };
}

function buildGroups(match: RegExpExecArray): readonly RegexMatchGroup[] {
  const groups: RegexMatchGroup[] = [];

  for (let i = 1; i < match.length; i++) {
    groups.push({ index: i, value: match[i] });
  }

  if (match.groups) {
    for (const [name, value] of Object.entries(match.groups)) {
      groups.push({ index: -1, name, value });
    }
  }

  return groups;
}
