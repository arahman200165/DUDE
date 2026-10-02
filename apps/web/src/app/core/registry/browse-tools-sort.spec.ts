import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { BrowseToolsSortContext, sortTools } from "@dude/tool-engine/core/registry/browse-tools-sort";

const noop = () => Promise.resolve();

const TOOLS: ToolDefinition[] = [
  { id: 'b', title: 'Beta Tool', description: '', category: 'data', keywords: [], route: '/tools/b', load: noop, io: { accepts: [], produces: [] } },
  { id: 'a', title: 'Alpha Tool', description: '', category: 'text', keywords: [], route: '/tools/a', load: noop, io: { accepts: [], produces: [] } },
  { id: 'c', title: 'Charlie Tool', description: '', category: 'data', keywords: [], route: '/tools/c', load: noop, io: { accepts: [], produces: [] } },
];

const BASE_CONTEXT: BrowseToolsSortContext = {
  isFavorite: () => false,
  frequencyOf: () => 0,
  recentRank: () => Infinity,
  recommendationScore: () => 0,
};

describe('sortTools', () => {
  it('sorts alpha by title, tie-breaking by id', () => {
    expect(sortTools(TOOLS, 'alpha', BASE_CONTEXT).map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts category by category label, then title within a category', () => {
    // data: Beta Tool, Charlie Tool; text: Alpha Tool -- "Data" < "Text" alphabetically.
    expect(sortTools(TOOLS, 'category', BASE_CONTEXT).map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('puts favorites first, stable-sorting the rest alphabetically', () => {
    const context = { ...BASE_CONTEXT, isFavorite: (id: string) => id === 'c' };
    expect(sortTools(TOOLS, 'favorites-first', context).map((t) => t.id)).toEqual(['c', 'a', 'b']);
  });

  it('sorts most-used by descending frequency', () => {
    const context = { ...BASE_CONTEXT, frequencyOf: (id: string) => ({ a: 1, b: 5, c: 2 })[id] ?? 0 };
    expect(sortTools(TOOLS, 'most-used', context).map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts recent by ascending recentRank, never-opened tools last', () => {
    const context = { ...BASE_CONTEXT, recentRank: (id: string) => ({ a: 2, b: 0 })[id] ?? Infinity };
    expect(sortTools(TOOLS, 'recent', context).map((t) => t.id)).toEqual(['b', 'a', 'c']);
  });

  it('sorts recommended by descending recommendation score', () => {
    const context = { ...BASE_CONTEXT, recommendationScore: (tool: ToolDefinition) => ({ a: 10, b: 50, c: 30 })[tool.id] ?? 0 };
    expect(sortTools(TOOLS, 'recommended', context).map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('never mutates the input array', () => {
    const copy = [...TOOLS];
    sortTools(TOOLS, 'alpha', BASE_CONTEXT);
    expect(TOOLS).toEqual(copy);
  });
});
