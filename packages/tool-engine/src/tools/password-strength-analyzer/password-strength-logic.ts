/**
 * Pure password strength/entropy analysis. Framework-free.
 *
 * Entropy is computed as `length * log2(charsetSize)`, the standard formula
 * for a password drawn UNIFORMLY AT RANDOM from the detected character
 * classes. This systematically OVERESTIMATES the real-world guessability of
 * a human-chosen password (e.g. "Password1!" scores the same charset-based
 * entropy as an equally-long random string, despite being trivially
 * guessable) — this is exactly the gap that dictionary-based tools like
 * zxcvbn exist to close. DUDE deliberately doesn't bundle zxcvbn here (its
 * dictionary data is ~800KB+, a worse lazy-chunk cost than node-forge for a
 * single tool with no reuse elsewhere — see the Phase 12 plan). Instead this
 * analyzer pairs the charset-entropy estimate with explicit pattern
 * penalties (common passwords, keyboard walks, sequences, repeats) to catch
 * the most obvious human-chosen weaknesses, and the UI must caveat that the
 * entropy figure alone assumes randomness.
 */

export type StrengthVerdict = 'very-weak' | 'weak' | 'fair' | 'good' | 'strong';

export interface PasswordAnalysis {
  readonly length: number;
  readonly charsetSize: number;
  readonly entropyBits: number;
  readonly verdict: StrengthVerdict;
  readonly penalties: readonly string[];
  readonly estimatedCrackTime: string;
}

const COMMON_PASSWORDS: ReadonlySet<string> = new Set(
  [
    'password',
    'password1',
    'password123',
    '123456',
    '1234567',
    '12345678',
    '123456789',
    '1234567890',
    'qwerty',
    'qwerty123',
    'letmein',
    'welcome',
    'welcome1',
    'monkey',
    'dragon',
    'master',
    'abc123',
    'iloveyou',
    'admin',
    'administrator',
    'login',
    'passw0rd',
    'trustno1',
    'football',
    'baseball',
    'shadow',
    'superman',
    'michael',
    'sunshine',
    'princess',
    'letmein1',
    'password!',
    '111111',
    '000000',
    'starwars',
    'freedom',
    'whatever',
    'access',
    'flower',
    'hottie',
  ].map((word) => word.toLowerCase()),
);

const KEYBOARD_WALKS: readonly string[] = [
  'qwerty',
  'qwertyuiop',
  'asdf',
  'asdfgh',
  'asdfghjkl',
  'zxcv',
  'zxcvbn',
  'zxcvbnm',
  '1qaz',
  '1q2w3e',
  'qazwsx',
];

function detectCharsetSize(pw: string): number {
  let size = 0;
  if (/[a-z]/.test(pw)) size += 26;
  if (/[A-Z]/.test(pw)) size += 26;
  if (/[0-9]/.test(pw)) size += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) size += 33; // common printable ASCII symbols
  return size;
}

/** Longest ascending or descending run of consecutive characters (e.g. "abcd", "4321"). */
function longestSequentialRun(pw: string): number {
  let longest = 1;
  let current = 1;
  for (let i = 1; i < pw.length; i++) {
    const prev = pw.charCodeAt(i - 1);
    const curr = pw.charCodeAt(i);
    if (curr === prev + 1 || curr === prev - 1) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }
  return longest;
}

function longestRepeatedRun(pw: string): number {
  let longest = 1;
  let current = 1;
  for (let i = 1; i < pw.length; i++) {
    if (pw[i] === pw[i - 1]) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }
  return longest;
}

function detectPenalties(pw: string): string[] {
  const penalties: string[] = [];
  const lower = pw.toLowerCase();

  if (pw.length > 0 && COMMON_PASSWORDS.has(lower)) {
    penalties.push('Matches an extremely common password.');
  }

  for (const walk of KEYBOARD_WALKS) {
    if (lower.includes(walk)) {
      penalties.push(`Contains a keyboard-walk pattern ("${walk}").`);
      break;
    }
  }

  if (longestSequentialRun(pw) >= 4) {
    penalties.push('Contains a sequential run of 4+ characters (e.g. "abcd", "1234").');
  }

  if (longestRepeatedRun(pw) >= 4) {
    penalties.push('Contains a repeated character run of 4+ (e.g. "aaaa").');
  }

  if (pw.length > 0 && pw.length < 8) {
    penalties.push('Shorter than 8 characters.');
  }

  return penalties;
}

/** Rough order-of-magnitude crack-time estimate, assuming 10^10 guesses/sec (a commonly cited offline fast-hash attack rate). */
function estimateCrackTime(entropyBits: number): string {
  const GUESSES_PER_SECOND = 1e10;
  const seconds = Math.pow(2, entropyBits) / GUESSES_PER_SECOND;

  if (seconds < 1) return 'instantly';
  if (seconds < 60) return 'a few seconds';
  if (seconds < 3600) return 'a few minutes';
  if (seconds < 86_400) return 'a few hours';
  if (seconds < 30 * 86_400) return 'a few days';
  if (seconds < 365 * 86_400) return 'a few months';
  if (seconds < 100 * 365 * 86_400) return 'a few years';
  if (seconds < 1e6 * 365 * 86_400) return 'centuries';
  return 'eons';
}

function verdictFor(entropyBits: number, penalties: readonly string[], length: number): StrengthVerdict {
  if (length === 0) return 'very-weak';

  // Heavy penalty for landing in a known-weak bucket regardless of raw entropy.
  const hasCriticalPenalty = penalties.some(
    (p) => p.includes('common password') || p.includes('keyboard-walk'),
  );
  if (hasCriticalPenalty) return 'very-weak';

  let score = entropyBits;
  score -= penalties.length * 10;

  if (score < 28) return 'very-weak';
  if (score < 36) return 'weak';
  if (score < 60) return 'fair';
  if (score < 80) return 'good';
  return 'strong';
}

export function analyzePassword(pw: string): PasswordAnalysis {
  const charsetSize = detectCharsetSize(pw);
  const entropyBits = pw.length === 0 || charsetSize === 0 ? 0 : pw.length * Math.log2(charsetSize);
  const penalties = detectPenalties(pw);
  const verdict = verdictFor(entropyBits, penalties, pw.length);
  const estimatedCrackTime = pw.length === 0 ? 'n/a' : estimateCrackTime(entropyBits);

  return {
    length: pw.length,
    charsetSize,
    entropyBits,
    verdict,
    penalties,
    estimatedCrackTime,
  };
}
