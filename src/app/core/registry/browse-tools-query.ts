import { ToolCategory, TOOL_CATEGORIES } from '../../shared/models/tool-category.model';
import { DudeDataType, DUDE_DATA_TYPES } from '../../shared/models/tool-io.model';

/**
 * Browse Tools' optional power-user query syntax (DUDE_PRD.md §21 Phase 30A.3):
 * `category:security jwt`, `platform:desktop tls`, `status:verified csv`, `favorite:true`,
 * `accepts:json`, `produces:table`. Plain text search must remain sufficient on its own, and an
 * unrecognized or malformed `key:value` token degrades to being treated as ordinary free text
 * rather than throwing or dropping the rest of the query — see `browse-query-help` for the syntax
 * documented compactly in the UI.
 */
export interface ParsedBrowseQuery {
  readonly freeText: string;
  readonly category?: ToolCategory;
  readonly platform?: 'browser' | 'desktop';
  /** `'unstated'` matches a tool with no declared `status` — never silently folded into `stable`. */
  readonly status?: 'experimental' | 'stable' | 'verified' | 'unstated';
  readonly favorite?: boolean;
  readonly recent?: boolean;
  readonly accepts?: DudeDataType;
  readonly produces?: DudeDataType;
}

const STATUS_VALUES = ['experimental', 'stable', 'verified', 'unstated'] as const;
const PLATFORM_VALUES = ['browser', 'desktop'] as const;

export function parseBrowseQuery(raw: string): ParsedBrowseQuery {
  const freeTextTokens: string[] = [];
  let category: ToolCategory | undefined;
  let platform: 'browser' | 'desktop' | undefined;
  let status: ParsedBrowseQuery['status'];
  let favorite: boolean | undefined;
  let recent: boolean | undefined;
  let accepts: DudeDataType | undefined;
  let produces: DudeDataType | undefined;

  for (const token of raw.trim().split(/\s+/).filter(Boolean)) {
    const colonIndex = token.indexOf(':');
    const key = colonIndex > 0 ? token.slice(0, colonIndex).toLowerCase() : '';
    const value = colonIndex > 0 ? token.slice(colonIndex + 1) : '';

    if (key === 'category' && TOOL_CATEGORIES.includes(value as ToolCategory)) {
      category = value as ToolCategory;
    } else if (key === 'platform' && (PLATFORM_VALUES as readonly string[]).includes(value)) {
      platform = value as 'browser' | 'desktop';
    } else if (key === 'status' && (STATUS_VALUES as readonly string[]).includes(value)) {
      status = value as ParsedBrowseQuery['status'];
    } else if (key === 'favorite' && (value === 'true' || value === 'false')) {
      favorite = value === 'true';
    } else if (key === 'recent' && (value === 'true' || value === 'false')) {
      recent = value === 'true';
    } else if (key === 'accepts' && DUDE_DATA_TYPES.includes(value as DudeDataType)) {
      accepts = value as DudeDataType;
    } else if (key === 'produces' && DUDE_DATA_TYPES.includes(value as DudeDataType)) {
      produces = value as DudeDataType;
    } else {
      freeTextTokens.push(token);
    }
  }

  return { freeText: freeTextTokens.join(' '), category, platform, status, favorite, recent, accepts, produces };
}
