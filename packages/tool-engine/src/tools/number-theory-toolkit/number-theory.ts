import { gcd, lcm } from "../../shared/utils/bigint-radix.js";

export type BigResult = { readonly ok: true; readonly value: bigint } | { readonly ok: false; readonly error: string };

// --- Modular arithmetic ---

export type ModOp = 'add' | 'sub' | 'mul' | 'pow';

export function modOp(a: bigint, b: bigint, m: bigint, op: ModOp): BigResult {
  if (m <= 0n) return { ok: false, error: 'Modulus must be positive.' };
  const norm = (v: bigint): bigint => ((v % m) + m) % m;

  switch (op) {
    case 'add':
      return { ok: true, value: norm(a + b) };
    case 'sub':
      return { ok: true, value: norm(a - b) };
    case 'mul':
      return { ok: true, value: norm(a * b) };
    case 'pow':
      if (b < 0n) return { ok: false, error: 'Exponent must be non-negative.' };
      return { ok: true, value: modPow(norm(a), b, m) };
  }
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  if (modulus === 1n) return 0n;
  let result = 1n;
  let b = base % modulus;
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulus;
    e >>= 1n;
    b = (b * b) % modulus;
  }
  return result;
}

export function modInverse(a: bigint, m: bigint): BigResult {
  if (m <= 0n) return { ok: false, error: 'Modulus must be positive.' };
  const [g, x] = extendedGcd(((a % m) + m) % m, m);
  if (g !== 1n) return { ok: false, error: 'No modular inverse exists: a and m are not coprime.' };
  return { ok: true, value: ((x % m) + m) % m };
}

function extendedGcd(a: bigint, b: bigint): readonly [bigint, bigint, bigint] {
  if (b === 0n) return [a, 1n, 0n];
  const [g, x1, y1] = extendedGcd(b, a % b);
  return [g, y1, x1 - (a / b) * y1];
}

// --- GCD / LCM of a list ---

export function gcdList(values: readonly bigint[]): BigResult {
  if (values.length === 0) return { ok: false, error: 'Enter at least one number.' };
  return { ok: true, value: values.reduce((acc, v) => gcd(acc, v)) };
}

export function lcmList(values: readonly bigint[]): BigResult {
  if (values.length === 0) return { ok: false, error: 'Enter at least one number.' };
  return { ok: true, value: values.reduce((acc, v) => lcm(acc, v)) };
}

// --- Prime checking / factorization (trial division; guarded for responsiveness) ---

/** sqrt(this) is ~1e6, keeping unworked trial division responsive without a Worker. */
const TRIAL_DIVISION_LIMIT = 1_000_000_000_000n;

export interface PrimeCheck {
  readonly isPrime: boolean;
  readonly smallestFactor?: bigint;
}

export type PrimeCheckOutcome = { readonly ok: true; readonly value: PrimeCheck } | { readonly ok: false; readonly error: string };

export function checkPrime(n: bigint): PrimeCheckOutcome {
  if (n > TRIAL_DIVISION_LIMIT) return { ok: false, error: `Number is too large to check here (limit: ${TRIAL_DIVISION_LIMIT}).` };
  if (n < 2n) return { ok: true, value: { isPrime: false } };
  if (n === 2n || n === 3n) return { ok: true, value: { isPrime: true } };
  if (n % 2n === 0n) return { ok: true, value: { isPrime: false, smallestFactor: 2n } };
  if (n % 3n === 0n) return { ok: true, value: { isPrime: false, smallestFactor: 3n } };

  for (let i = 5n; i * i <= n; i += 6n) {
    if (n % i === 0n) return { ok: true, value: { isPrime: false, smallestFactor: i } };
    if (n % (i + 2n) === 0n) return { ok: true, value: { isPrime: false, smallestFactor: i + 2n } };
  }

  return { ok: true, value: { isPrime: true } };
}

export type FactorizeResult = { readonly ok: true; readonly value: readonly bigint[] } | { readonly ok: false; readonly error: string };

export function factorize(n: bigint): FactorizeResult {
  if (n < 2n) return { ok: false, error: 'Enter an integer of at least 2.' };
  if (n > TRIAL_DIVISION_LIMIT) return { ok: false, error: `Number is too large to factorize here (limit: ${TRIAL_DIVISION_LIMIT}).` };

  const factors: bigint[] = [];
  let remaining = n;

  for (let p = 2n; p * p <= remaining; p += p === 2n ? 1n : 2n) {
    while (remaining % p === 0n) {
      factors.push(p);
      remaining /= p;
    }
  }
  if (remaining > 1n) factors.push(remaining);

  return { ok: true, value: factors };
}
