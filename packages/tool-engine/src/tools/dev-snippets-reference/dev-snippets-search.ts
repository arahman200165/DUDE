import { SnippetCategory, SnippetEntry } from "./dev-snippets-data.js";

const CATEGORY_ORDER: readonly SnippetCategory[] = [
  'HTTP Headers',
  'Regex Syntax',
  'Git',
  'Docker',
  'PowerShell',
  'Bash',
  'SQL',
  'CSS',
  'HTML',
  'Unicode',
  'MIME Types',
  'Cron',
  'chmod',
];

export interface SnippetGroup {
  readonly category: SnippetCategory;
  readonly entries: readonly SnippetEntry[];
}

/**
 * Filters the snippet table by title/snippet/description/category (case-insensitive substring
 * match) and groups the results by category in a fixed, topic-grouped order. Empty filter text
 * returns everything.
 */
export function filterDevSnippets(data: readonly SnippetEntry[], filterText: string): readonly SnippetGroup[] {
  const normalized = filterText.trim().toLowerCase();

  const matches = (entry: SnippetEntry): boolean => {
    if (normalized === '') return true;
    return (
      entry.title.toLowerCase().includes(normalized) ||
      entry.snippet.toLowerCase().includes(normalized) ||
      entry.description.toLowerCase().includes(normalized) ||
      entry.category.toLowerCase().includes(normalized)
    );
  };

  return CATEGORY_ORDER.map((category) => ({
    category,
    entries: data.filter((entry) => entry.category === category && matches(entry)),
  })).filter((group) => group.entries.length > 0);
}
