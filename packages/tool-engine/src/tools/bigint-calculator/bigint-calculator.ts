import { parseInBase } from "../../shared/utils/bigint-radix.js";

export type BigCalcOp = 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'pow' | 'factorial';

export type BigCalcResult = { readonly ok: true; readonly value: bigint } | { readonly ok: false; readonly error: string };

/** Guards against a pathologically large exponent/factorial freezing the tab. */
const MAX_POW_EXPONENT = 100_000n;
const MAX_FACTORIAL_N = 100_000n;

/** Parses a value with an optional sign and an optional 0x/0b/0o base prefix; bare digits are decimal. No size limit. */
export function parseBigInt(input: string): BigCalcResult {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: 'Enter a value.' };

  const negative = trimmed.startsWith('-');
  const body = negative ? trimmed.slice(1) : trimmed;

  const parsed = /^0x/i.test(body)
    ? parseInBase(body.slice(2), 16)
    : /^0b/i.test(body)
      ? parseInBase(body.slice(2), 2)
      : /^0o/i.test(body)
        ? parseInBase(body.slice(2), 8)
        : parseInBase(body, 10);

  if (!parsed.ok) return parsed;
  return { ok: true, value: negative ? -parsed.value : parsed.value };
}

export function computeBigCalc(a: bigint, b: bigint, op: BigCalcOp): BigCalcResult {
  switch (op) {
    case 'add':
      return { ok: true, value: a + b };
    case 'sub':
      return { ok: true, value: a - b };
    case 'mul':
      return { ok: true, value: a * b };
    case 'div':
      return b === 0n ? { ok: false, error: 'Division by zero.' } : { ok: true, value: a / b };
    case 'mod':
      return b === 0n ? { ok: false, error: 'Division by zero.' } : { ok: true, value: a % b };
    case 'pow':
      if (b < 0n) return { ok: false, error: 'Exponent must be non-negative.' };
      if (b > MAX_POW_EXPONENT) return { ok: false, error: `Exponent is limited to ${MAX_POW_EXPONENT} to avoid freezing the tab.` };
      return { ok: true, value: a ** b };
    case 'factorial':
      if (a < 0n) return { ok: false, error: 'Factorial is undefined for negative numbers.' };
      if (a > MAX_FACTORIAL_N) return { ok: false, error: `n is limited to ${MAX_FACTORIAL_N} to avoid freezing the tab.` };
      return { ok: true, value: factorial(a) };
  }
}

function factorial(n: bigint): bigint {
  let result = 1n;
  for (let i = 2n; i <= n; i++) result *= i;
  return result;
}
