export interface RangeOptions {
  readonly start: number;
  readonly end: number;
  readonly step: number;
}

export type RangeResult = { readonly ok: true; readonly value: readonly number[] } | { readonly ok: false; readonly error: string };

const MAX_COUNT = 100_000;

export function generateRange({ start, end, step }: RangeOptions): RangeResult {
  if (![start, end, step].every(Number.isFinite)) return { ok: false, error: 'Enter valid numbers.' };
  if (step === 0) return { ok: false, error: 'Step cannot be zero.' };
  if ((step > 0 && start > end) || (step < 0 && start < end)) return { ok: false, error: "Step direction never reaches the end value." };

  const count = Math.floor(Math.abs((end - start) / step) + 1e-9) + 1;
  if (count > MAX_COUNT) return { ok: false, error: `This would generate ${count} values; limit is ${MAX_COUNT}.` };

  const values: number[] = [];
  for (let i = 0; i < count; i++) values.push(roundToAvoidFloatNoise(start + i * step));
  return { ok: true, value: values };
}

function roundToAvoidFloatNoise(value: number): number {
  return Math.round(value * 1e10) / 1e10;
}

/** Zero-pads a number's magnitude to `width` digits, keeping a leading "-" for negatives outside the padding. */
export function padNumber(value: number, width: number): string {
  if (width <= 0) return String(value);
  const negative = value < 0;
  const digits = Math.abs(value).toString().padStart(width, '0');
  return negative ? `-${digits}` : digits;
}
