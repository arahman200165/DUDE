/**
 * Local-calendar-day helpers for daily usage buckets (DUDE_PRD.md §21 Phase 30H.2). A day key is
 * `YYYY-MM-DD` in the *local* timezone. Stepping between days uses calendar arithmetic anchored at
 * local noon rather than subtracting 24h, so DST transitions (23h/25h days) never skip or repeat a day.
 */

export const LOCAL_DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function localDayKey(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parses a day key to a `Date` at local noon; `null` for malformed or impossible dates (e.g. 2026-02-31). */
export function parseLocalDay(key: string): Date | null {
  if (!LOCAL_DAY_KEY_PATTERN.test(key)) return null;
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  return localDayKey(date) === key ? date : null;
}

export function addLocalDays(key: string, delta: number): string {
  const date = parseLocalDay(key);
  if (!date) throw new RangeError(`Invalid local day key: ${key}`);
  date.setDate(date.getDate() + delta);
  return localDayKey(date);
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function localDaysBetween(from: string, to: string): number {
  const a = parseLocalDay(from);
  const b = parseLocalDay(to);
  if (!a || !b) throw new RangeError(`Invalid local day key: ${from} / ${to}`);
  // Both are local noon, so the difference is a whole number of days modulo a DST hour.
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
