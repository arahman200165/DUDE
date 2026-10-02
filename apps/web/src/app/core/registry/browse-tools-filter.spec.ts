import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { PlatformToolCapability } from "@dude/shared-types/shared/models/tool-capability.model";
import { filterTools, BrowseToolsFilterContext } from "@dude/tool-engine/core/registry/browse-tools-filter";
import { parseBrowseQuery } from "@dude/tool-engine/core/registry/browse-tools-query";

const noop = () => Promise.resolve();

const FIXTURES: ToolDefinition[] = [
  {
    id: 'json',
    title: 'JSON Formatter',
    description: 'Validate, format, and minify JSON.',
    category: 'data',
    keywords: ['json'],
    route: '/tools/json',
    load: noop,
    io: { accepts: ['text'], produces: ['json'] },
    status: 'verified',
  },
  {
    id: 'jwt',
    title: 'JWT Decoder',
    description: 'Decode a JSON Web Token.',
    category: 'security',
    keywords: ['jwt'],
    route: '/tools/jwt',
    load: noop,
    io: { accepts: ['text'], produces: ['json'] },
    capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'Desktop only.' }],
  },
  {
    id: 'base64',
    title: 'Base64',
    description: 'Encode/decode Base64.',
    category: 'encoding',
    keywords: [],
    route: '/tools/base64',
    load: noop,
    io: { accepts: ['text'], produces: ['text'] },
    status: 'experimental',
  },
];

const NO_SIGNALS: BrowseToolsFilterContext = {
  isFavorite: () => false,
  isRecentlyUsed: () => false,
  platformCapabilitiesOf: (id) => FIXTURES.find((f) => f.id === id)?.capabilities?.filter((c): c is PlatformToolCapability => c.kind === 'platform') ?? [],
};

describe('filterTools', () => {
  it('returns every tool for an empty query and no facets', () => {
    expect(filterTools(FIXTURES, parseBrowseQuery(''), NO_SIGNALS).map((t) => t.id)).toEqual(['json', 'jwt', 'base64']);
  });

  it('filters by category', () => {
    const results = filterTools(FIXTURES, parseBrowseQuery('category:security'), NO_SIGNALS);
    expect(results.map((t) => t.id)).toEqual(['jwt']);
  });

  it('filters desktop-enhanced tools via platform:desktop', () => {
    const results = filterTools(FIXTURES, parseBrowseQuery('platform:desktop'), NO_SIGNALS);
    expect(results.map((t) => t.id)).toEqual(['jwt']);
  });

  it('filters browser-safe tools via platform:browser', () => {
    const results = filterTools(FIXTURES, parseBrowseQuery('platform:browser'), NO_SIGNALS);
    expect(results.map((t) => t.id)).toEqual(['json', 'base64']);
  });

  it('treats a tool with no declared status as the unstated bucket, not stable', () => {
    const results = filterTools(FIXTURES, parseBrowseQuery('status:unstated'), NO_SIGNALS);
    expect(results.map((t) => t.id)).toEqual(['jwt']);
  });

  it('filters to favorites only when favorite:true and the context reports a favorite', () => {
    const context: BrowseToolsFilterContext = { ...NO_SIGNALS, isFavorite: (id) => id === 'base64' };
    const results = filterTools(FIXTURES, parseBrowseQuery('favorite:true'), context);
    expect(results.map((t) => t.id)).toEqual(['base64']);
  });

  it('filters by accepts/produces against io capabilities', () => {
    const results = filterTools(FIXTURES, parseBrowseQuery('produces:json'), NO_SIGNALS);
    expect(results.map((t) => t.id)).toEqual(['json', 'jwt']);
  });

  it('combines a category facet with free-text search', () => {
    const results = filterTools(FIXTURES, parseBrowseQuery('category:data json'), NO_SIGNALS);
    expect(results.map((t) => t.id)).toEqual(['json']);
  });
});
