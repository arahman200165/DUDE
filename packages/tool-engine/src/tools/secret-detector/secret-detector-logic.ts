/**
 * Pure, framework-free heuristic secret detection: known credential-shape
 * regexes (AWS keys, GitHub/Slack tokens, PEM private keys, JWTs, generic
 * "key = value" assignments) plus a charset-based entropy estimate for
 * otherwise-unrecognized high-entropy tokens, mirroring the same
 * length * log2(charsetSize) approach as Password Strength Analyzer.
 */

export interface SecretFinding {
  readonly kind: string;
  readonly match: string;
  readonly index: number;
}

const PATTERNS: readonly { readonly kind: string; readonly re: RegExp }[] = [
  { kind: 'AWS Access Key ID', re: /AKIA[0-9A-Z]{16}/g },
  { kind: 'GitHub Token', re: /gh[pousr]_[A-Za-z0-9]{36,}/g },
  { kind: 'Slack Token', re: /xox[baprs]-[0-9A-Za-z-]{10,}/g },
  { kind: 'Private Key', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g },
  { kind: 'JWT', re: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g },
  { kind: 'Generic API key assignment', re: /(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"]?[A-Za-z0-9_\-/+=]{12,}['"]?/gi },
];

function estimateEntropyBits(text: string): number {
  let charsetSize = 0;
  if (/[a-z]/.test(text)) charsetSize += 26;
  if (/[A-Z]/.test(text)) charsetSize += 26;
  if (/[0-9]/.test(text)) charsetSize += 10;
  if (/[^A-Za-z0-9]/.test(text)) charsetSize += 32;
  return charsetSize === 0 ? 0 : text.length * Math.log2(charsetSize);
}

const HIGH_ENTROPY_TOKEN_RE = /[A-Za-z0-9_\-+/=]{20,}/g;
const HIGH_ENTROPY_BITS_THRESHOLD = 80;

function overlaps(start: number, end: number, ranges: readonly (readonly [number, number])[]): boolean {
  return ranges.some(([rangeStart, rangeEnd]) => start < rangeEnd && end > rangeStart);
}

export function detectSecrets(text: string): readonly SecretFinding[] {
  const findings: SecretFinding[] = [];
  const covered: (readonly [number, number])[] = [];

  for (const { kind, re } of PATTERNS) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      findings.push({ kind, match: match[0], index: match.index });
      covered.push([match.index, match.index + match[0].length]);
      if (match[0].length === 0) re.lastIndex++;
    }
  }

  HIGH_ENTROPY_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HIGH_ENTROPY_TOKEN_RE.exec(text))) {
    const start = match.index;
    const end = start + match[0].length;
    if (!overlaps(start, end, covered) && estimateEntropyBits(match[0]) >= HIGH_ENTROPY_BITS_THRESHOLD) {
      findings.push({ kind: 'High-entropy string', match: match[0], index: start });
    }
  }

  return findings.sort((a, b) => a.index - b.index);
}

/** Shows a short prefix/suffix instead of the raw matched secret. */
export function redactMatch(value: string): string {
  if (value.length <= 8) return '•'.repeat(value.length);
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
