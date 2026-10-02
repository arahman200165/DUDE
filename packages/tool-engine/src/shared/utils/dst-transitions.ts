/**
 * Pure, framework-free DST transition detection. Luxon (and the platform's
 * underlying `Intl` timezone database) exposes a zone's UTC offset at any
 * instant, but not "when did/does it last/next change" directly — so this
 * scans day-by-day across a year for an offset change, then binary-searches
 * within that day (to the minute) to pin the exact transition instant.
 * Shared by the DST Transition Explorer and Timezone Offset Comparator tools.
 */
import { DateTime } from 'luxon';

export type DstDirection = 'spring-forward' | 'fall-back';

export interface DstTransition {
  readonly instantMs: number;
  readonly fromOffsetMinutes: number;
  readonly toOffsetMinutes: number;
  readonly direction: DstDirection;
  readonly gapMinutes: number;
}

/** All DST transitions for `zone` within the calendar year `year` (in that zone's local calendar). */
export function findDstTransitions(zone: string, year: number): readonly DstTransition[] {
  const start = DateTime.fromObject({ year, month: 1, day: 1 }, { zone });
  if (!start.isValid) return [];

  const yearEnd = start.plus({ years: 1 });
  const transitions: DstTransition[] = [];

  let cursor = start;
  let prevOffset = cursor.offset;

  while (cursor.toMillis() < yearEnd.toMillis()) {
    const next = cursor.plus({ days: 1 });
    const nextOffset = next.offset;

    if (nextOffset !== prevOffset) {
      const instantMs = binarySearchTransitionMs(cursor.toMillis(), next.toMillis(), zone);
      transitions.push({
        instantMs,
        fromOffsetMinutes: prevOffset,
        toOffsetMinutes: nextOffset,
        direction: nextOffset > prevOffset ? 'spring-forward' : 'fall-back',
        gapMinutes: Math.abs(nextOffset - prevOffset),
      });
    }

    prevOffset = nextOffset;
    cursor = next;
  }

  return transitions;
}

/** The first transition at or after `fromMs`, searching the current year and (if needed) the next. */
export function nextDstTransition(zone: string, fromMs: number): DstTransition | undefined {
  const fromYear = DateTime.fromMillis(fromMs, { zone }).year;
  for (const year of [fromYear, fromYear + 1]) {
    const found = findDstTransitions(zone, year).find((t) => t.instantMs >= fromMs);
    if (found) return found;
  }
  return undefined;
}

/** Binary-searches to the minute for the exact instant the offset changes between two millisecond timestamps. */
function binarySearchTransitionMs(beforeMs: number, afterMs: number, zone: string): number {
  const startOffset = DateTime.fromMillis(beforeMs, { zone }).offset;
  let lo = beforeMs;
  let hi = afterMs;

  while (hi - lo > 60_000) {
    const mid = Math.floor((lo + hi) / 2);
    const midOffset = DateTime.fromMillis(mid, { zone }).offset;
    if (midOffset === startOffset) lo = mid;
    else hi = mid;
  }

  return hi;
}

/** Formats a UTC offset in minutes as e.g. "+05:30" / "-04:00". */
export function formatOffsetMinutes(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
