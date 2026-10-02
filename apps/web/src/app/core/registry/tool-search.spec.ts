import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { searchTools } from "@dude/tool-engine/core/registry/tool-search";

const noop = () => Promise.resolve();

const FIXTURES: ToolDefinition[] = [
  {
    id: 'json',
    title: 'JSON Formatter',
    description: 'Validate, format, and minify JSON.',
    category: 'data',
    keywords: ['json', 'pretty', 'minify'],
    route: '/tools/json',
    load: noop,
    io: { accepts: ['text'], produces: ['text'] },
  },
  {
    id: 'regex',
    title: 'Regex Tester',
    description: 'Test regular expressions against sample text.',
    category: 'developer',
    keywords: ['regex', 'pattern', 'json-like'],
    route: '/tools/regex',
    load: noop,
    io: { accepts: ['text'], produces: ['text'] },
  },
];

describe('searchTools', () => {
  it('returns the full set unfiltered for an empty query', () => {
    expect(searchTools(FIXTURES, '')).toEqual(FIXTURES);
  });

  it('ranks an exact title match above a substring match', () => {
    const results = searchTools(FIXTURES, 'json formatter');
    expect(results[0].id).toBe('json');
  });

  it('surfaces a tool via keyword match even when the title does not match', () => {
    const results = searchTools(FIXTURES, 'pattern');
    expect(results.map((r) => r.id)).toEqual(['regex']);
  });

  it('surfaces tools in a category via a category-label match', () => {
    const results = searchTools(FIXTURES, 'data');
    expect(results.map((r) => r.id)).toEqual(['json']);
  });

  it('excludes tools with no match at all', () => {
    expect(searchTools(FIXTURES, 'nonexistent')).toEqual([]);
  });
});
