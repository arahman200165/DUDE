import { StackTraceLanguage } from "./stack-trace-types.js";

/**
 * Cheap signature checks over the whole trace, ordered most-specific first, so an ambiguous
 * snippet (e.g. one lone "at " line) falls back to "unrecognized" rather than guessing wrong.
 */
export function detectStackTraceLanguage(text: string): StackTraceLanguage | 'unknown' {
  if (/Traceback \(most recent call last\):/.test(text)) return 'python';
  if (/^\s*at\s+(?:[\w.]+\/)?[\w$.<>]+\([^)]*\.java(?::\d+)?\)/m.test(text) || /^Caused by:/m.test(text)) return 'java';
  if (/\.cs:line \d+/.test(text) || /^\s*--->/m.test(text) || /^\s*at\s+[\w.]+\.[\w.<>`]+\(/m.test(text) && /System\.|Microsoft\./.test(text)) {
    return 'dotnet';
  }
  if (/^\s*at\s+.*\((?:.*\.[jt]sx?|node:[\w/]+|<anonymous>)[:)]/m.test(text) || /^\s*at\s+.*\.[jt]sx?:\d+:\d+\)?/m.test(text)) {
    return 'javascript';
  }
  return 'unknown';
}
