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
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['json'] },
};
