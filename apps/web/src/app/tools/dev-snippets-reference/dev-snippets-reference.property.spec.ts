import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { DEV_SNIPPETS } from "@dude/tool-engine/tools/dev-snippets-reference/dev-snippets-data";
import { filterDevSnippets } from "@dude/tool-engine/tools/dev-snippets-reference/dev-snippets-search";

describe('dev-snippets-reference properties', () => {
  it('filters every result by the case-insensitive query and preserves category grouping', () => invariant((query: string) => filterDevSnippets(DEV_SNIPPETS, query), fc.string({ maxLength: 50 }), (groups, query) => { const q = query.trim().toLowerCase(); const entries = groups.flatMap((g) => g.entries); return entries.every((entry) => entry.category.length > 0 && (q === '' || [entry.title, entry.snippet, entry.description, entry.category].some((v) => v.toLowerCase().includes(q)))) && groups.every((g, i) => i === 0 || g.category !== groups[i - 1].category); }));
  it('handles arbitrary search text without throwing', () => neverThrows((query: string) => filterDevSnippets(DEV_SNIPPETS, query), fc.string({ maxLength: 100 })));
});
