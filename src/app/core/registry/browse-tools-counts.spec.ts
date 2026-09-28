import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { computeCatalogCounts } from './browse-tools-counts';

const noop = () => Promise.resolve();

const FIXTURES: ToolDefinition[] = [
  { id: 'json', title: 'JSON', description: '', category: 'data', keywords: [], route: '/tools/json', load: noop, io: { accepts: [], produces: [] }, status: 'verified' },
  { id: 'jwt', title: 'JWT', description: '', category: 'security', keywords: [], route: '/tools/jwt', load: noop, io: { accepts: [], produces: [] } },
  { id: 'base64', title: 'Base64', description: '', category: 'encoding', keywords: [], route: '/tools/base64', load: noop, io: { accepts: [], produces: [] }, status: 'experimental' },
];

describe('computeCatalogCounts', () => {
  it('counts the full registry and each category, including empty categories', () => {
    const counts = computeCatalogCounts(FIXTURES, { hasWebUnavailableFeature: () => false, isFavorite: () => false });
    expect(counts.all).toBe(3);
    expect(counts.byCategory.data).toBe(1);
    expect(counts.byCategory.security).toBe(1);
    expect(counts.byCategory.encoding).toBe(1);
    expect(counts.byCategory.web).toBe(0);
  });

  it('buckets desktop-only vs browser-safe from hasWebUnavailableFeature', () => {
    const counts = computeCatalogCounts(FIXTURES, { hasWebUnavailableFeature: (id) => id === 'jwt', isFavorite: () => false });
    expect(counts.desktopOnly).toBe(1);
    expect(counts.browserSafe).toBe(2);
  });

  it('counts verified and unstated as separate, non-overlapping buckets', () => {
    const counts = computeCatalogCounts(FIXTURES, { hasWebUnavailableFeature: () => false, isFavorite: () => false });
    expect(counts.verified).toBe(1);
    expect(counts.unstated).toBe(1);
  });

  it('counts favorites from the supplied context', () => {
    const counts = computeCatalogCounts(FIXTURES, { hasWebUnavailableFeature: () => false, isFavorite: (id) => id === 'base64' });
    expect(counts.favorite).toBe(1);
  });
});
