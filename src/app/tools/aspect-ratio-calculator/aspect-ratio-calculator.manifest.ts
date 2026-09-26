import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'aspect-ratio-calculator',
  title: 'Aspect Ratio Calculator',
  description:
    'Simplifies a width/height pair to its lowest-terms ratio (e.g. 1920x1080 -> 16:9), or solves for a missing width/height given a target ratio.',
  category: 'documents',
  keywords: ['aspect ratio', 'ratio calculator', 'simplify ratio', 'width height ratio'],
  route: '/tools/aspect-ratio-calculator',
  load: () => import('./aspect-ratio-calculator').then((m) => m.AspectRatioCalculator),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary:
      'Fuzz-tested (fast-check) the shared simplifyRatio/parseRatio/solveWidthForRatio/solveHeightForRatio core: never throws, preserves the width/height proportion, and a valid parsed ratio round-trips through the solve functions.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
