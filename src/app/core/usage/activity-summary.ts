import { UsageLogEntry } from './usage.model';
import { SparklinePoint } from '../../shared/components/workbench-charts/sparkline-chart-option';

export interface DailyBucketOptions {
  readonly days: number;
  readonly now: Date;
}

/**
 * Buckets a usage log into one point per day for the trailing `days` days, oldest first, for
 * Home's Activity summary sparkline (DUDE_PRD.md §21 Phase 30D.1/30H.1) — kept pure and outside
 * the component so it's unit-testable without a live `UsageService`. Both the bucket keys and
 * `UsageLogEntry.at` are ISO strings, so slicing to the date portion compares like with like
 * regardless of the caller's local timezone.
 */
export function bucketOpensByDay(log: readonly UsageLogEntry[], options: DailyBucketOptions): SparklinePoint[] {
  const { days, now } = options;
  const counts = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now);
    day.setDate(day.getDate() - i);
    counts.set(day.toISOString().slice(0, 10), 0);
  }
  for (const entry of log) {
    const key = entry.at.slice(0, 10);
    if (counts.has(key)) counts.set(key, counts.get(key)! + 1);
  }
  return [...counts.entries()].map(([date, value]) => ({
    label: new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }),
    value,
  }));
}
