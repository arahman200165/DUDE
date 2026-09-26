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
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['url'], produces: ['url', 'json'] },
};
