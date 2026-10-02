export interface ScientificBreakdown {
  readonly standard: string;
  readonly scientific: string;
  readonly scientificPretty: string;
  readonly engineering: string;
  readonly mantissa: number;
  readonly exponent: number;
}

export type ScientificResult = { readonly ok: true; readonly value: ScientificBreakdown } | { readonly ok: false; readonly error: string };

/** `significantDigits` controls how many digits the mantissa is rounded to (1-21). */
export function convertScientific(input: string, significantDigits = 6): ScientificResult {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: 'Enter a number.' };

  const num = Number(trimmed);
  if (Number.isNaN(num)) return { ok: false, error: 'Enter a valid number.' };
  if (!Number.isFinite(num)) return { ok: false, error: 'Number must be finite.' };

  const fractionDigits = Math.max(0, Math.min(20, significantDigits - 1));
  const expStr = num.toExponential(fractionDigits);
  const match = expStr.match(/^(-?\d(?:\.\d+)?)e([+-]\d+)$/);
  if (!match) return { ok: false, error: 'Could not convert this number.' };

  const mantissa = Number(match[1]);
  const exponent = Number(match[2]);

  const engineeringExponent = num === 0 ? 0 : Math.floor(exponent / 3) * 3;
  const engineeringMantissa = num === 0 ? 0 : Number((num / 10 ** engineeringExponent).toPrecision(significantDigits));

  return {
    ok: true,
    value: {
      standard: num.toString(),
      scientific: `${mantissa}e${exponent >= 0 ? '+' : ''}${exponent}`,
      scientificPretty: `${mantissa} × 10^${exponent}`,
      engineering: `${engineeringMantissa}e${engineeringExponent >= 0 ? '+' : ''}${engineeringExponent}`,
      mantissa,
      exponent,
    },
  };
}
