import { describe, expect, it } from 'vitest';
import { DEV_SNIPPETS } from "./dev-snippets-data.js";
import { filterDevSnippets } from "./dev-snippets-search.js";

describe('filterDevSnippets', () => {
  it('returns every entry grouped by category when the filter is empty', () => {
    const groups = filterDevSnippets(DEV_SNIPPETS, '');
    const total = groups.reduce((sum, g) => sum + g.entries.length, 0);
    expect(total).toBe(DEV_SNIPPETS.length);
    expect(groups.every((g) => g.entries.length > 0)).toBe(true);
  });

  it('matches by title, snippet, description, or category, case-insensitively', () => {
    expect(filterDevSnippets(DEV_SNIPPETS, 'BEARER').some((g) => g.entries.some((e) => e.title.includes('Bearer')))).toBe(true);
    expect(filterDevSnippets(DEV_SNIPPETS, 'rebase').some((g) => g.entries.some((e) => e.snippet.includes('rebase')))).toBe(true);
    expect(filterDevSnippets(DEV_SNIPPETS, 'docker').every((g) => g.category === 'Docker')).toBe(true);
  });

  it('returns no groups when nothing matches', () => {
    expect(filterDevSnippets(DEV_SNIPPETS, 'zzzznomatch')).toEqual([]);
  });
});
