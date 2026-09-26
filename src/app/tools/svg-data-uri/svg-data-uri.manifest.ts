import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'svg-data-uri',
  title: 'SVG ↔ Data URI',
  description: 'Converts SVG markup to a data:image/svg+xml URI (URL-encoded or base64) and back.',
  category: 'encoding',
  keywords: ['svg', 'data uri', 'base64', 'encode', 'decode', 'css background'],
  route: '/tools/svg-data-uri',
  load: () => import('./svg-data-uri').then((m) => m.SvgDataUri),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
