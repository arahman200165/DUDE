import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'tailwind-color-matcher',
  title: 'Tailwind Color Matcher',
  description:
    'Finds the nearest Tailwind CSS v4 default-palette colors to an arbitrary color, ranked by OKLab perceptual distance.',
  category: 'encoding',
  keywords: [
    'tailwind',
    'color matcher',
    'nearest color',
    'palette',
    'oklch',
    'oklab',
    'design tokens',
  ],
  route: '/tools/tailwind-color-matcher',
  load: () => import('./tailwind-color-matcher').then((m) => m.TailwindColorMatcher),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Property-tested (fast-check): findClosestTailwindColors returns exactly `limit` matches ranked by non-decreasing OKLab distance with well-formed classNames, deterministically, across the color space; fuzz-tested against arbitrary text input.',
  },
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['json'] },
};
