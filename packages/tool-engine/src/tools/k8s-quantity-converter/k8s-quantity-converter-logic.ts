/** Pure, framework-free Kubernetes resource quantity parsing/formatting — hand-rolled bit/decimal-suffix math per the API's quantity grammar. */

const BINARY_MULTIPLIERS: Record<string, number> = {
  Ki: 2 ** 10,
  Mi: 2 ** 20,
  Gi: 2 ** 30,
  Ti: 2 ** 40,
  Pi: 2 ** 50,
  Ei: 2 ** 60,
};

const DECIMAL_MULTIPLIERS: Record<string, number> = {
  n: 1e-9,
  u: 1e-6,
  m: 1e-3,
  '': 1,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
};

export const QUANTITY_UNITS: readonly string[] = ['n', 'u', 'm', '', 'k', 'M', 'G', 'T', 'P', 'E', 'Ki', 'Mi', 'Gi', 'Ti', 'Pi', 'Ei'];

const QUANTITY_RE = /^([+-]?[0-9]*\.?[0-9]+)([EPGMKT]i|[numkMGTPE]?)$/;

function multiplierFor(unit: string): number | undefined {
  return unit.endsWith('i') ? BINARY_MULTIPLIERS[unit] : DECIMAL_MULTIPLIERS[unit];
}

/** Returns the canonical (unit-less) numeric value of a Kubernetes quantity string, or null if malformed. */
export function parseQuantity(raw: string): number | null {
  const match = QUANTITY_RE.exec(raw.trim());
  if (!match) return null;

  const multiplier = multiplierFor(match[2]);
  if (multiplier === undefined) return null;

  return Number(match[1]) * multiplier;
}

export function formatQuantity(canonical: number, unit: string): string {
  const multiplier = multiplierFor(unit) ?? 1;
  const scaled = Math.round((canonical / multiplier) * 1e6) / 1e6;
  return `${scaled}${unit}`;
}

export interface QuantityConversion {
  readonly unit: string;
  readonly formatted: string;
}

export type QuantityConvertResult =
  | { readonly ok: true; readonly canonical: number; readonly conversions: readonly QuantityConversion[] }
  | { readonly ok: false; readonly error: string };

export function convertQuantity(raw: string): QuantityConvertResult {
  if (raw.trim() === '') return { ok: false, error: 'Enter a Kubernetes quantity (e.g. "500m", "1Gi", "2").' };

  const canonical = parseQuantity(raw);
  if (canonical === null) return { ok: false, error: `"${raw}" is not a valid Kubernetes quantity.` };

  const conversions = QUANTITY_UNITS.map((unit) => ({ unit: unit === '' ? '(none)' : unit, formatted: formatQuantity(canonical, unit) }));
  return { ok: true, canonical, conversions };
}
