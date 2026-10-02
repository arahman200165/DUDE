/**
 * Pure, framework-free DST transition listing for a chosen zone/year, built
 * on the shared `dst-transitions.ts` scan/binary-search utility.
 */
import { DateTime } from 'luxon';
import { DstDirection, findDstTransitions, formatOffsetMinutes } from "../../shared/utils/dst-transitions.js";

export interface DstTransitionRow {
  readonly date: string;
  readonly localTimeBefore: string;
  readonly localTimeAfter: string;
  readonly direction: DstDirection;
  readonly fromOffset: string;
  readonly toOffset: string;
  readonly gapMinutes: number;
}

export type ExploreResult =
  | { readonly ok: true; readonly rows: readonly DstTransitionRow[] }
  | { readonly ok: false; readonly error: string };

export function exploreDstTransitions(zone: string, year: number): ExploreResult {
  if (zone.trim() === '') return { ok: false, error: 'Choose a timezone.' };
  if (!Number.isInteger(year)) return { ok: false, error: 'Enter a valid year.' };

  const probe = DateTime.fromObject({ year, month: 1, day: 1 }, { zone });
  if (!probe.isValid) return { ok: false, error: `Unknown timezone: "${zone}"` };

  const rows = findDstTransitions(zone, year).map((transition) => {
    const before = DateTime.fromMillis(transition.instantMs - 1, { zone });
    const after = DateTime.fromMillis(transition.instantMs, { zone });
    return {
      date: after.toISODate()!,
      localTimeBefore: before.toFormat('HH:mm'),
      localTimeAfter: after.toFormat('HH:mm'),
      direction: transition.direction,
      fromOffset: formatOffsetMinutes(transition.fromOffsetMinutes),
      toOffset: formatOffsetMinutes(transition.toOffsetMinutes),
      gapMinutes: transition.gapMinutes,
    };
  });

  return { ok: true, rows };
}
