import { CATEGORY_METADATA } from "@dude/shared-types/shared/models/tool-category.model";
import type { ToolMetadata as ToolDefinition } from "@dude/domain/shared/models/tool-metadata.model";

// Ranking tiers, highest first — exact/prefix title matches surface above loose
// keyword/category matches per the PRD's "do not overbuild search" guidance.
const enum MatchRank {
  ExactTitle = 0,
  TitlePrefix = 1,
  Substring = 2,
  Keyword = 3,
  Category = 4,
  None = 5,
}

function rankOf(definition: ToolDefinition, query: string): MatchRank {
  const title = definition.title.toLowerCase();

  if (title === query) return MatchRank.ExactTitle;
  if (title.startsWith(query)) return MatchRank.TitlePrefix;
  if (title.includes(query) || definition.description.toLowerCase().includes(query)) {
    return MatchRank.Substring;
  }
  if (definition.keywords.some((keyword) => keyword.toLowerCase().includes(query))) {
    return MatchRank.Keyword;
  }
  if (CATEGORY_METADATA[definition.category].label.toLowerCase().includes(query)) {
    return MatchRank.Category;
  }
  return MatchRank.None;
}

export function searchTools<T extends ToolDefinition>(
  definitions: readonly T[],
  query: string,
): T[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [...definitions];

  return definitions
    .map((definition) => ({ definition, rank: rankOf(definition, trimmed) }))
    .filter(({ rank }) => rank !== MatchRank.None)
    .sort((a, b) => a.rank - b.rank)
    .map(({ definition }) => definition);
}
