import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { TOOL_CATEGORIES } from '../../shared/models/tool-category.model';
import { parseBrowseQuery } from './browse-tools-query';
import { filterTools } from './browse-tools-filter';
import { sortTools } from './browse-tools-sort';
import { computeCatalogCounts } from './browse-tools-counts';

const noop = () => Promise.resolve();

/**
 * Browse Tools' exit criteria (DUDE_PRD.md §21 Phase 30A) requires the surface to "remain usable
 * with a synthetic 1,000-tool registry where practical." This exercises the pure filter/sort/count
 * pipeline (the part a unit test can actually measure) against a synthetic registry well past
 * today's real size, so a future accidental O(n²) doesn't regress unnoticed.
 */
function syntheticRegistry(count: number): ToolDefinition[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `synthetic-${i}`,
    title: `Synthetic Tool ${i}`,
    description: 'A synthetic fixture tool for scale testing.',
    category: TOOL_CATEGORIES[i % TOOL_CATEGORIES.length],
    keywords: ['synthetic'],
    route: `/tools/synthetic-${i}`,
    load: noop,
    io: { accepts: ['text'], produces: ['text'] },
    status: i % 3 === 0 ? 'verified' : undefined,
  }));
}

describe('Browse Tools pure pipeline at synthetic scale', () => {
  const REGISTRY = syntheticRegistry(1000);
  const CONTEXT = {
    isFavorite: (id: string) => id === 'synthetic-1',
    isRecentlyUsed: () => false,
    platformCapabilitiesOf: () => [],
  };

  it('filters, sorts, and counts 1,000 tools well within an interactive time budget', () => {
    const start = performance.now();

    const filtered = filterTools(REGISTRY, parseBrowseQuery('category:data'), CONTEXT);
    const sorted = sortTools(filtered, 'recommended', {
      isFavorite: CONTEXT.isFavorite,
      frequencyOf: () => 0,
      recentRank: () => Infinity,
      recommendationScore: () => 0,
    });
    const counts = computeCatalogCounts(REGISTRY, { hasWebUnavailableFeature: () => false, isFavorite: CONTEXT.isFavorite });

    const elapsedMs = performance.now() - start;

    expect(sorted.length).toBe(filtered.length);
    expect(counts.all).toBe(1000);
    expect(elapsedMs).toBeLessThan(200);
  });
});
