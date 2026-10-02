export type ToolCategory =
  | 'data'
  | 'text'
  | 'encoding'
  | 'security'
  | 'date-time'
  | 'web'
  | 'developer'
  | 'documents';

export interface ToolCategoryMeta {
  readonly label: string;
  /** Suffix used to build the `cat-*` Tailwind utilities/tokens, e.g. `cat-data`. */
  readonly colorToken: string;
  /** Glyph key consumed by `CategoryIcon` — one per category, reuses the category id itself. */
  readonly icon: ToolCategory;
}

export const CATEGORY_METADATA: Record<ToolCategory, ToolCategoryMeta> = {
  data: { label: 'Data', colorToken: 'cat-data', icon: 'data' },
  text: { label: 'Text', colorToken: 'cat-text', icon: 'text' },
  encoding: { label: 'Encoding', colorToken: 'cat-encoding', icon: 'encoding' },
  security: { label: 'Security', colorToken: 'cat-security', icon: 'security' },
  'date-time': { label: 'Date & Time', colorToken: 'cat-date-time', icon: 'date-time' },
  web: { label: 'Web', colorToken: 'cat-web', icon: 'web' },
  developer: { label: 'Developer', colorToken: 'cat-developer', icon: 'developer' },
  documents: { label: 'Documents', colorToken: 'cat-documents', icon: 'documents' },
};

export const TOOL_CATEGORIES: readonly ToolCategory[] = Object.keys(CATEGORY_METADATA) as ToolCategory[];
