import { syntheticToolDefinitions } from '../../../testing/synthetic-tool-registry';
import { parseBrowseQuery } from "@dude/tool-engine/core/registry/browse-tools-query";
import { filterTools } from "@dude/tool-engine/core/registry/browse-tools-filter";
import { sortTools } from "@dude/tool-engine/core/registry/browse-tools-sort";
import { computeCatalogCounts } from "@dude/tool-engine/core/registry/browse-tools-counts";

describe.each([500, 1000])('Browse Tools pure pipeline at synthetic scale (%i tools)', (size) => {
  const REGISTRY = syntheticToolDefinitions(size);
  const CONTEXT = {
    isFavorite: (id: string) => id === 'synthetic-tool-0001',
    isRecentlyUsed: () => false,
    platformCapabilitiesOf: () => [],
  };

  it('filters, sorts, and counts the registry well within an interactive time budget', () => {
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
    expect(counts.all).toBe(size);
    expect(elapsedMs).toBeLessThan(200);
  });
});
