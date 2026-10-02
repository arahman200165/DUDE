/**
 * Domain-label homograph-risk heuristic, shared by URL Safety Inspector and Punycode
 * Converter's Inspect mode. Detects the classic IDN homograph pattern — a label mixing
 * two or more scripts (e.g. Cyrillic 'а' U+0430 alongside Latin "pple") — via native regex
 * Unicode property escapes (`\p{Script=Xx}`), the same technique `unicode-general-category.ts`
 * already uses. A single-script non-Latin label (e.g. a legitimate Cyrillic domain) is not
 * flagged — only a *mix* of scripts within one label is inherently suspicious.
 */
import { toASCII, toUnicode } from 'punycode';

const TRACKED_SCRIPTS = [
  'Latin',
  'Cyrillic',
  'Greek',
  'Armenian',
  'Han',
  'Hiragana',
  'Katakana',
  'Hangul',
  'Arabic',
  'Hebrew',
  'Devanagari',
  'Thai',
] as const;

const SCRIPT_REGEXES: ReadonlyArray<readonly [string, RegExp]> = TRACKED_SCRIPTS.map(
  (script) => [script, new RegExp(`\\p{Script=${script}}`, 'u')] as const,
);

const COMMON_OR_INHERITED = /\p{Script=Common}|\p{Script=Inherited}/u;

function scriptOf(char: string): string {
  for (const [name, regex] of SCRIPT_REGEXES) {
    if (regex.test(char)) return name;
  }
  return 'Other';
}

export interface LabelScriptFinding {
  readonly label: string;
  readonly scripts: readonly string[];
  readonly mixedScript: boolean;
}

export interface HomographAnalysis {
  readonly ok: true;
  readonly unicodeDomain: string;
  readonly asciiDomain: string;
  readonly isPunycode: boolean;
  readonly labels: readonly LabelScriptFinding[];
  readonly mixedScriptRisk: boolean;
}

export type HomographResult = HomographAnalysis | { readonly ok: false; readonly error: string };

export function analyzeDomainHomographRisk(domain: string): HomographResult {
  const trimmed = domain.trim();
  if (trimmed === '') {
    return { ok: false, error: 'Enter a domain name.' };
  }

  let asciiDomain: string;
  let unicodeDomain: string;
  try {
    asciiDomain = toASCII(trimmed);
    unicodeDomain = toUnicode(trimmed);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid domain name.' };
  }

  const isPunycode = trimmed.split('.').some((label) => label.toLowerCase().startsWith('xn--'));

  const labels: LabelScriptFinding[] = unicodeDomain.split('.').map((label) => {
    const scripts = new Set<string>();
    for (const char of Array.from(label)) {
      if (COMMON_OR_INHERITED.test(char)) continue;
      scripts.add(scriptOf(char));
    }
    const scriptList = Array.from(scripts);
    return { label, scripts: scriptList, mixedScript: scriptList.length > 1 };
  });

  return {
    ok: true,
    unicodeDomain,
    asciiDomain,
    isPunycode,
    labels,
    mixedScriptRisk: labels.some((l) => l.mixedScript),
  };
}
