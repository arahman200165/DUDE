import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'palette-generator',
  title: 'Palette Generator',
  description:
    'Generates complementary, analogous, triadic, tetradic, and monochromatic color palettes from a base color.',
  category: 'encoding',
  keywords: [
    'palette',
    'color scheme',
    'complementary',
    'analogous',
    'triadic',
    'tetradic',
    'monochromatic',
    'color palette',
  ],
  route: '/tools/palette-generator',
  load: () => import('./palette-generator').then((m) => m.PaletteGenerator),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['json'] },
};
