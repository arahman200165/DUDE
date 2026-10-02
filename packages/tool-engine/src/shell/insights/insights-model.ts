import { ActivityPeriod, CategoryUsage } from "../../core/usage/activity-summary.js";
import { parseLocalDay } from "@dude/domain/core/usage/local-day";
import { UnifiedActivityEntry } from "@dude/domain/core/recents/unified-recents.model";
import { BarChartInput } from "../../shared/components/workbench-charts/bar-chart-option.js";
import { CATEGORY_METADATA, ToolCategory } from "@dude/shared-types/shared/models/tool-category.model";

/**
 * Pure derivations behind Home's and `/insights`'s local workbench insights (DUDE_PRD.md §21
 * Phase 30H) — kept outside the components so they're unit-testable without a TestBed. Everything
 * here is a read-only view over already-recorded, content-free usage data.
 */

export function formatRelativeTime(iso: string, now: Date): string {
  const then = new Date(iso);
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (Number.isNaN(seconds)) return '';
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return then.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function pluralOpens(n: number): string {
  return `${n} ${n === 1 ? 'open' : 'opens'}`;
}

function dayLabel(date: string): string {
  return parseLocalDay(date)!.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** One bar per local day; untracked days are `null` (drawn as no bar, shown as "–"), never zero. */
export function buildTrendBars(period: ActivityPeriod): BarChartInput[] {
  const todayDate = period.days.at(-1)?.date;
  return period.days.map((day) => {
    const when = `${dayLabel(day.date)}${day.date === todayDate ? ' (today)' : ''}`;
    return {
      label: day.label,
      value: day.opens,
      detail: day.opens === null ? `${when}: not tracked` : `${when}: ${pluralOpens(day.opens)}`,
    };
  });
}

/** The period's total, labeled partial with its tracking start until the whole window is tracked. */
export function describePeriod(period: ActivityPeriod): string {
  if (period.since === null) return 'No opens tracked yet.';
  const total = pluralOpens(period.totalOpens);
  if (period.complete) return `${total} in the last ${period.days.length} days`;
  return `${total} · partial period, tracked since ${dayLabel(period.since)}`;
}

export interface SummaryTile {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly note?: string;
}

export interface SummaryInput {
  readonly period: ActivityPeriod;
  readonly topCategory: CategoryUsage | undefined;
  readonly topTool: { readonly title: string; readonly uses: number } | undefined;
  readonly favoriteCount: number;
  readonly pinnedPipelineCount: number;
  /** `undefined` off desktop — projects/workspaces are desktop-only, so the tile is omitted. */
  readonly recent: { readonly projects: number; readonly workspaces: number } | undefined;
}

/** Only metrics with a clear practical interpretation; no scores, streaks or engagement figures. */
export function buildSummaryTiles(input: SummaryInput): SummaryTile[] {
  const { period, topCategory, topTool, favoriteCount, pinnedPipelineCount, recent } = input;
  const partialNote = period.complete ? undefined : period.since ? 'partial period' : 'nothing tracked yet';
  const tiles: SummaryTile[] = [
    { key: 'opens', label: `Opens, ${period.days.length}d`, value: String(period.totalOpens), note: partialNote },
    { key: 'unique', label: `Unique tools, ${period.days.length}d`, value: String(period.uniqueTools), note: partialNote },
  ];
  if (topCategory) {
    tiles.push({ key: 'top-category', label: 'Top category', value: CATEGORY_METADATA[topCategory.category].label, note: `lifetime · ${topCategory.opens}` });
  }
  if (topTool) {
    tiles.push({ key: 'top-tool', label: 'Top tool', value: topTool.title, note: `lifetime · ${topTool.uses}` });
  }
  tiles.push({ key: 'favorites', label: 'Favorites', value: String(favoriteCount) });
  tiles.push({ key: 'pinned-pipelines', label: 'Pinned pipelines', value: String(pinnedPipelineCount) });
  if (recent) {
    tiles.push({ key: 'recent-resume', label: 'Recent projects · workspaces', value: `${recent.projects} · ${recent.workspaces}` });
  }
  return tiles;
}

export interface CategoryBarRow {
  readonly category: ToolCategory;
  readonly label: string;
  readonly opens: number;
  readonly colorToken: string;
}

export function toCategoryBarRows(ranked: readonly CategoryUsage[], limit: number): CategoryBarRow[] {
  return ranked.slice(0, limit).map(({ category, opens }) => ({
    category,
    label: CATEGORY_METADATA[category].label,
    opens,
    colorToken: `--color-${CATEGORY_METADATA[category].colorToken}`,
  }));
}

export interface TopToolRow {
  readonly id: string;
  readonly title: string;
  readonly route: string;
  readonly category: ToolCategory;
  readonly categoryLabel: string;
  /** Lifetime opens. */
  readonly uses: number;
  /** ISO timestamp of the last open, for sorting; display with `formatRelativeTime`. */
  readonly lastUsedAt: string;
}

export interface LifetimeUsageEntry {
  readonly toolId: string;
  readonly count: number;
  readonly lastUsedAt: string;
}

export interface ToolLookup {
  readonly title: string;
  readonly route: string;
  readonly category: ToolCategory;
}

/** Ranks by lifetime uses (ties: most recently used first), dropping tool ids no longer in the registry. */
export function buildTopToolRows(
  entries: readonly LifetimeUsageEntry[],
  lookup: (toolId: string) => ToolLookup | undefined,
  limit: number,
): TopToolRow[] {
  const rows: TopToolRow[] = [];
  for (const entry of entries) {
    const tool = lookup(entry.toolId);
    if (!tool) continue;
    rows.push({
      id: entry.toolId,
      title: tool.title,
      route: tool.route,
      category: tool.category,
      categoryLabel: CATEGORY_METADATA[tool.category].label,
      uses: entry.count,
      lastUsedAt: entry.lastUsedAt,
    });
  }
  rows.sort((a, b) => b.uses - a.uses || (a.lastUsedAt < b.lastUsedAt ? 1 : a.lastUsedAt > b.lastUsedAt ? -1 : 0));
  return rows.slice(0, limit);
}

export interface RecentActivityRow {
  readonly key: string;
  readonly typeLabel: string;
  readonly item: string;
  readonly context: string;
  readonly at: string;
  readonly entry: UnifiedActivityEntry;
}

export interface RecentActivityLookups {
  readonly categoryLabel: (toolId: string) => string | undefined;
}

/**
 * Rows over Unified Recents' real-event view. Native files show only the file name the Native File
 * Recent List already retains — never the path — and no new content-bearing field is introduced.
 */
export function buildRecentActivityRows(
  entries: readonly UnifiedActivityEntry[],
  lookups: RecentActivityLookups,
  limit: number,
): RecentActivityRow[] {
  return entries.slice(0, limit).map((entry, index): RecentActivityRow => {
    switch (entry.kind) {
      case 'tool':
        return { key: `tool:${entry.toolId}`, typeLabel: 'Tool', item: entry.title, context: lookups.categoryLabel(entry.toolId) ?? '', at: entry.at, entry };
      case 'pipeline':
        return { key: `pipeline:${entry.pipelineId}`, typeLabel: 'Pipeline', item: entry.title, context: 'Last run', at: entry.at, entry };
      case 'history':
        return { key: `history:${entry.entryId}`, typeLabel: 'History', item: entry.title, context: 'Saved state', at: entry.at, entry };
      case 'native-file':
        return { key: `native-file:${index}`, typeLabel: 'File', item: entry.title, context: 'Opened from disk', at: entry.at, entry };
    }
  });
}
