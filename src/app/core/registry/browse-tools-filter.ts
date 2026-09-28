import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { PlatformToolCapability } from '../../shared/models/tool-capability.model';
import { toolStatusLabel } from '../../shared/utils/tool-status';
import { searchTools } from './tool-search';
import { ParsedBrowseQuery } from './browse-tools-query';

/**
 * Plain function hooks Browse Tools' facet/query filtering needs beyond `TOOL_DEFINITIONS` itself —
 * kept as data, not injected services, so `filterTools` stays a pure, easily fixture-tested function
 * (DUDE_PRD.md §21 Phase 30A.3) rather than depending on Angular DI.
 */
export interface BrowseToolsFilterContext {
  readonly isFavorite: (toolId: string) => boolean;
  readonly isRecentlyUsed: (toolId: string) => boolean;
  readonly platformCapabilitiesOf: (toolId: string) => readonly PlatformToolCapability[];
}

/**
 * `criteria` is the already-merged result of the UI's explicit facet controls and the parsed query
 * string (`browse-tools-query.ts`) — the caller decides precedence between an explicit facet and a
 * typed operator; this function only ever applies the final, resolved criteria.
 */
export function filterTools(
  definitions: readonly ToolDefinition[],
  criteria: ParsedBrowseQuery,
  context: BrowseToolsFilterContext,
): ToolDefinition[] {
  const base = criteria.freeText.trim() ? searchTools(definitions, criteria.freeText) : [...definitions];

  return base.filter((tool) => {
    if (criteria.category && tool.category !== criteria.category) return false;

    if (criteria.platform) {
      const enhanced = context.platformCapabilitiesOf(tool.id).length > 0;
      if (criteria.platform === 'desktop' && !enhanced) return false;
      if (criteria.platform === 'browser' && enhanced) return false;
    }

    if (criteria.status && toolStatusLabel(tool.status) !== criteria.status) return false;
    if (criteria.favorite !== undefined && context.isFavorite(tool.id) !== criteria.favorite) return false;
    if (criteria.recent !== undefined && context.isRecentlyUsed(tool.id) !== criteria.recent) return false;
    if (criteria.accepts && !tool.io.accepts.includes(criteria.accepts)) return false;
    if (criteria.produces && !tool.io.produces.includes(criteria.produces)) return false;

    return true;
  });
}
