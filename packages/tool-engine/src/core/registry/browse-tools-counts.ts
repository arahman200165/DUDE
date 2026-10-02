import { ToolCategory, TOOL_CATEGORIES } from "@dude/shared-types/shared/models/tool-category.model";
import type { ToolMetadata as ToolDefinition } from "@dude/domain/shared/models/tool-metadata.model";

/**
 * Registry-driven catalog counts for Browse Tools' header/facet labels (DUDE_PRD.md §21 Phase
 * 30A.6) — always computed at call time from the live registry/favorites, never a build-time
 * constant, so a newly registered tool manifest is reflected with no regeneration step.
 */
export interface CatalogCounts {
  readonly all: number;
  readonly byCategory: Readonly<Record<ToolCategory, number>>;
  /** Some declared platform capability is `unavailable` on the web companion. */
  readonly desktopOnly: number;
  /** No declared capability is `unavailable` on the web companion (it may still have a `fallback`). */
  readonly browserSafe: number;
  readonly verified: number;
  /** No `status` declared at all — its own explicit bucket, never folded into `stable`. */
  readonly unstated: number;
  readonly favorite: number;
}

export interface CatalogCountsContext {
  readonly hasWebUnavailableFeature: (toolId: string) => boolean;
  readonly isFavorite: (toolId: string) => boolean;
}

export function computeCatalogCounts(definitions: readonly ToolDefinition[], context: CatalogCountsContext): CatalogCounts {
  const byCategory = Object.fromEntries(TOOL_CATEGORIES.map((category) => [category, 0])) as Record<ToolCategory, number>;
  let desktopOnly = 0;
  let browserSafe = 0;
  let verified = 0;
  let unstated = 0;
  let favorite = 0;

  for (const tool of definitions) {
    byCategory[tool.category]++;

    if (context.hasWebUnavailableFeature(tool.id)) desktopOnly++;
    else browserSafe++;

    if (tool.status === 'verified') verified++;
    if (tool.status === undefined) unstated++;
    if (context.isFavorite(tool.id)) favorite++;
  }

  return { all: definitions.length, byCategory, desktopOnly, browserSafe, verified, unstated, favorite };
}
