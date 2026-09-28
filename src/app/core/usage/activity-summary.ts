import { DailyUsageBucket, UsageCount } from './usage.model';
import { addLocalDays, localDayKey, localDaysBetween, parseLocalDay } from './local-day';
import { ToolCategory } from '../../shared/models/tool-category.model';

export interface ActivityDay {
  readonly date: string;
  /** Short local weekday, e.g. "Mon". */
  readonly label: string;
  /** Opens that day, or `null` when the day predates reliable tracking ("not tracked", never zero). */
  readonly opens: number | null;
  readonly perTool: Readonly<Record<string, number>>;
}

export interface ActivityPeriod {
  /** One entry per local calendar day, oldest first, ending today. */
  readonly days: readonly ActivityDay[];
  /** Opens over the tracked days only — the same days the chart draws as counted. */
  readonly totalOpens: number;
  /** Distinct tool ids opened on the tracked days. */
  readonly uniqueTools: number;
  /** False until every day of the window falls after the tracking start day. */
  readonly complete: boolean;
  /** Local day reliable tracking began, or `null` if nothing has been tracked yet. */
  readonly since: string | null;
  /** Tool id → opens over the tracked days (for a time-bounded category/tool ranking). */
  readonly toolCounts: Readonly<Record<string, number>>;
}

export interface ActivityPeriodOptions {
  readonly days: number;
  readonly now: Date;
  /** Ignore tool ids that are no longer in the registry (removed tools). */
  readonly isKnownTool?: (toolId: string) => boolean;
}

/**
 * Selects the trailing `days` local calendar days for Home's trend/summary (DUDE_PRD.md §21 Phase
 * 30H.2). Days before `trackingStartedOn` are "not tracked" (`opens: null`); days on/after it with
 * no bucket are a real zero. The period is `complete` only once the tracking start day is at least
 * `days` days before today, i.e. every day in the window was tracked from the day after the start.
 * Total, unique tools and per-tool counts all cover exactly the tracked days, so they can never
 * disagree with the chart.
 */
export function selectActivityPeriod(
  buckets: readonly DailyUsageBucket[],
  trackingStartedOn: string | null,
  options: ActivityPeriodOptions,
): ActivityPeriod {
  const { days, now, isKnownTool } = options;
  const today = localDayKey(now);
  const byDate = new Map(buckets.map((b) => [b.date, b]));
  const toolCounts: Record<string, number> = {};
  let totalOpens = 0;

  const result: ActivityDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addLocalDays(today, -i);
    const label = parseLocalDay(date)!.toLocaleDateString(undefined, { weekday: 'short' });
    const tracked = trackingStartedOn !== null && date >= trackingStartedOn;
    if (!tracked) {
      result.push({ date, label, opens: null, perTool: {} });
      continue;
    }
    const bucket = byDate.get(date);
    const perTool = bucket?.perTool ?? {};
    result.push({ date, label, opens: bucket?.opens ?? 0, perTool });
    totalOpens += bucket?.opens ?? 0;
    for (const [id, n] of Object.entries(perTool)) {
      if (isKnownTool && !isKnownTool(id)) continue;
      toolCounts[id] = (toolCounts[id] ?? 0) + n;
    }
  }

  const complete = trackingStartedOn !== null && localDaysBetween(trackingStartedOn, today) >= days;
  return {
    days: result,
    totalOpens,
    uniqueTools: Object.keys(toolCounts).length,
    complete,
    since: trackingStartedOn,
    toolCounts,
  };
}

export interface CategoryUsage {
  readonly category: ToolCategory;
  readonly opens: number;
}

/**
 * Ranks categories by summed opens, descending (ties broken by category id for stable order).
 * `categoryOf` comes from the registry, so there is no hand-maintained tool→category mapping.
 */
export function rankCategoryUsage(
  toolCounts: Readonly<Record<string, number>>,
  categoryOf: (toolId: string) => ToolCategory | undefined,
): CategoryUsage[] {
  const totals = new Map<ToolCategory, number>();
  for (const [id, n] of Object.entries(toolCounts)) {
    const category = categoryOf(id);
    if (category !== undefined && n > 0) totals.set(category, (totals.get(category) ?? 0) + n);
  }
  return [...totals.entries()]
    .map(([category, opens]) => ({ category, opens }))
    .sort((a, b) => b.opens - a.opens || a.category.localeCompare(b.category));
}

/** Lifetime per-tool counts from `UsageStore.counts`, as a plain id → opens record. */
export function lifetimeToolCounts(counts: Readonly<Record<string, UsageCount>>): Record<string, number> {
  return Object.fromEntries(Object.entries(counts).map(([id, c]) => [id, c.count]));
}
