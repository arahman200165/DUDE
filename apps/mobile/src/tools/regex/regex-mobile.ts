import { findMatches, replaceMatches, type RegexMatchEntry } from '@dude/tool-engine/tools/regex/regex-match';

/**
 * Web runs matching in a Worker so a catastrophic pattern can be cancelled after 3 s. Android runs it on the JS thread (there is no
 * cancellable worker for a synchronous `exec`), so the mobile screen bounds the work instead: small input caps, a render cap and a
 * heuristic guard that asks before running a nested-quantifier pattern against more than a few characters.
 */
export const MAX_TEXT_LENGTH = 64 * 1024;
export const MAX_PATTERN_LENGTH = 2_000;
export const MAX_REPLACEMENT_LENGTH = 2_000;
/** Matches rendered in the list; the count still reports every match the engine found. */
export const MAX_RENDERED_MATCHES = 200;
/** A nested-quantifier pattern cannot hurt on a handful of characters, so the guard only applies above this length. */
const GUARD_MIN_TEXT = 24;

export const FLAG_CHARS = ['g', 'i', 'm', 's', 'u', 'y'] as const;
export type RegexFlag = (typeof FLAG_CHARS)[number];

/** Canonical-order flag string from any flag characters. Unknown characters are dropped. */
export function normalizeFlags(flags: string): string {
  return FLAG_CHARS.filter(flag => flags.includes(flag)).join('');
}
/** Preference decode for the persisted `flags` key (a plain string, as on web). */
export function decodeFlags(raw: unknown): string | null {
  return typeof raw === 'string' && /^[gimsuy]*$/.test(raw) ? raw : null;
}
export function toggleFlag(flags: string, flag: RegexFlag): string {
  return normalizeFlags(flags.includes(flag) ? flags.replace(flag, '') : flags + flag);
}

// A group whose body holds an unbounded quantifier and that is itself repeated without bound, e.g. (a+)+ or (\w+\s?)*.
const NESTED_QUANTIFIER = /\((?:[^()\\]|\\.)*(?:[+*]|\{\d+,\d*\})(?:[^()\\]|\\.)*\)(?:[+*]|\{\d+,\d*\})/;
export function isRiskyPattern(pattern: string): boolean {
  return NESTED_QUANTIFIER.test(pattern);
}

export type RegexMobileRequest =
  | { readonly kind: 'match'; readonly pattern: string; readonly flags: string; readonly text: string }
  | { readonly kind: 'replace'; readonly pattern: string; readonly flags: string; readonly text: string; readonly replacement: string };

export type RegexMobileOutcome =
  | { readonly status: 'idle' }
  | { readonly status: 'error'; readonly error: string }
  | { readonly status: 'guarded'; readonly reason: string }
  | { readonly status: 'matches'; readonly total: number; readonly matches: readonly RegexMatchEntry[]; readonly truncated: boolean }
  | { readonly status: 'replaced'; readonly output: string };

export function runRegex(request: RegexMobileRequest, options: { readonly allowRisky?: boolean } = {}): RegexMobileOutcome {
  if (request.pattern === '') return { status: 'idle' };
  if (request.pattern.length > MAX_PATTERN_LENGTH) return { status: 'error', error: `The pattern is limited to ${MAX_PATTERN_LENGTH.toLocaleString('en-US')} characters on Android.` };
  if (request.text.length > MAX_TEXT_LENGTH) return { status: 'error', error: `The test text is limited to ${MAX_TEXT_LENGTH / 1024} KiB on Android.` };
  if (request.kind === 'replace' && request.replacement.length > MAX_REPLACEMENT_LENGTH) return { status: 'error', error: `The replacement is limited to ${MAX_REPLACEMENT_LENGTH.toLocaleString('en-US')} characters on Android.` };
  if (!options.allowRisky && request.text.length > GUARD_MIN_TEXT && isRiskyPattern(request.pattern)) {
    return { status: 'guarded', reason: 'This pattern repeats a group that already contains a repeat, which can backtrack catastrophically and freeze the app. Android cannot cancel a running pattern.' };
  }
  if (request.kind === 'replace') {
    const result = replaceMatches(request.pattern, request.flags, request.text, request.replacement);
    return result.ok ? { status: 'replaced', output: result.output } : { status: 'error', error: result.error };
  }
  const result = findMatches(request.pattern, request.flags, request.text);
  if (!result.ok) return { status: 'error', error: result.error };
  return {
    status: 'matches', total: result.matches.length, truncated: result.matches.length > MAX_RENDERED_MATCHES,
    matches: result.matches.length > MAX_RENDERED_MATCHES ? result.matches.slice(0, MAX_RENDERED_MATCHES) : result.matches,
  };
}

export const matchCountLabel = (total: number): string => `${total} match${total === 1 ? '' : 'es'}`;
