import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'url-normalizer',
  title: 'URL Normalizer & Comparator',
  description:
    'Canonicalizes a URL to its normalized form, resolves a relative reference against a base, or compares two URLs for equivalence.',
  category: 'web',
  keywords: [
    'url',
    'normalize',
    'canonicalize',
    'resolve',
    'relative',
    'compare',
    'equivalence',
    'percent-encoding',
  ],
  route: '/tools/url-normalizer',
  load: () => import('./url-normalizer').then((m) => m.UrlNormalizer),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested (fast-check): normalizeUrl/resolveUrl/compareUrls never throw on arbitrary input, and normalizeUrl is idempotent (re-normalizing its own output never changes it). Bug fixed: stripTrailingSlash only removed one trailing slash, breaking idempotence on multi-slash paths.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['url'], produces: ['url', 'json'] },
};
