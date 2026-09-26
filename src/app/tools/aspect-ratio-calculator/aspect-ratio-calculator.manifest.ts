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
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
