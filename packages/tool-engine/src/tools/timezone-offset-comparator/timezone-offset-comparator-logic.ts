/**
 * Pure, framework-free timezone offset comparison, in two modes: a year-long
 * grid (to spot asymmetric DST schedules across zones) and a pairwise
 * "how far ahead/behind" calculator (with when that gap next changes),
 * both built on the shared `dst-transitions.ts` utility.
 */
import { DateTime } from 'luxon';
import { DstTransition, formatOffsetMinutes, nextDstTransition } from "../../shared/utils/dst-transitions.js";

export interface GridInput {
  readonly zones: readonly string[];
  readonly year: number;
}

export interface GridRow {
  readonly zone: string;
  /** UTC offset at the start of each month, January through December. */
  readonly monthlyOffsets: readonly string[];
}

export type GridResult = { readonly ok: true; readonly rows: readonly GridRow[] } | { readonly ok: false; readonly error: string };

export function buildOffsetGrid(input: GridInput): GridResult {
  if (input.zones.length === 0) return { ok: false, error: 'Add at least one timezone.' };
  if (!Number.isInteger(input.year)) return { ok: false, error: 'Enter a valid year.' };

  const rows: GridRow[] = [];
  for (const zone of input.zones) {
    const monthlyOffsets: string[] = [];
    for (let month = 1; month <= 12; month++) {
      const probe = DateTime.fromObject({ year: input.year, month, day: 1 }, { zone });
      if (!probe.isValid) return { ok: false, error: `Unknown timezone: "${zone}"` };
      monthlyOffsets.push(formatOffsetMinutes(probe.offset));
    }
    rows.push({ zone, monthlyOffsets });
  }

  return { ok: true, rows };
}

export interface PairwiseInput {
  readonly zoneA: string;
  readonly zoneB: string;
  readonly atMs: number;
}

export interface PairwiseNextChange {
  readonly zone: string;
  readonly whenIso: string;
  readonly newGapMinutes: number;
}

export interface PairwiseResult {
  readonly offsetA: string;
  readonly offsetB: string;
  /** Positive: A is ahead of B. Negative: A is behind B. */
  readonly gapMinutes: number;
  readonly gapLabel: string;
  readonly nextChange?: PairwiseNextChange;
}

export type PairwiseCompareResult =
  | { readonly ok: true; readonly result: PairwiseResult }
  | { readonly ok: false; readonly error: string };

export function comparePairwise(input: PairwiseInput): PairwiseCompareResult {
  const a = DateTime.fromMillis(input.atMs, { zone: input.zoneA });
  const b = DateTime.fromMillis(input.atMs, { zone: input.zoneB });
  if (!a.isValid) return { ok: false, error: `Unknown timezone: "${input.zoneA}"` };
  if (!b.isValid) return { ok: false, error: `Unknown timezone: "${input.zoneB}"` };

  const gapMinutes = a.offset - b.offset;
  const earliest = earliestTransition(input.zoneA, input.zoneB, input.atMs);

  let nextChange: PairwiseNextChange | undefined;
  if (earliest) {
    const offsetAAfter = earliest.zone === input.zoneA ? earliest.transition.toOffsetMinutes : a.offset;
    const offsetBAfter = earliest.zone === input.zoneB ? earliest.transition.toOffsetMinutes : b.offset;
    nextChange = {
      zone: earliest.zone,
      whenIso: new Date(earliest.transition.instantMs).toISOString(),
      newGapMinutes: offsetAAfter - offsetBAfter,
    };
  }

  return {
    ok: true,
    result: { offsetA: formatOffsetMinutes(a.offset), offsetB: formatOffsetMinutes(b.offset), gapMinutes, gapLabel: formatGapLabel(gapMinutes), nextChange },
  };
}

function earliestTransition(
  zoneA: string,
  zoneB: string,
  atMs: number,
): { readonly zone: string; readonly transition: DstTransition } | undefined {
  const transitionA = nextDstTransition(zoneA, atMs);
  const transitionB = nextDstTransition(zoneB, atMs);
  if (!transitionA) return transitionB ? { zone: zoneB, transition: transitionB } : undefined;
  if (!transitionB) return { zone: zoneA, transition: transitionA };
  return transitionA.instantMs <= transitionB.instantMs ? { zone: zoneA, transition: transitionA } : { zone: zoneB, transition: transitionB };
}

function formatGapLabel(gapMinutes: number): string {
  if (gapMinutes === 0) return 'Same time in both zones';

  const abs = Math.abs(gapMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  const parts: string[] = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);

  return `A is ${parts.join(' ')} ${gapMinutes > 0 ? 'ahead of' : 'behind'} B`;
}
