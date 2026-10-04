import { TOOL_METADATA } from '@dude/tool-registry';
import { searchTools } from '@dude/tool-engine/core/registry/tool-search';
import type { ToolMetadata } from '@dude/domain/shared/models/tool-metadata.model';
import type { ToolCategory } from '@dude/shared-types/shared/models/tool-category.model';

export const TOOL_BY_ID = new Map(TOOL_METADATA.map(tool => [tool.id, tool]));
export function discoverTools(query: string, category?: ToolCategory): ToolMetadata[] {
  const definitions = category ? TOOL_METADATA.filter(tool => tool.category === category) : TOOL_METADATA;
  const trimmed = query.trim().toLowerCase();
  const ranked = searchTools(definitions, query);
  // Shared search ranks title/description/keyword/category. Stable IDs remain searchable too.
  const seen = new Set(ranked.map(tool => tool.id));
  return [...ranked, ...definitions.filter(tool => !seen.has(tool.id) && tool.id.toLowerCase().includes(trimmed))];
}
