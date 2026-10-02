/**
 * Pure, framework-free glob matching, built on `picomatch` since correctly
 * supporting the full glob grammar (`**`, extglobs, brace expansion,
 * negation, character classes) is easy to get subtly wrong by hand.
 */
import picomatch from 'picomatch';

export interface GlobOptions {
  readonly dot: boolean;
  readonly nocase: boolean;
  readonly treatBackslashAsSeparator: boolean;
}

export interface GlobPathResult {
  readonly path: string;
  readonly matched: boolean;
}

export type GlobMatchResult =
  | { readonly ok: true; readonly results: readonly GlobPathResult[] }
  | { readonly ok: false; readonly error: string };

export function matchPaths(pattern: string, paths: readonly string[], options: GlobOptions): GlobMatchResult {
  if (pattern.trim() === '') {
    return { ok: false, error: 'Enter a glob pattern.' };
  }

  let isMatch: picomatch.Matcher;
  try {
    isMatch = picomatch(pattern, { dot: options.dot, nocase: options.nocase, windows: options.treatBackslashAsSeparator });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid glob pattern.' };
  }

  const candidates = paths.map((path) => path.trim()).filter((path) => path !== '');
  const results = candidates.map((path) => ({ path, matched: isMatch(path) }));

  return { ok: true, results };
}
