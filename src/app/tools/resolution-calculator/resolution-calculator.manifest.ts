import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'resolution-calculator',
  title: 'Resolution Calculator',
  description:
    'Converts a pixel resolution (custom or a named preset like 1080p/4K) into megapixel count and simplified aspect ratio.',
  category: 'documents',
  keywords: ['resolution', 'megapixels', 'screen resolution', '1080p', '4k', 'pixel count'],
  route: '/tools/resolution-calculator',
  load: () => import('./resolution-calculator').then((m) => m.ResolutionCalculator),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary:
      'Fuzz-tested (fast-check) the pure megapixels core: never throws for arbitrary finite dimensions, matches its (w * h) / 1e6 definition exactly, and is commutative in width/height.',
  },
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
