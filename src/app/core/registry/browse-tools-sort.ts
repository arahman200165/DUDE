import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { CATEGORY_METADATA } from '../../shared/models/tool-category.model';

/** Deterministic sort modes for Browse Tools (DUDE_PRD.md §21 Phase 30A.4). */
export type BrowseToolsSortMode = 'recommended' | 'recent' | 'most-used' | 'favorites-first' | 'alpha' | 'category';

export interface BrowseToolsSortContext {
  readonly isFavorite: (toolId: string) => boolean;
  readonly frequencyOf: (toolId: string) => number;
  /** 0 = most recently opened, `Infinity` if never opened. */
  readonly recentRank: (toolId: string) => number;
  /** Higher is more recommended — see `browse-tools-recommend.ts`'s `scoreForRecommendation`. */
  readonly recommendationScore: (tool: ToolDefinition) => number;
}

/** Every comparator falls back to this so ties never reorder unpredictably between renders. */
function byTitleThenId(a: ToolDefinition, b: ToolDefinition): number {
  return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

const COMPARATORS: Readonly<Record<BrowseToolsSortMode, (a: ToolDefinition, b: ToolDefinition, ctx: BrowseToolsSortContext) => number>> = {
  alpha: (a, b) => byTitleThenId(a, b),
  category: (a, b) => CATEGORY_METADATA[a.category].label.localeCompare(CATEGORY_METADATA[b.category].label) || byTitleThenId(a, b),
  'favorites-first': (a, b, ctx) => Number(ctx.isFavorite(b.id)) - Number(ctx.isFavorite(a.id)) || byTitleThenId(a, b),
  'most-used': (a, b, ctx) => ctx.frequencyOf(b.id) - ctx.frequencyOf(a.id) || byTitleThenId(a, b),
  recent: (a, b, ctx) => ctx.recentRank(a.id) - ctx.recentRank(b.id) || byTitleThenId(a, b),
  recommended: (a, b, ctx) => ctx.recommendationScore(b) - ctx.recommendationScore(a) || byTitleThenId(a, b),
};

export function sortTools(tools: readonly ToolDefinition[], mode: BrowseToolsSortMode, context: BrowseToolsSortContext): ToolDefinition[] {
  return [...tools].sort((a, b) => COMPARATORS[mode](a, b, context));
}
